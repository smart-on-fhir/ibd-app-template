/**
 * IBD-specific FHIR data extraction utilities.
 * All functions take raw `selectedPatientResources` and return typed results.
 */

import type { FhirResource } from 'fhir/r4';
import type { ParisLocation, ParisBehavior } from '../../api/ibd/types';
import {
    ICD10_CROHNS, ICD10_UC, ICD10_IBD_U,
    SNOMED_CROHNS, SNOMED_UC, SNOMED_IBD,
    ICD10_PERIANAL, PERIANAL_KEYWORDS, IBD_SURGERY_KEYWORDS,
    IBD_BIOLOGICS, IBD_IMMUNOMODULATORS, IBD_AMINOSALICYLATES, IBD_STEROIDS, IBD_ANTIBIOTICS,
    LAB_DEFS, type LabKey,
    IBD_MED_DISPLAY_DAYS,
    ENDOSCOPY_LOINCS, ENDOSCOPY_KEYWORDS,
} from './config';

// ── IBD conditions ────────────────────────────────────────────────────────────

export type IBDSubtype = "Crohn's disease" | 'Ulcerative colitis' | 'IBD-U' | 'IBD';

function codingToSubtype(coding: any): IBDSubtype | null {
    const system = (coding.system ?? '').toLowerCase();
    const code   = coding.code   ?? '';
    if (system.includes('icd-10') || system.includes('icd10') || system.includes('icd-10-cm')) {
        if (ICD10_CROHNS.some(p => code.startsWith(p))) return "Crohn's disease";
        if (ICD10_UC.some(p => code.startsWith(p)))     return 'Ulcerative colitis';
        if (ICD10_IBD_U.some(p => code.startsWith(p)))  return 'IBD-U';
    }
    if (system.includes('snomed') || system.includes('sct')) {
        if (SNOMED_CROHNS.has(code)) return "Crohn's disease";
        if (SNOMED_UC.has(code))     return 'Ulcerative colitis';
        if (SNOMED_IBD.has(code))    return 'IBD';
    }
    return null;
}

/** Returns all Condition resources that represent IBD diagnoses. */
export function getIBDConditions(resources: Record<string, FhirResource[]>): any[] {
    return (resources['Condition'] ?? []).filter((c: any) =>
        (c.code?.coding ?? []).some((cod: any) => codingToSubtype(cod) !== null)
    );
}

/** Returns the most specific IBD subtype found across all IBD conditions. */
export function getIBDSubtype(conditions: any[]): IBDSubtype {
    // Prefer specific subtypes over generic IBD
    const priority: IBDSubtype[] = ["Crohn's disease", 'Ulcerative colitis', 'IBD-U', 'IBD'];
    for (const target of priority) {
        for (const c of conditions) {
            for (const cod of (c.code?.coding ?? [])) {
                if (codingToSubtype(cod) === target) return target;
            }
        }
    }
    return 'IBD';
}

/**
 * Returns human-readable disease duration from the earliest IBD condition onset.
 * Returns null if no onset date is available.
 */
export function getDiseaseDuration(conditions: any[]): string | null {
    const timestamps = conditions
        .map((c: any) => c.onsetDateTime ?? c.recordedDate)
        .filter(Boolean)
        .map((d: string) => new Date(d).getTime())
        .filter(t => !isNaN(t));
    if (timestamps.length === 0) return null;

    const earliest = Math.min(...timestamps);
    const now      = Date.now();
    const months   = Math.floor((now - earliest) / (1000 * 60 * 60 * 24 * 30.44));

    if (months <  1)  return 'Less than 1 month';
    if (months < 12)  return `${months} month${months === 1 ? '' : 's'}`;
    const years = Math.floor(months / 12);
    const rem   = months % 12;
    return rem === 0
        ? `${years} year${years === 1 ? '' : 's'}`
        : `${years} yr ${rem} mo`;
}

// ── Medications ───────────────────────────────────────────────────────────────

export type MedClass =
    | 'biologic'
    | 'immunomodulator'
    | 'aminosalicylate'
    | 'steroid'
    | 'antibiotic'
    | 'other';

export function classifyMedication(name: string): MedClass {
    const n = name.toLowerCase();
    if (IBD_BIOLOGICS.some(b => n.includes(b)))         return 'biologic';
    if (IBD_IMMUNOMODULATORS.some(b => n.includes(b)))  return 'immunomodulator';
    if (IBD_AMINOSALICYLATES.some(b => n.includes(b)))  return 'aminosalicylate';
    if (IBD_STEROIDS.some(b => n.includes(b)))           return 'steroid';
    if (IBD_ANTIBIOTICS.some(b => n.includes(b)))        return 'antibiotic';
    return 'other';
}

function extractMedName(r: any): string {
    return (
        r.medicationCodeableConcept?.text                        ??
        r.medicationCodeableConcept?.coding?.[0]?.display        ??
        r.medicationCodeableConcept?.coding?.[0]?.code           ??
        r.medicationReference?.display                           ??
        r.medication?.concept?.text                              ??
        r.medication?.concept?.coding?.[0]?.display              ??
        r.medication?.reference?.display                         ??
        'Unknown'
    );
}

export interface MedInfo {
    name:      string;
    class:     MedClass;
    status:    string;
    startDate: string | null;
}

/** All IBD-relevant medications (any status). */
export function getAllIBDMedications(resources: Record<string, FhirResource[]>): MedInfo[] {
    return (resources['MedicationRequest'] ?? []).flatMap((r: any) => {
        const name = extractMedName(r);
        const cls  = classifyMedication(name);
        if (cls === 'other') return [];
        return [{ name, class: cls, status: r.status ?? 'unknown', startDate: r.authoredOn ?? null }];
    });
}

/** Extracts the first word (generic drug name) from a raw FHIR medication string. */
export function normalizeMedName(raw: string): string {
    const first = raw.trim().split(/[\s,/()]+/).find(t => /^[A-Za-z]/.test(t)) ?? raw;
    // Strip FDA biosimilar suffix: exactly 4 lowercase letters after a hyphen (e.g. adalimumab-adaz → adalimumab)
    const stripped = first.replace(/-[a-z]{4}$/i, '');
    return stripped.charAt(0).toUpperCase() + stripped.slice(1).toLowerCase();
}

/** Only active IBD medications, sorted by class priority (biologic first). */
const CLASS_ORDER: MedClass[] = ['biologic', 'immunomodulator', 'aminosalicylate', 'steroid', 'antibiotic'];
export function getCurrentRegimen(resources: Record<string, FhirResource[]>): MedInfo[] {
    return getAllIBDMedications(resources)
        .filter(m => m.status === 'active')
        .sort((a, b) => CLASS_ORDER.indexOf(a.class) - CLASS_ORDER.indexOf(b.class));
}

export interface SteroidExposure {
    totalCourses:  number;
    activeCourses: number;
}

/** Count steroid prescriptions — total and currently active. */
export function getSteroidExposure(resources: Record<string, FhirResource[]>): SteroidExposure {
    const steroids = getAllIBDMedications(resources).filter(m => m.class === 'steroid');
    return {
        totalCourses:  steroids.length,
        activeCourses: steroids.filter(m => m.status === 'active').length,
    };
}

// ── Labs ──────────────────────────────────────────────────────────────────────

export interface LabResult {
    value:         string;
    date:          string;
    numValue?:     number;
    trend:         'up' | 'down' | 'stable' | null;
    goodDirection: 'up' | 'down' | null;
}

function obsMatchesLab(obs: any, loincs: readonly string[], keywords: readonly string[]): boolean {
    for (const cod of (obs.code?.coding ?? [])) {
        if ((cod.system ?? '').toLowerCase().includes('loinc') && loincs.includes(cod.code)) return true;
    }
    const text = [obs.code?.text, ...(obs.code?.coding ?? []).map((c: any) => c.display)]
        .filter(Boolean).join(' ').toLowerCase();
    return keywords.some(kw => text.includes(kw));
}

function extractObsValue(obs: any): string | null {
    if (obs.valueQuantity) {
        const unit = obs.valueQuantity.unit ?? obs.valueQuantity.code ?? '';
        return unit ? `${obs.valueQuantity.value} ${unit}` : String(obs.valueQuantity.value);
    }
    if (obs.valueString)           return obs.valueString;
    if (obs.valueCodeableConcept)  return obs.valueCodeableConcept.text ?? obs.valueCodeableConcept.coding?.[0]?.display ?? null;
    return null;
}

/** Most recent value + trend direction for a specific lab. */
export function getRecentLab(
    resources: Record<string, FhirResource[]>,
    labKey:    LabKey,
): LabResult | null {
    const { loincs, keywords, goodDirection } = LAB_DEFS[labKey];
    const matching = (resources['Observation'] ?? [])
        .filter((obs: any) => obsMatchesLab(obs, loincs, keywords))
        .map((obs: any) => ({
            value:    extractObsValue(obs),
            date:     obs.effectiveDateTime ?? obs.issued ?? '',
            numValue: obs.valueQuantity?.value as number | undefined,
        }))
        .filter(r => r.value && r.date)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    if (matching.length === 0) return null;

    const [latest, prev] = matching;
    let trend: LabResult['trend'] = null;
    if (prev && latest.numValue !== undefined && prev.numValue !== undefined && prev.numValue !== 0) {
        const pct = (latest.numValue - prev.numValue) / Math.abs(prev.numValue);
        trend = pct > 0.1 ? 'up' : pct < -0.1 ? 'down' : 'stable';
    }

    return { value: latest.value!, date: latest.date, numValue: latest.numValue, trend, goodDirection };
}

export interface LabPoint {
    date:  number;  // Unix ms
    value: number;
    unit:  string;  // as reported in FHIR valueQuantity
}

/** All numeric observations for a lab key, sorted oldest → newest. */
export function getLabHistory(
    resources: Record<string, FhirResource[]>,
    labKey:    LabKey,
): LabPoint[] {
    const { loincs, keywords } = LAB_DEFS[labKey];
    return (resources['Observation'] ?? [])
        .filter((obs: any) => obsMatchesLab(obs, loincs, keywords))
        .filter((obs: any) => obs.valueQuantity?.value !== undefined)
        .map((obs: any) => ({
            date:  new Date(obs.effectiveDateTime ?? obs.issued ?? '').getTime(),
            value: obs.valueQuantity.value as number,
            unit:  (obs.valueQuantity.code ?? obs.valueQuantity.unit ?? '') as string,
        }))
        .filter(p => !isNaN(p.date))
        .sort((a, b) => a.date - b.date);
}

/** All IBD-relevant labs in one call. */
export function getAllLabs(resources: Record<string, FhirResource[]>): Record<LabKey, LabResult | null> {
    return Object.fromEntries(
        (Object.keys(LAB_DEFS) as LabKey[]).map(k => [k, getRecentLab(resources, k)])
    ) as Record<LabKey, LabResult | null>;
}

/**
 * Derives BMI from Weight + Height observations when no dedicated BMI observation exists.
 * Handles kg/lbs for weight and cm/in for height.
 */
export function getDerivedBMI(resources: Record<string, FhirResource[]>): LabResult | null {
    const weightObs = getRecentLab(resources, 'Weight');
    const heightObs = getRecentLab(resources, 'Height');
    if (!weightObs?.numValue || !heightObs?.numValue) return null;

    let weightKg = weightObs.numValue;
    let heightCm = heightObs.numValue;

    // Unit conversion if not already metric
    if (weightObs.value.includes('lb') || weightObs.value.includes('[lb')) weightKg *= 0.453592;
    if (heightObs.value.includes('[in') || heightObs.value.includes('" in')) heightCm *= 2.54;

    const bmi = weightKg / Math.pow(heightCm / 100, 2);
    const rounded = Math.round(bmi * 10) / 10;

    return {
        value:         `${rounded} kg/m²`,
        date:          weightObs.date,
        numValue:      rounded,
        trend:         null,
        goodDirection: null,
    };
}

// ── Surgery ───────────────────────────────────────────────────────────────────

/** Returns true if any Procedure resource suggests prior IBD-related surgery. */
export function hasPriorIBDSurgery(resources: Record<string, FhirResource[]>): boolean {
    return (resources['Procedure'] ?? []).some((p: any) => {
        const text = [p.code?.text, ...(p.code?.coding ?? []).map((c: any) => c.display ?? c.code ?? '')]
            .filter(Boolean).join(' ').toLowerCase();
        return IBD_SURGERY_KEYWORDS.some(kw => text.includes(kw));
    });
}

// ── Perianal disease ──────────────────────────────────────────────────────────

/** Returns true if any Condition indicates perianal disease. */
export function hasPerianialDisease(resources: Record<string, FhirResource[]>): boolean {
    return (resources['Condition'] ?? []).some((c: any) => {
        for (const cod of (c.code?.coding ?? [])) {
            const sys = (cod.system ?? '').toLowerCase();
            if ((sys.includes('icd-10') || sys.includes('icd10') || sys.includes('icd-10-cm'))
                && ICD10_PERIANAL.some(p => (cod.code ?? '').startsWith(p))) return true;
        }
        const text = [c.code?.text, ...(c.code?.coding ?? []).map((x: any) => x.display ?? '')]
            .filter(Boolean).join(' ').toLowerCase();
        return PERIANAL_KEYWORDS.some(kw => text.includes(kw));
    });
}

// ── Medication history ────────────────────────────────────────────────────────

const DAY_MS = 864e5;
const TIMING_UNIT_MS: Record<string, number> = {
    s: 1e3, min: 6e4, h: 36e5, d: 864e5, wk: 6048e5, mo: 2592e6, a: 31536e6,
};

export interface MedHistoryEntry {
    name:         string;
    class:        MedClass;
    status:       string;
    startMs:      number;    // Unix ms
    endMs:        number;    // Unix ms
    durationDays: number;
    endIsExact:   boolean;   // false = heuristic fallback
}

/**
 * Full IBD medication history with start + end dates, sorted oldest → newest.
 *
 * End date resolution order (improved over the generic Timeline version):
 *   1. dispenseRequest.validityPeriod.end
 *   2. dosageInstruction[0].timing.repeat.boundsPeriod.end
 *   3. Derived: count × (period / frequency) × unitMs from timing.repeat
 *   4. IBD-specific drug display duration heuristic (IBD_MED_DISPLAY_DAYS)
 */
export function getMedHistory(resources: Record<string, FhirResource[]>): MedHistoryEntry[] {
    return (resources['MedicationRequest'] ?? []).flatMap((r: any) => {
        const name = extractMedName(r);
        const cls  = classifyMedication(name);
        if (cls === 'other') return [];

        const startMs = r.authoredOn ? +new Date(r.authoredOn) : NaN;
        if (isNaN(startMs)) return [];

        let endMs:      number  = NaN;
        let endIsExact: boolean = false;

        // 1. validityPeriod
        const vp = r.dispenseRequest?.validityPeriod;
        if (vp?.end) { endMs = +new Date(vp.end); endIsExact = true; }

        // 2. boundsPeriod
        if (isNaN(endMs)) {
            const bp = r.dosageInstruction?.[0]?.timing?.repeat?.boundsPeriod;
            if (bp?.end) { endMs = +new Date(bp.end); endIsExact = true; }
        }

        // 3. Derived from timing.repeat count × period / frequency
        if (isNaN(endMs)) {
            const rep = r.dosageInstruction?.[0]?.timing?.repeat;
            if (rep?.count && rep?.period && rep?.periodUnit) {
                const ms = rep.count * (rep.period / (rep.frequency ?? 1))
                         * (TIMING_UNIT_MS[rep.periodUnit] ?? DAY_MS);
                endMs = startMs + ms;
                endIsExact = true;
            }
        }

        // 4. IBD-specific heuristic fallback
        if (isNaN(endMs) || endMs <= startMs) {
            const n = name.toLowerCase();
            let days = 28;
            for (const [keywords, d] of IBD_MED_DISPLAY_DAYS) {
                if (keywords.some(k => n.includes(k))) { days = d; break; }
            }
            endMs = startMs + days * DAY_MS;
            endIsExact = false;
        }

        return [{
            name, class: cls, status: r.status ?? 'unknown',
            startMs, endMs,
            durationDays: Math.round((endMs - startMs) / DAY_MS),
            endIsExact,
        }];
    }).sort((a, b) => a.startMs - b.startMs);
}

// ── Paris classification (from structured FHIR) ───────────────────────────────

export interface ParisFHIR {
    location: ParisLocation | null;  // L1/L2/L3 (CD) or E1/E2/E3 (UC); null if not determinable
    behavior: ParisBehavior | null;  // B1/B2/B3 (CD only); null if ambiguous
    perianal: boolean;
    growth:   null;                  // not reliably derivable from standard ICD-10
}

/**
 * Infers Paris classification from ICD-10-CM Condition codes.
 *
 * Location:
 *   K50.0x → L1 (ileal)  |  K50.1x → L2 (colonic)  |  both or K50.[89]x → L3
 *   K51.2 → E1  |  K51.3/K51.4 → E2  |  K51.0/K51.5 → E3  (UC)
 *
 * Behavior (CD only, from ICD-10-CM 7th-character subcodes):
 *   ends in 13 → fistula → B3  |  ends in 14 → abscess → B3
 *   ends in 12 → obstruction → B2  |  ends in 0 without complications → B1
 *   perianal=true also implies B3
 */
export function getParisByFHIR(
    conditions: any[],
    ibdSubtype: IBDSubtype,
    perianal:   boolean,
): ParisFHIR {
    const codes: string[] = conditions.flatMap((c: any) =>
        (c.code?.coding ?? []).map((cod: any) => (cod.code ?? '') as string).filter(Boolean)
    );

    let location: ParisLocation | null = null;
    let behavior: ParisBehavior | null = null;

    if (ibdSubtype === "Crohn's disease") {
        const hasIleal   = codes.some(c => c.startsWith('K50.0'));
        const hasColonic = codes.some(c => c.startsWith('K50.1'));
        const hasOther   = codes.some(c => c.startsWith('K50.8') || c.startsWith('K50.9'));

        if (hasIleal && hasColonic)    location = 'L3';
        else if (hasIleal)             location = 'L1';
        else if (hasColonic)           location = 'L2';
        else if (hasOther)             location = 'L3';   // unspecified → assume ileocolonic

        const hasFistula  = codes.some(c => c.endsWith('13'));
        const hasAbscess  = codes.some(c => c.endsWith('14'));
        const hasObstruct = codes.some(c => c.endsWith('12'));
        const explicit0   = codes.some(c => /^K50\.\d+0$/.test(c));

        if (hasFistula || hasAbscess || perianal)   behavior = 'B3';
        else if (hasObstruct)                        behavior = 'B2';
        else if (explicit0)                          behavior = 'B1';

    } else if (ibdSubtype === 'Ulcerative colitis') {
        const pancolitis = codes.some(c => c.startsWith('K51.0') || c.startsWith('K51.5'));
        const leftSided  = codes.some(c => c.startsWith('K51.3') || c.startsWith('K51.4'));
        const proctitis  = codes.some(c => c.startsWith('K51.2'));

        if (pancolitis)       location = 'E3';
        else if (leftSided)   location = 'E2';
        else if (proctitis)   location = 'E1';
    }

    return { location, behavior, perianal, growth: null };
}

// ── Endoscopy (from DiagnosticReport) ─────────────────────────────────────────

export interface EndoscopyResult {
    date:    string;
    finding: string;
}

/**
 * Returns the most recent endoscopy / colonoscopy DiagnosticReport, matched by
 * LOINC code or free-text keyword in code.text / coding.display.
 */
export function getLatestEndoscopy(resources: Record<string, FhirResource[]>): EndoscopyResult | null {
    const reports = (resources['DiagnosticReport'] ?? [])
        .filter((r: any) => {
            const codings = [
                ...(r.code?.coding ?? []),
                ...(r.category ?? []).flatMap((cat: any) => cat.coding ?? []),
            ];
            if (codings.some((c: any) =>
                (c.system ?? '').toLowerCase().includes('loinc') &&
                ENDOSCOPY_LOINCS.includes(c.code)
            )) return true;
            const text = [r.code?.text, ...codings.map((c: any) => c.display ?? '')]
                .filter(Boolean).join(' ').toLowerCase();
            return ENDOSCOPY_KEYWORDS.some(kw => text.includes(kw));
        })
        .map((r: any) => ({
            date:    r.effectiveDateTime ?? r.effectivePeriod?.end ?? r.issued ?? '',
            finding: r.conclusion ?? r.presentedForm?.[0]?.title ?? '(report available)',
        }))
        .filter(r => r.date)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return reports[0] ?? null;
}
