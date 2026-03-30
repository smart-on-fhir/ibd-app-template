import { IBD_PRESET } from '../../components/Timeline/config';
import type { FhirResource } from 'fhir/r4';

const IBD_ICD10   = IBD_PRESET.icd10;
const IBD_SNOMED  = new Set(IBD_PRESET.snomed);

function codingMatchesIBD(coding: { system?: string; code?: string }): boolean {
    const system = (coding.system ?? '').toLowerCase();
    const code   = coding.code ?? '';
    if ((system.includes('icd-10') || system.includes('icd10')) && IBD_ICD10.some(p => code.startsWith(p))) return true;
    if ((system.includes('snomed') || system.includes('sct'))   && IBD_SNOMED.has(code))                    return true;
    return false;
}

export function detectIBD(resources: Record<string, FhirResource[]>): boolean {
    const conditions = (resources['Condition'] ?? []) as any[];
    return conditions.some(c =>
        (c.code?.coding ?? []).some(codingMatchesIBD)
    );
}
