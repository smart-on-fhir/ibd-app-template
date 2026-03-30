import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import type { Bundle, FhirResource, Patient }         from 'fhir/r4';
import type { PatientSummary }                from '../types';
import { fetchAllPatientData, fetchPatients } from '../utils/fhir';
import buildPatientSummary                    from '../utils/patientSummary';
import { summarize }                          from '../utils/summarizer';
import { modelFactory }                       from '../data/index';
import type { Database }                      from '../data/types';
import useLocalStorage                        from '../hooks/useLocalStorage';


export interface PatientContextType {
    
    /** Indicates if the patients are currently being loaded */
    patientsLoading: boolean;

    /** Indicates if the selected patient is currently being loaded */
    selectedPatientLoading: boolean;
    
    /** All the patients we have access to */
    patients: Patient[];

    /** The currently selected patient */
    selectedPatient: Patient | null;

    /** Resources associated with the selected patient */
    selectedPatientResources: Record<string, FhirResource[]>;

    aiContext: Record<string, string[]>;
    
    /** Summary information for the selected patient */
    selectedPatientSummary: PatientSummary | null;

    /** Total byte size of the selected patient's record */
    selectedPatientRecordByteSize: number;

    /** The in-memory database for the selected patient */
    database: Database | null;
    
    /** Loads the list of patients */
    loadPatients: (baseUrl?: string) => Promise<void>;

    /** Sets the currently selected patient */
    setSelectedPatient: (patientOrId: Patient | string | null) => void;

    /** Sets the resources associated with the selected patient */
    setSelectedPatientResources: React.Dispatch<React.SetStateAction<Record<string, FhirResource[]>>>;

    /** Sets the summary information for the selected patient */
    setSelectedPatientSummary: (summary: PatientSummary | null) => void;

    /** Manually loads a patient bundle */
    loadPatientBundle: (bundle: Bundle) => void;
}

const PatientContext = createContext<PatientContextType | null>(null);

export function usePatientContext() {
    const ctx = useContext(PatientContext);
    if (!ctx) throw new Error('usePatientContext must be used inside PatientProvider');
    return ctx;
}

export function PatientProvider({ children }: { children: React.ReactNode }) {
    const [patients                , setPatients                ] = useState<Patient[]>([]);
    const [patientsLoading         , setPatientsLoading         ] = useState(false);
    const [selectedPatientLoading  , setSelectedPatientLoading  ] = useState(false);
    const [selectedPatient         , _setSelectedPatient        ] = useState<Patient | null>(null);
    const [selectedPatientResources, setSelectedPatientResources] = useState<Record<string, FhirResource[]>>({});
    const [aiContext               , setAiContext               ] = useState<Record<string, string[]>>({});
    const [selectedPatientSummary  , setSelectedPatientSummary  ] = useState<PatientSummary | null>(null);
    const [database                , setDatabase                ] = useState<Database | null>(null);
    // const [currentBaseUrl          , setCurrentBaseUrl          ] = useState<string>(FHIR_SERVER);
    const [currentBaseUrl, setCurrentBaseUrl] = useLocalStorage('fhirBaseUrl', "https://r4.smarthealthit.org");
    const [selectedPatientRecordByteSize, setSelectedPatientRecordByteSize] = useState(0);

    // Incrementing counter used to identify the active load operation. When a
    // new load starts we bump this; callbacks ignore updates from previous
    // loads. This avoids duplicate updates caused by React StrictMode
    // invoking effects twice in development.
    const loadCounter = useRef(0);

    // Track patient IDs that are currently loading so we don't start
    // duplicate loads for the same patient (useful when StrictMode causes
    // components to mount/unmount/remount in dev).
    const inFlightLoads = useRef<Set<string>>(new Set());

    async function loadPatients(baseUrl = currentBaseUrl) {
        if (patientsLoading) return;
        setPatientsLoading(true);
        try {
            const pts = await fetchPatients(baseUrl, 500);
            setPatients(pts || []);
            setCurrentBaseUrl(baseUrl);
        } catch (e) {
            console.error('PatientProvider: failed to load patients', e);
        } finally {
            setPatientsLoading(false);
        }
    }

    function setSelectedPatient(patientOrId: Patient | string | null) {
        if (patientOrId === null) {
            _setSelectedPatient(null);
            setSelectedPatientRecordByteSize(0);
            setSelectedPatientResources({});
            setAiContext({});
            setSelectedPatientSummary(null);
            setDatabase(null);
            return;
        }


        if (typeof patientOrId === 'string') {
            if (!selectedPatient || selectedPatient.id !== patientOrId) {
                loadSelectedPatient(patientOrId);
            }
        }
        else {
            if (!selectedPatient || selectedPatient !== patientOrId) {
                _setSelectedPatient(patientOrId);
                loadSelectedPatient(patientOrId.id!);
            }
        }
    }

    async function loadSelectedPatient(patientOrId: Patient | string) {
        // derive patient id up-front and skip if already loading
        const patientIdStr = typeof patientOrId === 'string' ? patientOrId : patientOrId.id;
        if (!patientIdStr) return;
        if (inFlightLoads.current.has(patientIdStr)) {
            console.debug('loadSelectedPatient: already loading', patientIdStr);
            return;
        }
        inFlightLoads.current.add(patientIdStr);
        setSelectedPatientLoading(true);
        try {
            // mark a new load operation
            const loadId = ++loadCounter.current;
            
            // reset current patient data
            setSelectedPatient(null);

            const newDb = {} as Database;

            // let prev: any ={}

            await fetchAllPatientData(currentBaseUrl, {
                id: typeof patientOrId === 'string' ? patientOrId : patientOrId.id,
                useEverything: true,
                throttleMs: 20,
                onPatient(patient) {
                    if (loadCounter.current !== loadId) return;
                    _setSelectedPatient(patient);
                    
                },
                onResource: (type, items) => {
                    if (loadCounter.current !== loadId) return;

                    setSelectedPatientResources((prev) => {
                        const cur = prev[type] || [];
                        const existingIds = new Set(cur.map((r) => (r as any).id));
                        const newItems = items.filter((it) => !existingIds.has((it as any).id));
                        if (!newItems.length) return prev;
                        return { ...prev, [type]: cur.concat(newItems) };
                        // prev = { ...prev, [type]: cur.concat(newItems) };
                    });

                    items.map(resource => {
                        const model = modelFactory(resource);
                        if (model) {
                            const key = resource.resourceType as keyof Database;
                            if (!Array.isArray(newDb[key])) newDb[key] = [];
                            newDb[key].push(model.toJSON() as any);
                        }
                    });

                    setAiContext((prev) => { 
                        const texts = items.map((it) => summarize(it)).filter((t) => t && t.length > 0) as string[];
                        return { ...prev, [type]: (prev[type] || []).concat(texts) };
                    });
                },
                onBytes: (b) => {
                    if (loadCounter.current !== loadId) return;
                    if (typeof b === 'number' && b > 0) setSelectedPatientRecordByteSize((p) => p + b);
                },
            });

            // setSelectedPatientResources(prev)

            setDatabase(newDb);
            // console.log("DB:", newDb);
        } catch (err) {
            console.error('Error fetching patient data:', err);
        } finally {
            inFlightLoads.current.delete(patientIdStr);
            setSelectedPatientLoading(false);
        }
    }

    function loadPatientBundle(bundle: Bundle) {
        setSelectedPatient(null);
        setSelectedPatientResources({});
        setAiContext({});
        setSelectedPatientSummary(null);
        setDatabase(null);

        const patient = bundle.entry?.find((e) => e.resource?.resourceType === 'Patient')?.resource as Patient | undefined;
        if (patient) {
            _setSelectedPatient(patient);


            const resources: Record<string, Map<string, FhirResource>> = {};

            bundle.entry?.forEach((e) => {
                const r = e.resource;
                if (!r) return;

                const map = resources[r.resourceType] || new Map<string, FhirResource>();

                map.set((r as any).id, r);

                resources[r.resourceType] = map;
            });

            setSelectedPatientResources(Object.fromEntries(Object.entries(resources).map(([k, m]) => [k, Array.from(m.values())])));

            const newDb = {} as Database;
            Object.entries(resources).forEach(([_, resMap]) => {
                resMap.forEach((resource) => {
                    const model = modelFactory(resource);
                    if (model) {
                        const key = resource.resourceType as keyof Database;
                        if (!Array.isArray(newDb[key])) newDb[key] = [];
                        newDb[key].push(model.toJSON() as any);
                    }
                });
            });
            setDatabase(newDb);
        }
    }

    // Recompute summary whenever patient or resources update
    useEffect(() => {
        const s = buildPatientSummary(selectedPatient || null, selectedPatientResources);
        setSelectedPatientSummary(s);
    }, [selectedPatient, selectedPatientResources, selectedPatientLoading]);

    // eager load
    // useEffect(() => { loadPatients().catch(() => {}); }, []);

    const value: PatientContextType = {
        patients,
        patientsLoading,
        selectedPatientLoading,
        selectedPatient,
        selectedPatientResources,
        selectedPatientSummary,
        selectedPatientRecordByteSize,
        aiContext,
        database,
        loadPatients,
        setSelectedPatient,
        setSelectedPatientResources,
        setSelectedPatientSummary,
        loadPatientBundle,
    };

    // console.log("aiContext:", JSON.stringify(aiContext, null, 2));
    return <PatientContext.Provider value={value}>{children}</PatientContext.Provider>;
}

export default PatientContext;
