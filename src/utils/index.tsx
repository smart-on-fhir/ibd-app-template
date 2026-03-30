import type { Patient, Practitioner, RelatedPerson } from "fhir/r4";
import type { Resource } from 'fhir/r4';

/**
 * Converts a date string into a more readable format.
 * @param dateStr - Any valid date string that can be parsed by the Date constructor.
 * @returns A locally formatted date string
 */
export function formatDate(
    dateStr: string,
    options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' }
): string {
    if (!dateStr) return '—';
    try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return dateStr;
        return date.toLocaleDateString(undefined, { year: options.year, month: options.month, day: options.day });
    } catch (e) {
        return dateStr;
    }
}

export function humanizeDuration(start: Date, end: Date) {
    if (!(start instanceof Date) || !(end instanceof Date)) return '';

    let delta = Math.abs(end.getTime() - start.getTime());

    const msPerMinute = 60 * 1000;
    const msPerHour   = msPerMinute * 60;
    const msPerDay    = msPerHour * 24;
    const msPerWeek   = msPerDay * 7;

    const years  = Math.floor(delta / (msPerDay * 365));
    delta -= years * (msPerDay * 365);
    const months = Math.floor(delta / (msPerDay * 30));
    delta -= months * (msPerDay * 30);
    const weeks  = Math.floor(delta / msPerWeek);
    delta -= weeks * msPerWeek;
    const days   = Math.floor(delta / msPerDay);
    delta -= days * msPerDay;
    const hours  = Math.floor(delta / msPerHour);
    delta -= hours * msPerHour;
    const minutes = Math.floor(delta / msPerMinute);
    delta -= minutes * msPerMinute;
    const seconds = Math.floor(delta / 1000);

    const parts: string[] = [];
    if (years)   parts.push(`${years} year${years>1?'s':''}`);
    if (months)  parts.push(`${months} month${months>1?'s':''}`);
    if (weeks)   parts.push(`${weeks} week${weeks>1?'s':''}`);
    if (days)    parts.push(`${days} day${days>1?'s':''}`);
    if (hours)   parts.push(`${hours} hour${hours>1?'s':''}`);
    if (minutes) parts.push(`${minutes} minute${minutes>1?'s':''}`);
    if (!parts.length) parts.push(`${seconds} second${seconds!==1?'s':''}`);

    return parts.join(', ');
}

export function formatName(p?: Patient | Practitioner | RelatedPerson) {
    try {
        const n = p?.name?.[0];
        if (!n) return undefined;
        const parts = [] as string[];
        if (n.given) parts.push((n.given || []).join(' '));
        if (n.family) parts.push(n.family);
        return parts.join(' ').trim();
    } catch (e) {
        return undefined;
    }
}

export function summarizeHumanName(name: { use?: string; text?: string; family?: string; given?: string[]; prefix?: string[]; suffix?: string[] }): string {
    const parts = [];
    if (name.prefix) parts.push(name.prefix.join(' '));
    if (name.given) parts.push(name.given.join(' '));
    if (name.family) parts.push(name.family);
    if (name.suffix) parts.push(name.suffix.join(' '));
    return parts.filter(Boolean).join(' ');
}

export function summarizeDate(dateStr: string): string {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return 'Invalid date';
    return date.toISOString().substring(0, 10);
}

export function summarizeAddress(address: { use?: string; type?: string; text?: string; line?: string[]; city?: string; district?: string; state?: string; postalCode?: string; country?: string }): string {
    const parts = [];
    if (address.line) parts.push(address.line.join(', '));
    if (address.city) parts.push(address.city);
    if (address.state) parts.push(address.state);
    if (address.postalCode) parts.push(address.postalCode);
    if (address.country) parts.push(address.country);
    return parts.filter(Boolean).join(', ');
}

export function summarizeContactPoint(telecom: { system?: string; value?: string; use?: string; rank?: number }): string {
    return `${telecom.system || 'unknown'}: ${telecom.value || 'N/A'}`;
}

export function formatBytes(bytes: number) {
    if (!bytes) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function groupBy(data: Record<string, any>[], prop: string) {
    return data.reduce((acc, item) => {
        const key = String(item[prop] || 'undefined');
        if (!acc[key]) acc[key] = [];
        acc[key].push(item);
        return acc;
    }, {});
}

/**
 * Generate a human-friendly label for any FHIR resource.
 * Falls back to "{ResourceType} {id}" when specific formatting isn't available.
 */
export function resourceLabel(res?: Resource | null): string {
    if (!res) return 'Unknown resource';
    try {
        const t = (res.resourceType || 'Resource') as string;
        // Helper to read code display
        const codeText = (c: any) => c?.text || (c?.coding && c.coding[0]?.display) || c?.coding?.[0]?.code;

        switch (t) {
            case 'Organization': {
                const o: any = res;
                const name = o.name || (o.identifier && o.identifier[0] && o.identifier[0].value) || 'Organization';
                const a = (o.address && o.address[0]) || null;
                let addr = '';
                if (a) {
                    const parts = [] as string[];
                    if (a.line) parts.push((a.line || []).join(' '));
                    if (a.city) parts.push(a.city);
                    if (a.state) parts.push(a.state);
                    if (a.postalCode) parts.push(a.postalCode);
                    addr = parts.filter(Boolean).join(', ');
                }
                return addr ? `${name} - ${addr}` : name;
            }
            case 'Patient':
            case 'RelatedPerson':
            case 'Practitioner': {
                const name = formatName(res as any) || '';
                const dob = (res as any).birthDate ? `DOB: ${formatDate((res as any).birthDate)}` : '';
                const gender = (res as any).gender ? (res as any).gender : '';
                return [name, dob, gender].filter(Boolean).join(' ');
            }
            case 'Observation': {
                const obs: any = res;
                const typ = codeText(obs.code) || 'Observation';
                const date = obs.effectiveDateTime || obs.issued || obs.effectivePeriod?.start;
                let value = '';
                if (obs.valueQuantity) {
                    const v = obs.valueQuantity.value != null ? String(obs.valueQuantity.value) : '';
                    const u = obs.valueQuantity.unit || obs.valueQuantity.code || '';
                    value = [v, u].filter(Boolean).join(' ');
                }
                else if (obs.valueString)
                    value = obs.valueString;
                else if (obs.valueCodeableConcept)
                    value = obs.valueCodeableConcept.text || obs.valueCodeableConcept.coding?.[0]?.display || '';
                else if (obs.valueBoolean != null)
                    value = String(obs.valueBoolean);
                else if (obs.valueInteger != null)
                    value = String(obs.valueInteger);
                else if (obs.component && Array.isArray(obs.component)) {
                    value = obs.component.map((c: any) => `${codeText(c.code)||''}:${c.valueQuantity?c.valueQuantity.value:''}`).join('; ');
                }
                return [typ, date ? formatDate(date) : '', value].filter(Boolean).join(' ');
            }
            case 'DiagnosticReport': {
                const r: any = res;
                const typ = codeText(r.code) || 'Report';
                const date = r.issued || r.effectiveDateTime;
                return [typ, date ? formatDate(date) : ''].filter(Boolean).join(' ');
            }
            case 'MedicationRequest':
            case 'MedicationStatement':
            case 'MedicationAdministration':
            case 'MedicationDispense': {
                const m: any = res;
                const name = codeText(m.medicationCodeableConcept) || m.medicationReference?.display || 'Medication';
                const when = m.authoredOn || m.effectiveDateTime || m.occurrenceDateTime;
                return [name, when ? formatDate(when) : ''].filter(Boolean).join(' ');
            }
            case 'Condition': {
                const c: any = res;
                const code = codeText(c.code) || 'Condition';
                const status = c.clinicalStatus?.coding?.[0]?.code || c.clinicalStatus || '';
                return [code, status].filter(Boolean).join(' ');
            }
            case 'Encounter': {
                const e: any = res;
                const when = e.period?.start || e.period?.end || e.ended;
                const typ = e.type?.[0]?.text || e.class?.display || e.class?.code || 'Encounter';
                return [when ? formatDate(when) : '', typ].filter(Boolean).join(' ');
            }
            case 'Immunization': {
                const i: any = res;
                const v = codeText(i.vaccineCode) || 'Immunization';
                const dt = i.occurrenceDateTime || i.date;
                return [v, dt ? formatDate(dt) : ''].filter(Boolean).join(' ');
            }
            case 'Procedure': {
                const p: any = res;
                const code = codeText(p.code) || 'Procedure';
                const when = p.performedDateTime || p.performedPeriod?.start;
                return [code, when ? formatDate(when) : ''].filter(Boolean).join(' ');
            }
            case 'DocumentReference': {
                const d: any = res;
                const title = d.title || d.description || codeText(d.type) || 'Document';
                const date = d.date || d.created;
                return [title, date ? formatDate(date) : ''].filter(Boolean).join(' ');
            }
            case 'AllergyIntolerance': {
                const a: any = res;
                const c = codeText(a.code) || 'Allergy';
                const when = a.recordedDate || a.onset;
                return [c, when ? formatDate(when) : ''].filter(Boolean).join(' ');
            }
            case 'Claim': {
                const c: any = res;
                // const id = c.id || '';
                const status = c.status || '';
                const typ = codeText(c.type) || '';
                const created = c.created || c.billablePeriod?.start || (c.item && c.item[0]?.servicedDate) || '';

                // Try several common locations for a monetary total
                const totalVal = c.total?.value ?? c.total?.amount?.value ?? c.total?.amount ?? c.total?.valueQuantity?.value ?? null;
                const currency = c.total?.currency ?? c.total?.amount?.currency ?? c.total?.currencyCode ?? undefined;

                let formattedTotal = '';
                if (totalVal != null && totalVal !== '') {
                    try {
                        const n = Number(totalVal);
                        if (!Number.isNaN(n)) {
                            if (currency) {
                                formattedTotal = new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(n);
                            } else {
                                formattedTotal = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(n);
                            }
                        }
                    } catch (e) {
                        // ignore
                    }
                }

                // const patientName = c.patient?.display || (c.patient?.reference ? c.patient.reference.split('/').pop() : '');
                const provider = c.provider?.display || c.organization?.display || '';

                return [
                    // `Claim ${id}`,
                    `Claim`,
                    // patientName,
                    provider,
                    typ,
                    status,
                    formattedTotal,
                    created ? formatDate(created) : ''
                ].filter(Boolean).join(' — ');
            }
            default: {
                return `${t}${(res as any).id ? ' ' + (res as any).id : ''}`;
            }
        }
    } catch (e) {
        try {
            return `${res.resourceType || 'Resource'} ${(res as any).id || ''}`;
        } catch (e2) {
            return 'Resource';
        }
    }
}

export function ellipsis(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
}  