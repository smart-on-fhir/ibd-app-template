import { DIABETES_PRESET, GLIOMA_PRESET, IBD_PRESET, RESPIRATORY_PRESET } from './config';
import type { TimelineEvent } from './utils';

// ── types ────────────────────────────────────────────────────────────────────

export type ConditionPreset = {
    id         : string;
    label      : string;
    color      : string;
    description: string;
    matches    : (event: TimelineEvent) => boolean;
};

// ── internal helpers ─────────────────────────────────────────────────────────

/** Flatten all coding arrays from common FHIR resource paths. */
function extractCodings(raw: any): Array<{ system?: string; code?: string; display?: string }> {
    const result: Array<{ system?: string; code?: string; display?: string }> = [];

    const pushArr = (arr: any) => {
        if (Array.isArray(arr)) result.push(...arr);
    };

    // Standard code / medication code / procedure code
    pushArr(raw.code?.coding);
    pushArr(raw.medicationCodeableConcept?.coding);
    pushArr(raw.vaccineCode?.coding);

    // Encounter / procedure reason codes
    (raw.reasonCode  ?? []).forEach((rc: any) => pushArr(rc.coding));
    (raw.diagnosis   ?? []).forEach((d: any)  => pushArr(d.condition?.coding));

    // Encounter / observation categories (may be array or single object)
    const categoryArr = Array.isArray(raw.category) ? raw.category : (raw.category ? [raw.category] : []);
    categoryArr.forEach((c: any) => pushArr(c.coding));

    // Observation component codes
    (raw.component ?? []).forEach((comp: any) => pushArr(comp.code?.coding));

    return result;
}

/** Build a single space-joined lowercase text blob for keyword matching. */
function extractText(event: TimelineEvent): string {
    const raw = event.raw as any;

    const parts: (string | undefined)[] = [
        event.display,
        event.category,
        raw.code?.text,
        raw.medicationCodeableConcept?.text,
        raw.medicationReference?.display,
        raw.description,
        raw.note?.[0]?.text,
    ];

    // Display strings from every coding
    for (const c of extractCodings(raw)) {
        parts.push(c.display);
    }

    return parts.filter(Boolean).join(' ').toLowerCase();
}

/** Factory: builds a ConditionPreset from declarative code/keyword lists. */
function makePreset(opts: {
    id      : string;
    label   : string;
    color   : string;
    description: string;
    icd10   : string[];     // ICD-10 prefixes  (startsWith)
    snomed  : string[];     // exact SNOMED CT codes
    rxnorm  : string[];     // exact RxNorm codes
    keywords: string[];     // lowercase substrings to match in display text
}): ConditionPreset {
    const { id, label, color, description, icd10, snomed, rxnorm, keywords } = opts;

    return {
        id, label, color, description,
        matches(event) {
            for (const { system = '', code = '' } of extractCodings(event.raw)) {
                const s = system.toLowerCase();
                if ((s.includes('icd-10') || s.includes('icd10')) && icd10.some(p => code.startsWith(p))) return true;
                if ((s.includes('snomed') || s.includes('sct'))   && snomed.includes(code))               return true;
                if (s.includes('rxnorm')                           && rxnorm.includes(code))               return true;
            }
            const text = extractText(event);
            return keywords.some(kw => text.includes(kw));
        }
    };
}

// ── built-in presets ──────────────────────────────────────────────────────────

export const CONDITION_PRESETS: ConditionPreset[] = [
    makePreset(IBD_PRESET),
    makePreset(GLIOMA_PRESET),
    makePreset(DIABETES_PRESET),
    makePreset(RESPIRATORY_PRESET),
];
