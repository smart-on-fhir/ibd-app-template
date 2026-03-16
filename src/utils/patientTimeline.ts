import type { Encounter, FhirResource } from 'fhir/r4';

export interface TimelineEvent {
    date?: string;
    resourceType: string;
    id: string;
    title: string;
    detail?: string;
    pid?: string | null;
}

export function textForCoding(code: any) {
    if (!code) return undefined;
    return code.text || (code.coding && code.coding[0]?.display) || code.coding?.[0]?.code;
}

export function roundToPrecision(num: number, precision: number) {
    const factor = Math.pow(10, precision);
    return Math.round(num * factor) / factor;
}

export function humanizeNumericValue(value: any) {
    const n = Number(value);
    if (isNaN(n)) return value;
    if (Math.abs(n) >= 1000) return roundToPrecision(n, 0).toLocaleString();
    if (Math.abs(n) >= 100) return roundToPrecision(n, 1).toLocaleString();
    if (Math.abs(n) >= 10) return roundToPrecision(n, 2).toLocaleString();
    return roundToPrecision(n, 3).toLocaleString();
}

export function obsValue(o: any) {
    if (!o) return undefined;
    if (o.valueQuantity) return `${humanizeNumericValue(o.valueQuantity.value)}${o.valueQuantity.unit ? ' ' + o.valueQuantity.unit : ''}`;
    if (o.valueString) return o.valueString;
    if (o.component && Array.isArray(o.component)) {
        return o.component.map((c: any) => textForCoding(c.code) + ': ' + (c.valueQuantity ? `${humanizeNumericValue(c.valueQuantity.value)}${c.valueQuantity.unit||''}` : c.valueString || '')).join('; ');
    }
    return undefined;
}

export function buildPatientTimeline(resources: Record<string, FhirResource[]>) : TimelineEvent[] {
    const events: TimelineEvent[] = [];

    ((resources['Encounter'] || []) as Encounter[]).forEach((e) => {
        const date = e.period?.start || e.period?.end || e.meta?.lastUpdated || undefined;
        // const title = 'Encounter';
        const title = (e.type && e.type[0]?.text) || e.class?.display || e.class?.code || 'Encounter';
        events.push({ date, resourceType: 'Encounter', id: e.id!, title, detail: '', pid: null });
    });

    (resources['Condition'] || []).forEach((c: any) => {
        const date = c.onsetDateTime || c.recordedDate || c.onset || undefined;
        const title = textForCoding(c.code) || 'Condition';
        const detail = `Status: ${c.clinicalStatus?.coding?.[0]?.code || 'unknown'}`;
        events.push({ date, resourceType: 'Condition', id: c.id, title, detail, pid: null });
    });

    (resources['Observation'] || []).forEach((o: any) => {
        const date = o.effectiveDateTime || o.issued || undefined;
        // const title = 'Observation';
        // const detail = textForCoding(o.code) + ': ' + obsValue(o);
        events.push({
            date,
            resourceType: 'Observation',
            id: o.id,
            title: textForCoding(o.code) || 'Observation',
            detail: obsValue(o),
            pid: o.encounter?.reference?.startsWith('Encounter/') ? o.encounter.reference.split('/')[1] : undefined
        });
    });

    (resources['Immunization'] || []).forEach((i: any) => {
        const date = i.occurrenceDateTime || i.date || undefined;
        // const title = 'Immunization';
        // const detail = textForCoding(i.vaccineCode) || undefined;
        events.push({
            date,
            resourceType: 'Immunization',
            id: i.id,
            title: textForCoding(i.vaccineCode) || 'Immunization',
            // detail,
            pid: i.encounter?.reference?.startsWith('Encounter/') ? i.encounter.reference.split('/')[1] : undefined
        });
    });

    (resources['Procedure'] || []).forEach((p: any) => {
        const date = p.performedDateTime || p.performedPeriod?.start || undefined;
        // const title = 'Procedure';
        // const detail = textForCoding(p.code) || undefined;
        events.push({
            date,
            resourceType: 'Procedure',
            id: p.id,
            title: textForCoding(p.code) || 'Procedure',
            // detail,
            pid: p.encounter?.reference?.startsWith('Encounter/') ? p.encounter.reference.split('/')[1] : undefined
        });
    });

    const medTypes = ['MedicationRequest','MedicationStatement','MedicationAdministration','MedicationDispense'];
    medTypes.forEach((k) => {
        (resources[k] || []).forEach((m: any) => {
            const date = m.authoredOn || m.effectiveDateTime || m.occurrenceDateTime || undefined;
            const name = m.medicationCodeableConcept ? textForCoding(m.medicationCodeableConcept) : m.medicationReference?.display;
            const title = name;
            const detail = [m.status || m.intent].filter(Boolean).join(' — ');
            events.push({ date, resourceType: k, id: m.id, title, detail, pid: m.encounter?.reference?.startsWith('Encounter/') ? m.encounter.reference.split('/')[1] : undefined });
        });
    });

    (resources['DiagnosticReport'] || []).forEach((r: any) => {
        const date = r.issued || r.effectiveDateTime || undefined;
        const title = 'Report';
        const detail = textForCoding(r.code) || undefined;
        events.push({ date, resourceType: 'DiagnosticReport', id: r.id, title, detail, pid: r.encounter?.reference?.startsWith('Encounter/') ? r.encounter.reference.split('/')[1] : undefined });
    });

    (resources['DocumentReference'] || []).forEach((d: any) => {
        const date = d.date || d.created || undefined;
        const title = 'Document';
        const detail = d.description || textForCoding(d.type) || undefined;
        events.push({ date, resourceType: 'DocumentReference', id: d.id, title, detail, pid: null });
    });

    (resources['AllergyIntolerance'] || []).forEach((a: any) => {
        const date = a.recordedDate || a.onset || undefined;
        const title = 'Allergy';
        const detail = textForCoding(a.code) || undefined;
        events.push({ date, resourceType: 'AllergyIntolerance', id: a.id, title, detail, pid: null });
    });

    // Keep events with dates first; sort chronologically (oldest -> newest)
    const withDate = events.filter(e => e.date).sort((a,b) => (a.date! < b.date! ? -1 : a.date! > b.date! ? 1 : 0));
    const withoutDate = events.filter(e => !e.date);
    return [...withDate, ...withoutDate];
}

export default buildPatientTimeline;
