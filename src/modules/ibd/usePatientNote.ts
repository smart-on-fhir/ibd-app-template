import { useState, useEffect }   from 'react';
import { usePatientContext }     from '../../contexts/PatientContext';
import { fetchPatientNote, type PatientNoteResponse } from '../../api/ibd/note';

/**
 * Fetches the NLP-extracted patient note data for the selected patient.
 * In dev (no VITE_CDS_API_URL), returns mock data instantly.
 */
export function usePatientNote() {
    const { selectedPatient } = usePatientContext();
    const patientId = selectedPatient?.id ?? '';

    const [data,    setData]    = useState<PatientNoteResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error,   setError]   = useState<Error | null>(null);

    useEffect(() => {
        if (!patientId) return;
        let cancelled = false;
        setLoading(true);
        fetchPatientNote(patientId)
            .then(d  => { if (!cancelled) { setData(d);  setError(null); } })
            .catch(e => { if (!cancelled) setError(e); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [patientId]);

    return { data, loading, error };
}
