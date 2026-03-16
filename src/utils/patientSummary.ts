import type { Patient, FhirResource } from 'fhir/r4';
import type { PatientSummary } from '../types';
import { formatName } from '.';


function firstIdentifierValue(p?: Patient) {
    if (!p || !p.identifier) return undefined;
    return p.identifier[0]?.value;
}

export function buildPatientSummary(patient: Patient | null, resources: Record<string, FhirResource[]>) : PatientSummary {
    const conditions = (resources['Condition'] || []).map((c: any) => ({
        code: c.code?.text || (c.code?.coding && c.code.coding[0]?.display) || undefined,
        clinicalStatus: c.clinicalStatus?.coding?.[0]?.code || c.clinicalStatus || undefined,
        onset: c.onsetDateTime || c.onsetAge || undefined,
    }));

    const meds: Array<{ name?: string; status?: string; authoredOn?: string }> = [];
    const medSources = ['MedicationStatement', 'MedicationRequest', 'MedicationAdministration', 'MedicationDispense'];
    medSources.forEach((k) => {
        (resources[k] || []).forEach((m: any) => {
            const name = m.medicationCodeableConcept?.text || m.medicationCodeableConcept?.coding?.[0]?.display || m.medicationReference?.display;
            meds.push({ name, status: m.status || m.intent || undefined, authoredOn: m.authoredOn || m.effectiveDateTime || undefined });
        });
    });

    const allergies = (resources['AllergyIntolerance'] || []).map((a: any) => a.code?.text || a.code?.coding?.[0]?.display || 'Allergy');

    const observations: Record<string, { value?: string; unit?: string; date?: string }> = {};
    (resources['Observation'] || []).forEach((o: any) => {
        const code = o.code?.text || o.code?.coding?.[0]?.display || o.code?.coding?.[0]?.code || 'observation';
        const datetime = o.effectiveDateTime || o.issued;
        let value: string | undefined;
        let unit: string | undefined;
        if (o.valueQuantity) {
            value = String(o.valueQuantity.value);
            unit = o.valueQuantity.unit;
        } else if (o.valueString) {
            value = o.valueString;
        } else if (o.component && Array.isArray(o.component)) {
            // blood pressure and multi-component observations
            const comps = o.component.map((c: any) => {
                const v = c.valueQuantity ? `${c.valueQuantity.value}${c.valueQuantity.unit || ''}` : c.valueString || '';
                const lab = c.code?.text || c.code?.coding?.[0]?.display || c.code?.coding?.[0]?.code;
                return `${lab}: ${v}`;
            });
            value = comps.join('; ');
        }

        // keep the most recent per code
        const prev = observations[code];
        if (!prev || (prev.date && datetime && datetime > prev.date) || (!prev.date && datetime)) {
            observations[code] = { value, unit, date: datetime };
        }
    });

    const immunizationsCount = (resources['Immunization'] || []).length;

    const encounters = (resources['Encounter'] || []).slice();
    let lastEncounter: { date?: string; type?: string } | undefined;
    if (encounters.length) {
        encounters.sort((a: any, b: any) => {
            const da = a.period?.start || a.period?.end || a.ended || '';
            const db = b.period?.start || b.period?.end || b.ended || '';
            return db.localeCompare(da);
        });
        const e = encounters[0] as any;
        lastEncounter = { date: e.period?.start || e.period?.end || e.ended || undefined, type: e.type?.[0]?.text || e.class?.display || undefined };
    }

    const totalResources = Object.values(resources).reduce((s, arr) => s + (arr?.length || 0), 0);

    return {
        name: formatName(patient || undefined),
        dob: patient?.birthDate,
        gender: patient?.gender,
        mrn: firstIdentifierValue(patient || undefined),
        conditions,
        medications: meds,
        allergies,
        observations,
        immunizationsCount,
        lastEncounter,
        totalResources,
    };
}

export default buildPatientSummary;
