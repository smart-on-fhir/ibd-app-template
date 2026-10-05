import type { FhirResource, Patient, Observation, MedicationRequest } from 'fhir/r4';
import type { ChatCompletionTool } from 'openai/resources/chat/completions';
import type { FhirQuery } from './types';
import { executeQuery } from './queryEngine';
import { describeResource } from '../tools/profiler';

export type ResourcesByType = Record<string, FhirResource[]>;

// ---------------------------------------------------------------------------
// Tool definitions (JSON Schema for LLM)
// ---------------------------------------------------------------------------

export const TOOL_DEFINITIONS: ChatCompletionTool[] = [
    {
        type: 'function',
        function: {
            name: 'get_observation_trend',
            description:
                'Returns a compact time-series of values for a specific lab or vital, for use in prose text (latest value, range, change over time, abnormal flags). ' +
                'Each data point includes: value, flag (H/L/HH/LL/N or null), refLow, refHigh. ' +
                'Do NOT use this to populate a lab_trend_panel component — that component pulls its own data automatically. ' +
                'Search by LOINC code or free text (matched against code.text and code.coding[].display).',
            parameters: {
                type: 'object',
                properties: {
                    loinc: { type: 'string', description: 'LOINC code (exact match).' },
                    text:  { type: 'string', description: 'Free-text search against code display / code.text (case-insensitive contains).' },
                    limit: { type: 'integer', description: 'Max data points to return, most-recent first. Default 30, max 100.' },
                },
                additionalProperties: false,
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'get_medications',
            description:
                'Returns a list of medications with clinical detail: name, status, start date (authoredOn), dose, route, frequency, and reason. ' +
                'Note: stop dates are not reliably stored in FHIR MedicationRequest — do not infer or guess them. ' +
                'Much cheaper than querying MedicationRequest directly. ' +
                'Set activeOnly to false to include stopped/completed medications.',
            parameters: {
                type: 'object',
                properties: {
                    activeOnly: { type: 'boolean', description: 'If true (default), return only active medications.' },
                    text:       { type: 'string',  description: 'Optional free-text filter on medication name (case-insensitive).' },
                },
                additionalProperties: false,
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'query_patient_data',
            description:
                'General-purpose FHIRPath query. Use get_observation_trend / get_medications for labs and meds — ' +
                'those are cheaper. Reserve this for resource types or fields those tools do not cover. ' +
                'Call describe_resource first to discover valid field paths.',
            parameters: {
                type: 'object',
                required: ['from', 'select'],
                properties: {
                    from:     { type: 'string', description: 'FHIR resource type (e.g. "Condition", "Encounter").' },
                    select:   { type: 'object', description: 'Map of alias → FHIRPath expression.', additionalProperties: { type: 'string' } },
                    where:    { type: 'string', description: 'FHIRPath boolean filter. Date shortcuts: $now, $now-30d, $now-6m, $now-1y.' },
                    orderBy:  { type: 'string', description: 'FHIRPath sort key.' },
                    orderDir: { type: 'string', enum: ['asc', 'desc'] },
                    limit:    { type: 'integer', description: 'Max rows. Hard cap is 50.' },
                    offset:   { type: 'integer' },
                },
                additionalProperties: false,
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'describe_resource',
            description:
                'Profile a resource type: returns high-coverage FHIRPath expressions, top codes, and warnings. ' +
                'Call before query_patient_data on an unfamiliar resource type.',
            parameters: {
                type: 'object',
                required: ['resourceType'],
                properties: {
                    resourceType: { type: 'string', description: 'FHIR resource type to profile.' },
                },
                additionalProperties: false,
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'get_patient_summary',
            description: 'Returns patient demographics: name, DOB, age, gender.',
            parameters: { type: 'object', properties: {}, additionalProperties: false },
        },
    },
    {
        type: 'function',
        function: {
            name: 'list_available_resource_types',
            description: 'Lists all FHIR resource types in the record with counts. Call first to know what data is available.',
            parameters: { type: 'object', properties: {}, additionalProperties: false },
        },
    },
    {
        type: 'function',
        function: {
            name: 'search_clinical_text',
            description:
                'Full-text search across all narrative and free-text content in the FHIR record. ' +
                'Searches: Observation.valueString, *.note[].text, DiagnosticReport.conclusion and inline text/html reports, ' +
                'DocumentReference inline text/plain and text/html attachments, AllergyIntolerance.reaction.description, ClinicalImpression.summary. ' +
                'Binary formats (PDF, RTF) and URL-referenced attachments are listed as skipped with metadata (date, note type) so the user can be informed. ' +
                'Returns snippets (±80 chars around match) with resource type, date, field path, note type, and author where available. ' +
                'Use this to find narrative descriptions of symptoms, procedures, assessments, dermatology findings, menstrual history, etc.',
            parameters: {
                type: 'object',
                required: ['query'],
                properties: {
                    query:         { type: 'string',  description: 'Case-insensitive search term.' },
                    resourceTypes: { type: 'array', items: { type: 'string' }, description: 'Optional filter to specific FHIR resource types, e.g. ["DocumentReference", "DiagnosticReport"].' },
                    limit:         { type: 'integer', description: 'Max matching results to return (default 20, max 50).' },
                },
                additionalProperties: false,
            },
        },
    },
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function medName(r: MedicationRequest): string {
    return (
        r.medicationCodeableConcept?.text ??
        r.medicationCodeableConcept?.coding?.[0]?.display ??
        (r.medicationReference as { display?: string } | undefined)?.display ??
        'Unknown'
    );
}

function obsName(r: Observation): string {
    return r.code?.text ?? r.code?.coding?.[0]?.display ?? r.code?.coding?.[0]?.code ?? '?';
}

// ---------------------------------------------------------------------------
// Tool dispatcher
// ---------------------------------------------------------------------------

export function runTool(
    name: string,
    args: Record<string, unknown>,
    store: ResourcesByType,
): unknown {
    switch (name) {

        case 'get_observation_trend': {
            const observations = (store['Observation'] ?? []) as Observation[];
            const searchLoinc  = args.loinc as string | undefined;
            const searchText   = (args.text as string | undefined)?.toLowerCase();
            const limit        = Math.min((args.limit as number | undefined) ?? 30, 100);

            const matched = observations.filter((r) => {
                if (searchLoinc) return r.code?.coding?.some((c) => c.code === searchLoinc);
                if (searchText) {
                    const t = (r.code?.text ?? '').toLowerCase();
                    const d = (r.code?.coding?.[0]?.display ?? '').toLowerCase();
                    return t.includes(searchText) || d.includes(searchText);
                }
                return false;
            });

            const sorted = matched
                .filter((r) => r.effectiveDateTime)
                .sort((a, b) => (a.effectiveDateTime! < b.effectiveDateTime! ? -1 : 1));

            const sample = sorted[0];
            return {
                display: sample ? obsName(sample) : null,
                loinc:   sample?.code?.coding?.find((c) => c.system?.includes('loinc'))?.code ?? null,
                unit:    sample?.valueQuantity?.unit ?? null,
                count:   matched.length,
                points:  sorted.slice(-limit).map((r) => ({
                    date:    r.effectiveDateTime!.slice(0, 10),
                    value:   r.valueQuantity?.value ?? null,
                    flag:    r.interpretation?.[0]?.coding?.[0]?.code ?? null,
                    refLow:  r.referenceRange?.[0]?.low?.value  ?? null,
                    refHigh: r.referenceRange?.[0]?.high?.value ?? null,
                })),
            };
        }

        case 'get_medications': {
            const meds       = (store['MedicationRequest'] ?? []) as MedicationRequest[];
            const activeOnly = (args.activeOnly as boolean | undefined) ?? true;
            const filter     = (args.text as string | undefined)?.toLowerCase();

            return meds
                .filter((r) => {
                    if (activeOnly && r.status !== 'active') return false;
                    if (filter && !medName(r).toLowerCase().includes(filter)) return false;
                    return true;
                })
                .map((r) => {
                    const di = r.dosageInstruction?.[0];
                    const dose = di?.doseAndRate?.[0]?.doseQuantity;
                    return {
                        name:      medName(r),
                        status:    r.status,
                        start:     r.authoredOn?.slice(0, 10) ?? null,
                        dose:      dose ? `${dose.value} ${dose.unit ?? ''}`.trim() : null,
                        route:     di?.route?.text ?? di?.route?.coding?.[0]?.display ?? null,
                        frequency: di?.text ?? di?.timing?.code?.text ?? null,
                        reason:    r.reasonCode?.[0]?.text ?? r.reasonCode?.[0]?.coding?.[0]?.display ?? null,
                        code:      r.medicationCodeableConcept?.coding?.[0]?.code ?? null,
                    };
                })
                .sort((a, b) => (b.start ?? '') > (a.start ?? '') ? 1 : -1);
        }

        case 'query_patient_data': {
            // Override limit — hard cap lowered to 50 to protect context budget
            const q = args as unknown as FhirQuery;
            return executeQuery({ ...q, limit: Math.min(q.limit ?? 50, 50) }, store);
        }

        case 'describe_resource': {
            const profile = describeResource(args.resourceType as string, store);
            return {
                resourceType:         profile.resourceType,
                validCount:           profile.validCount,
                invalidCount:         profile.invalidCount,
                warnings:             profile.warnings,
                valuePaths:           profile.valuePaths,
                topCodes:             profile.topCodes.slice(0, 10),
                candidateSelectPaths: profile.candidateSelectPaths,
            };
        }

        case 'get_patient_summary': {
            const pt = (store['Patient'] ?? [])[0] as Patient | undefined;
            if (!pt) return { error: 'No patient data loaded.' };
            const nameEntry = pt.name?.[0];
            const name = [[nameEntry?.given?.join(' '), nameEntry?.family].filter(Boolean).join(' ')].filter(Boolean)[0] ?? 'Unknown';
            let age: number | null = null;
            if (pt.birthDate) {
                const b = new Date(pt.birthDate), now = new Date();
                age = now.getFullYear() - b.getFullYear();
                if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) age--;
            }
            return { name, birthDate: pt.birthDate ?? null, age, gender: pt.gender ?? null };
        }

        case 'list_available_resource_types':
            return Object.fromEntries(Object.entries(store).map(([t, items]) => [t, items.length]));

        case 'search_clinical_text': {
            const rawQuery  = (args.query as string | undefined) ?? '';
            const q         = rawQuery.toLowerCase().trim();
            if (!q) return { error: 'query is required' };
            const limit      = Math.min((args.limit as number | undefined) ?? 20, 50);
            const onlyTypes  = args.resourceTypes as string[] | undefined;
            const MAX_B64    = 150_000; // ~112 KB decoded — skip larger attachments

            type Hit = { resourceType: string; id: string; date: string | null; field: string; noteType?: string; author?: string; snippet: string };
            type Skip = { resourceType: string; id: string; date: string | null; noteType?: string; reason: string };

            const results: Hit[]  = [];
            const skipped: Skip[] = [];

            function stripHtml(html: string) {
                return html.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
            }

            function decode64(data: string, contentType: string): string {
                const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
                const text  = new TextDecoder().decode(bytes);
                return contentType.includes('html') ? stripHtml(text) : text;
            }

            function snip(text: string): string {
                const idx = text.toLowerCase().indexOf(q);
                if (idx === -1) return text.slice(0, 160) + (text.length > 160 ? '…' : '');
                const s = Math.max(0, idx - 80);
                const e = Math.min(text.length, idx + q.length + 80);
                return (s > 0 ? '…' : '') + text.slice(s, e) + (e < text.length ? '…' : '');
            }

            function getDate(a: any): string | null {
                return (
                    a.effectiveDateTime?.slice(0, 10) ??
                    a.recordedDate?.slice(0, 10) ??
                    a.onsetDateTime?.slice(0, 10) ??
                    a.authoredOn?.slice(0, 10) ??
                    a.performedDateTime?.slice(0, 10) ??
                    a.issued?.slice(0, 10) ??
                    a.date?.slice(0, 10) ??
                    a.context?.period?.start?.slice(0, 10) ??
                    null
                );
            }

            function tryHit(text: string | undefined, r: any, field: string, extra?: { noteType?: string; author?: string }) {
                if (!text || results.length >= limit) return;
                const clean = text.includes('<') ? stripHtml(text) : text;
                if (!clean.toLowerCase().includes(q)) return;
                results.push({ resourceType: r.resourceType, id: r.id ?? '', date: getDate(r), field, ...extra, snippet: snip(clean) });
            }

            for (const [rType, resources] of Object.entries(store)) {
                if (onlyTypes && !onlyTypes.includes(rType)) continue;
                if (results.length >= limit) break;

                for (const r of resources) {
                    const a = r as any;

                    if (rType === 'Observation') {
                        tryHit(a.valueString, r, 'valueString');
                        for (const n of a.note ?? []) tryHit(n.text, r, 'note.text');
                    }

                    if (rType === 'Condition') {
                        for (const n of a.note ?? []) tryHit(n.text, r, 'note.text');
                    }

                    if (rType === 'Procedure') {
                        for (const n of a.note ?? []) tryHit(n.text, r, 'note.text');
                    }

                    if (rType === 'AllergyIntolerance') {
                        for (const n of a.note ?? []) tryHit(n.text, r, 'note.text');
                        for (const rxn of a.reaction ?? []) tryHit(rxn.description, r, 'reaction.description');
                    }

                    if (rType === 'ClinicalImpression') {
                        tryHit(a.summary, r, 'summary');
                        for (const n of a.note ?? []) tryHit(n.text, r, 'note.text');
                    }

                    if (rType === 'DiagnosticReport') {
                        tryHit(a.conclusion, r, 'conclusion', { noteType: a.code?.text });
                        for (const pf of a.presentedForm ?? []) {
                            const ct: string = pf.contentType ?? '';
                            if (!pf.data) {
                                skipped.push({ resourceType: rType, id: a.id, date: getDate(a), noteType: a.code?.text, reason: 'URL-referenced, not inline' });
                            } else if (ct && !ct.startsWith('text/') && !ct.startsWith('application/xhtml')) {
                                skipped.push({ resourceType: rType, id: a.id, date: getDate(a), noteType: a.code?.text, reason: `non-text format: ${ct}` });
                            } else if (pf.data.length > MAX_B64) {
                                skipped.push({ resourceType: rType, id: a.id, date: getDate(a), noteType: a.code?.text, reason: 'attachment too large' });
                            } else {
                                try { tryHit(decode64(pf.data, ct), r, `presentedForm`, { noteType: a.code?.text }); } catch { /* bad base64 */ }
                            }
                        }
                    }

                    if (rType === 'DocumentReference') {
                        const noteType = a.type?.text ?? a.type?.coding?.[0]?.display ?? undefined;
                        const author   = a.author?.[0]?.display ?? undefined;
                        for (const content of a.content ?? []) {
                            const att = content.attachment;
                            if (!att) continue;
                            const ct: string = att.contentType ?? '';
                            if (!att.data) {
                                skipped.push({ resourceType: rType, id: a.id, date: getDate(a), noteType, reason: att.url ? 'URL-referenced, not inline' : 'no content data' });
                            } else if (ct && !ct.startsWith('text/') && !ct.startsWith('application/xhtml')) {
                                skipped.push({ resourceType: rType, id: a.id, date: getDate(a), noteType, reason: `non-text format: ${ct}` });
                            } else if (att.data.length > MAX_B64) {
                                skipped.push({ resourceType: rType, id: a.id, date: getDate(a), noteType, reason: 'attachment too large' });
                            } else {
                                try { tryHit(decode64(att.data, ct), r, `content`, { noteType, author }); } catch { /* bad base64 */ }
                            }
                        }
                    }
                }
            }

            return { count: results.length, results, skippedCount: skipped.length, skipped: skipped.slice(0, 30) };
        }

        default:
            return { error: `Unknown tool: ${name}` };
    }
}
