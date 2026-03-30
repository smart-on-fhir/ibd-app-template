/**
 * Factory that builds a `detect()` function from a condition preset config.
 * Matches against Condition (ICD-10, SNOMED) and MedicationRequest (RxNorm + keywords).
 */
import type { FhirResource } from 'fhir/r4';

interface Preset {
    icd10:    string[];
    snomed:   string[];
    rxnorm?:  string[];
    keywords: string[];
}

export function makeDetectFromPreset(preset: Preset) {
    const snomed = new Set(preset.snomed);
    const rxnorm = new Set(preset.rxnorm ?? []);

    return (resources: Record<string, FhirResource[]>): boolean => {
        for (const c of (resources['Condition'] ?? []) as any[]) {
            for (const cod of (c.code?.coding ?? [])) {
                const sys  = (cod.system ?? '').toLowerCase();
                const code = cod.code ?? '';
                if ((sys.includes('icd-10') || sys.includes('icd10') || sys.includes('icd-10-cm'))
                    && preset.icd10.some(p => code.startsWith(p))) return true;
                if ((sys.includes('snomed') || sys.includes('sct')) && snomed.has(code)) return true;
                if (sys.includes('rxnorm') && rxnorm.has(code)) return true;
            }
            const text = [c.code?.text, ...(c.code?.coding ?? []).map((x: any) => x.display ?? '')]
                .filter(Boolean).join(' ').toLowerCase();
            if (preset.keywords.some(kw => text.includes(kw))) return true;
        }

        for (const r of (resources['MedicationRequest'] ?? []) as any[]) {
            for (const cod of (r.medicationCodeableConcept?.coding ?? [])) {
                if ((cod.system ?? '').toLowerCase().includes('rxnorm') && rxnorm.has(cod.code ?? '')) return true;
            }
            const name = [
                r.medicationCodeableConcept?.text,
                ...(r.medicationCodeableConcept?.coding ?? []).map((c: any) => c.display ?? ''),
            ].filter(Boolean).join(' ').toLowerCase();
            if (preset.keywords.some(kw => name.includes(kw))) return true;
        }

        return false;
    };
}
