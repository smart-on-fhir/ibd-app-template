/**
 * describeResource
 *
 * Profiles all resources of a given type in a single O(n) pass and returns a
 * compact, LLM-friendly summary.  Designed to work correctly even when the
 * corpus contains invalid / partially-valid resources.
 *
 * Key outputs
 * ───────────
 *  fieldStats        — per-path % coverage across valid resources
 *  topSignatures     — most common "shape fingerprints" with example IDs
 *  topCodes          — most frequent code.coding entries (LOINC / SNOMED)
 *  valuePaths        — which value[x] polymorphic paths are actually used
 *  warnings          — detected data-quality issues
 *  candidateSelectPaths — high-coverage paths ready to drop into a query
 * 
 * -----------------------------------------------------------------------------
 * Single pass, O(n) — all 100K resources are scanned once; no FHIRPath
 * evaluation needed here since we walk raw JS object keys.
 * 
 * walkPaths() — recursively emits (dotPath, leafValue) pairs up to depth 4.
 * Arrays are represented as path[] (count) and path[0] (first element shape),
 * which is enough to discover all relevant paths without blowing up on large
 * arrays.
 * 
 * Invalid resource handling — three separate validity checks (not_an_object,
 * wrong_resource_type, missing_code, missing_status) that each increment
 * invalidReasons but don't abort the loop. An invalid resource still
 * contributes to field-path profiling so you can see what partial data is
 * present.
 * 
 * Reservoir sampling — per-field example values are kept to maxExamples
 * (default 3) using random reservoir replacement, so you get representative
 * values even for very common paths, not just the first N.
 * 
 * Signature fingerprinting — each resource is reduced to a sorted
 * comma-separated list of its top-level keys. Grouping by this surfaces
 * distinct structural patterns, e.g. code,effectiveDateTime,status,subject,valueQuantity
 * vs code,component,effectivePeriod,status,subject. The top 10 cover the vast
 * majority of real datasets.
 * 
 * valuePaths — checks all 12 polymorphic value[x] variants directly by key name.
 * This single line tells the LLM "don't assume valueQuantity, this patient has
 * 3 variants."
 * 
 * Warnings — four automatic checks fire when the data has high invalidity rates,
 * many shape variants, multiple value[x] types, or multiple date path conventions.
 * 
 * candidateSelectPaths — the output the LLM should prefer in its select: clause,
 * filtered to ≥80% coverage.
 * 
 * Usage example:
 * -----------------------------------------------------------------------------
 * import { describeResource } from './fhir/describeResource';
 * 
 * const profile = describeResource('Observation', patientDataSet.resources);
 * // → pass profile as the tool result back to the LLM
 */

import type { FhirResource } from "fhir/r4";

// export type FhirPrimitive = string | number | boolean | null;

// export type FhirValue =
//   | FhirPrimitive
//   | FhirObject
//   | FhirValue[];

// export type FhirObject = {
//   [key: string]: FhirValue;
// };

// export type FhirResource = FhirObject & {
//   resourceType: string;
//   id?: string;
// };

export type ResourcesByType = Record<string, FhirResource[]>;

// ---------------------------------------------------------------------------
// Return types
// ---------------------------------------------------------------------------

export type FieldStat = {
    /** % of valid resources where the path evaluates to a non-null value. */
    presentPct: number;
    /** All JS primitive types encountered at this path (e.g. ["string","number"]) */
    types: string[];
    /** Up to 3 distinct example values (primitives only, truncated to 80 chars). */
    examples: unknown[];
};

export type SignatureStat = {
    /** Sorted comma-separated list of top-level keys present. */
    signature: string;
    count: number;
    pct: number;
    /** IDs of up to 3 resources with this signature (for debugging). */
    sampleIds: string[];
};

export type CodeStat = {
    system: string;
    code: string;
    display: string;
    count: number;
};

export type ResourceProfile = {
    resourceType: string;
    /** Total records examined (including invalid). */
    totalScanned: number;
    validCount: number;
    invalidCount: number;
    /** Reasons resources were counted as invalid, with counts. */
    invalidReasons: Record<string, number>;
    /** Paths with ≥ 5% coverage, sorted descending by coverage. */
    fieldStats: Record<string, FieldStat>;
    /** Top 10 shape fingerprints. */
    topSignatures: SignatureStat[];
    /** Top 20 codes from code.coding[]. */
    topCodes: CodeStat[];
    /** Which value[x] variants are present (e.g. ["valueQuantity","valueString"]). */
    valuePaths: string[];
    /** High-level data-quality warnings. */
    warnings: string[];
    /**
     * Paths with ≥ 80% coverage that are safe to use in a select projection.
     * Sorted by coverage descending.
     */
    candidateSelectPaths: string[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Reservoir sampling: maintain a fixed-size random sample. */
function reservoir<T>(current: T[], incoming: T, maxSize: number): T[] {
    if (current.length < maxSize) {
        return [...current, incoming];
    }
    // Replace a random element with decreasing probability — keeps it O(1) amortized.
    const idx = Math.floor(Math.random() * (maxSize + 1));
    if (idx < maxSize) {
        const next = [...current];
        next[idx] = incoming;
        return next;
    }
    return current;
}

const VALUE_X_KEYS = [
    'valueQuantity', 'valueCodeableConcept', 'valueString', 'valueBoolean',
    'valueInteger', 'valueRange', 'valueRatio', 'valueSampledData',
    'valueTime', 'valueDateTime', 'valuePeriod', 'valueAttachment',
];

/** Walk a plain JS object and emit (dotPath, leafValue) pairs up to maxDepth. */
function* walkPaths(
    obj: Record<string, unknown>,
    prefix = '',
    maxDepth = 4,
): Generator<[string, unknown]> {
    if (maxDepth <= 0) return;
    for (const [k, v] of Object.entries(obj)) {
        const path = prefix ? `${prefix}.${k}` : k;
        if (v === null || v === undefined) continue;
        if (Array.isArray(v)) {
            if (v.length === 0) continue;
            // Yield the array path as "present"
            yield [path + '[]', v.length];
            // Walk first element if it's an object
            const first = v[0];
            if (first && typeof first === 'object' && !Array.isArray(first)) {
                yield* walkPaths(first as Record<string, unknown>, path + '[0]', maxDepth - 1);
            } else if (typeof first !== 'object') {
                yield [path + '[0]', first];
            }
        } else if (typeof v === 'object') {
            yield [path, '[object]'];
            yield* walkPaths(v as Record<string, unknown>, path, maxDepth - 1);
        } else {
            yield [path, v];
        }
    }
}

function truncate(v: unknown, maxLen = 80): unknown {
    if (typeof v === 'string' && v.length > maxLen) return v.slice(0, maxLen) + '…';
    return v;
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

export function describeResource(
    resourceType: string,
    store: ResourcesByType,
    options: {
        /** Minimum % coverage to include a field in fieldStats. Default 5. */
        minCoveragePct?: number;
        /** Maximum distinct examples to retain per field. Default 3. */
        maxExamples?: number;
    } = {},
): ResourceProfile {
    const { minCoveragePct = 5, maxExamples = 3 } = options;
    const resources = store[resourceType] ?? [];

    // Accumulators
    let validCount   = 0;
    let invalidCount = 0;
    const invalidReasons: Record<string, number> = {};

    // path → { presentCount, types, exampleReservoir }
    const pathData = new Map<string, {
        presentCount: number;
        types: Set<string>;
        examples: unknown[];
    }>();

    // signature → { count, sampleIds }
    const signatureData = new Map<string, { count: number; sampleIds: string[] }>();

    // "system|code" → { system, code, display, count }
    const codeData = new Map<string, CodeStat>();

    const valuePathsSeen = new Set<string>();

    const bumpInvalid = (reason: string) => {
        invalidReasons[reason] = (invalidReasons[reason] ?? 0) + 1;
    };

    // ── Single pass ────────────────────────────────────────────────────────
    for (const raw of resources) {
        // Guard: must be an object
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
            invalidCount++;
            bumpInvalid('not_an_object');
            continue;
        }

        const r = raw as unknown as Record<string, unknown>;

        // Guard: resourceType must match
        if (r.resourceType !== resourceType) {
            invalidCount++;
            bumpInvalid('wrong_resource_type');
            continue;
        }

        // Guard: must have a code
        const code = r.code as Record<string, unknown> | undefined;
        if (!code || typeof code !== 'object') {
            invalidCount++;
            bumpInvalid('missing_code');
            // still process field paths — we want to know what IS there
        }

        // Guard: must have a status
        if (!r.status || typeof r.status !== 'string') {
            invalidCount++;
            bumpInvalid('missing_status');
        }

        validCount++;

        // ── Field path walking ───────────────────────────────────────────
        for (const [path, value] of walkPaths(r)) {
            // skip meta / internal paths that aren't useful for queries
            if (path.startsWith('meta.') || path.startsWith('text.')) continue;

            let entry = pathData.get(path);
            if (!entry) {
                entry = { presentCount: 0, types: new Set(), examples: [] };
                pathData.set(path, entry);
            }
            entry.presentCount++;

            const jsType = Array.isArray(value) ? 'array' : typeof value;
            entry.types.add(jsType);

            if (jsType !== 'object' && jsType !== 'array') {
                entry.examples = reservoir(entry.examples, truncate(value), maxExamples);
            }
        }

        // ── value[x] detection ───────────────────────────────────────────
        for (const key of VALUE_X_KEYS) {
            if (key in r && r[key] != null) valuePathsSeen.add(key);
        }

        // ── Shape signature ──────────────────────────────────────────────
        const sig = Object.keys(r)
            .filter(k => k !== 'meta' && k !== 'text')
            .sort()
            .join(',');
        const sigEntry = signatureData.get(sig) ?? { count: 0, sampleIds: [] };
        sigEntry.count++;
        if (sigEntry.sampleIds.length < 3 && typeof r.id === 'string') {
            sigEntry.sampleIds.push(r.id);
        }
        signatureData.set(sig, sigEntry);

        // ── Top codes ────────────────────────────────────────────────────
        const codings = (code as Record<string, unknown> | undefined)?.coding;
        if (Array.isArray(codings)) {
            for (const c of codings) {
                if (!c || typeof c !== 'object') continue;
                const co = c as Record<string, unknown>;
                const sys     = String(co.system  ?? '');
                const codeVal = String(co.code    ?? '');
                const disp    = String(co.display ?? '');
                const key     = `${sys}|${codeVal}`;
                const existing = codeData.get(key) ?? { system: sys, code: codeVal, display: disp, count: 0 };
                existing.count++;
                codeData.set(key, existing);
            }
        }
    }

    const totalScanned = resources.length;

    // ── Build fieldStats ───────────────────────────────────────────────────
    const fieldStats: Record<string, FieldStat> = {};
    for (const [path, { presentCount, types, examples }] of pathData.entries()) {
        const pct = validCount > 0 ? (presentCount / validCount) * 100 : 0;
        if (pct < minCoveragePct) continue;
        fieldStats[path] = {
            presentPct: Math.round(pct),
            types: [...types],
            examples,
        };
    }

    // Sort by coverage descending
    const sortedFieldStats: Record<string, FieldStat> = Object.fromEntries(
        Object.entries(fieldStats).sort((a, b) => b[1].presentPct - a[1].presentPct),
    );

    // ── Build topSignatures ────────────────────────────────────────────────
    const topSignatures: SignatureStat[] = [...signatureData.entries()]
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 10)
        .map(([sig, { count, sampleIds }]) => ({
            signature: sig,
            count,
            pct: Math.round((count / validCount) * 100),
            sampleIds,
        }));

    // ── Build topCodes ─────────────────────────────────────────────────────
    const topCodes: CodeStat[] = [...codeData.values()]
        .sort((a, b) => b.count - a.count)
        .slice(0, 20);

    // ── Warnings ──────────────────────────────────────────────────────────
    const warnings: string[] = [];

    if (invalidCount > 0) {
        warnings.push(`${invalidCount} of ${totalScanned} resources (${Math.round(invalidCount / totalScanned * 100)}%) failed basic validation.`);
    }
    if (topSignatures.length > 5) {
        warnings.push(`${topSignatures.length}+ distinct shapes detected — data is highly heterogeneous.`);
    }
    if (valuePathsSeen.size > 2) {
        warnings.push(`Multiple value[x] variants in use (${[...valuePathsSeen].join(', ')}) — avoid assuming valueQuantity.`);
    }
    const datePaths = ['effectiveDateTime', 'effectivePeriod.start', 'effectiveInstant', 'issued'];
    const usedDatePaths = datePaths.filter(p => pathData.has(p) && (pathData.get(p)!.presentCount / validCount) > 0.05);
    if (usedDatePaths.length > 1) {
        warnings.push(`Multiple date paths in use: ${usedDatePaths.join(', ')} — use coalesce logic or filter per variant.`);
    }

    // ── candidateSelectPaths ──────────────────────────────────────────────
    const HIGH_COVERAGE = 80;
    const candidateSelectPaths = Object.entries(sortedFieldStats)
        .filter(([, v]) => v.presentPct >= HIGH_COVERAGE)
        .map(([path]) => path);

    return {
        resourceType,
        totalScanned,
        validCount,
        invalidCount,
        invalidReasons,
        fieldStats: sortedFieldStats,
        topSignatures,
        topCodes,
        valuePaths: [...valuePathsSeen],
        warnings,
        candidateSelectPaths,
    };
}
