/**
 * IBD-specific FHIR data extraction utilities.
 * All functions take raw `selectedPatientResources` and return typed results.
 */

import type { FhirResource } from 'fhir/r4';
import {
    ICD10_CROHNS, ICD10_UC, ICD10_IBD_U,
    SNOMED_CROHNS, SNOMED_UC, SNOMED_IBD,
    ICD10_PERIANAL, PERIANAL_KEYWORDS, IBD_SURGERY_KEYWORDS,
    IBD_BIOLOGICS, IBD_IMMUNOMODULATORS, IBD_AMINOSALICYLATES, IBD_STEROIDS, IBD_ANTIBIOTICS,
    LAB_DEFS, type LabKey,
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
    value:     string;
    date:      string;
    numValue?: number;
    trend:     'up' | 'down' | 'stable' | null;
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
    const { loincs, keywords } = LAB_DEFS[labKey];
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

    return { value: latest.value!, date: latest.date, numValue: latest.numValue, trend };
}

export interface LabPoint {
    date:  number;  // Unix ms
    value: number;
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
        }))
        .filter(p => !isNaN(p.date))
        .sort((a, b) => a.date - b.date);
}

/** Fetch all IBD-relevant labs in one call. */
export function getAllLabs(resources: Record<string, FhirResource[]>): Record<LabKey, LabResult | null> {
    return Object.fromEntries(
        (Object.keys(LAB_DEFS) as LabKey[]).map(k => [k, getRecentLab(resources, k)])
    ) as Record<LabKey, LabResult | null>;
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
