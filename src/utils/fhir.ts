import type { Bundle, FhirResource, Patient, CapabilityStatement } from "fhir/r4";

/**
 * Global FHIR fetch configuration. Toggle `enableEverything` to disable the
 * `$everything` operation (useful for testing fallback flows).
 */
export const fhirConfig = {
    enableEverything: true,
    // milliseconds to wait between sequential requests when enabled (0 = no throttling)
    throttleMs: 50,
};

async function fetchJson(url: string, options?: RequestInit, maxRetries = 3, baseDelay = 500) {
    let attempt = 0;
    while (true) {
        attempt++;
        const res = await fetch(url, { headers: { Accept: 'application/fhir+json, application/json' }, ...(options || {}) });
        const text = await res.text();
        let parsed: any = null;
        try {
            parsed = text ? JSON.parse(text) : null;
        } catch (e) {
            parsed = text;
        }

        const bytes = typeof text === 'string' ? new TextEncoder().encode(text).length : 0;

        if (res.ok) return { data: parsed, text, bytes, status: res.status, ok: true };

        const status = res.status;

        // Detect HAPI version-constraint / concurrency errors from OperationOutcome
        let isVersionConstraint = false;
        try {
            const body = parsed;
            if (body && body.resourceType === 'OperationOutcome' && Array.isArray(body.issue)) {
                isVersionConstraint = body.issue.some((it: any) => {
                    const diag = String(it.diagnostics || '').toLowerCase();
                    return diag.includes('version constraint') || diag.includes('hapi-0550') || diag.includes('hapi-0826');
                });
            }
        } catch (e) {
            isVersionConstraint = false;
        }

        const shouldRetry = attempt <= maxRetries && (status === 429 || status === 503 || status === 409 || isVersionConstraint);
        if (!shouldRetry) {
            const err: any = new Error(`${res.status} ${res.statusText}`);
            err.status = res.status;
            err.body = parsed;
            err.bytes = bytes;
            throw err;
        }

        const wait = baseDelay * Math.pow(2, attempt - 1);
        await sleep(wait);
    }
}

/**
 * Fetch a Bundle and follow pagination (`link[relation=next]`) to aggregate all entries.
 */
async function fetchBundleAll(url: string, onPage?: (entries: FhirResource[], bytes?: number) => void): Promise<Bundle> {
    return fetchBundleAllWithThrottle(url, fhirConfig.throttleMs, onPage);
}

async function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchBundleAllWithThrottle(
    url: string,
    throttleMs?: number,
    onPage?: (entries: FhirResource[], bytes?: number) => void
): Promise<Bundle> {
    const combined: Bundle = { resourceType: 'Bundle', type: 'searchset', entry: [] } as Bundle;
    let nextUrl: string | null = url;
    const delay = throttleMs && throttleMs > 0 ? throttleMs : 0;

    while (nextUrl) {
        const resp: any = await fetchJson(nextUrl);
        const bundle = resp?.data as Bundle;
        const bytes = resp?.bytes as number | undefined;
        if (bundle && bundle.entry && bundle.entry.length) {
            const entries = bundle.entry.map((e) => e.resource).filter(Boolean) as FhirResource[];
            if (onPage) onPage(entries, bytes);
            combined.entry = (combined.entry || []).concat(bundle.entry);
        }

        const nextLink = (bundle as any)?.link?.find((l: any) => l.relation === 'next');
        nextUrl = nextLink?.url ?? null;

        if (nextUrl && delay) await sleep(delay);
    }

    return combined;
}

// Cache of capability info per base URL: resourceType -> Set(searchParam names)
const capabilityCache: Record<string, Record<string, Set<string>>> = {};

async function fetchServerCapabilities(base: string): Promise<Record<string, Set<string>>> {
    if (capabilityCache[base]) return capabilityCache[base];

    const map: Record<string, Set<string>> = {};
    try {
        const url = `${base.replace(/\/$/, '')}/metadata`;
        const resp: any = await fetchJson(url);
        const cs = resp?.data as CapabilityStatement;
        const rests = (cs && (cs as any).rest) || [];
        for (const rest of rests) {
            const resources = rest.resource || [];
            for (const r of resources) {
                try {
                    const name = r.type;
                    const sps = (r.searchParam || []).map((p: any) => p.name).filter(Boolean);
                    map[name] = new Set(sps);
                } catch (e) {
                    // ignore malformed entries
                }
            }
        }
    } catch (err) {
        // If capability fetch fails, leave map empty so code falls back to probing
    }

    capabilityCache[base] = map;
    return map;
}

function parseBundle(bundle: Bundle | null | undefined): FhirResource[] {
    if (!bundle || !bundle.entry) return [];
    return bundle.entry.map((e) => e.resource).filter(Boolean) as FhirResource[];
}

/**
 * Search for a Patient by MRN (identifier). Returns the first matching Patient or null.
 */
export async function fetchPatientByMRN(baseUrl: string, mrn: string, throttleMs?: number): Promise<Patient | null> {
    const url = `${baseUrl.replace(/\/$/, '')}/Patient?identifier=${encodeURIComponent(mrn)}`;
    try {
        const bundle: Bundle = throttleMs && throttleMs > 0 ? await fetchBundleAllWithThrottle(url, throttleMs) : await fetchBundleAll(url);
        const resources = parseBundle(bundle);
        return resources.length ? (resources[0] as Patient) : null;
    } catch (err) {
        console.warn('fetchPatientByMRN failed', err);
        return null;
    }
}


/**
 * Fetch a Patient by id.
 */
export async function fetchPatientById(baseUrl: string, id: string): Promise<Patient | null> {
    const url = `${baseUrl.replace(/\/$/, '')}/Patient/${encodeURIComponent(id)}`;
    try {
        const resp: any = await fetchJson(url);
        const resource = resp?.data;
        return resource as Patient;
    } catch (err) {
        console.warn('fetchPatientById failed', err);
        return null;
    }
}

/**
 * Try the $everything operation which returns a Bundle of all related resources.
 */
export async function fetchPatientEverything(
    baseUrl: string,
    patientId: string,
    throttleMs?: number,
    onResource?: (type: string, items: FhirResource[]) => void,
    onBytes?: (bytes: number) => void
): Promise<FhirResource[] | null> {
    const url = `${baseUrl.replace(/\/$/, '')}/Patient/${encodeURIComponent(patientId)}/$everything`;
    try {
        const pageHandler = (entries: FhirResource[], bytes?: number) => {
            if (onBytes && bytes) onBytes(bytes);
            if (!onResource) return;
            const map: Record<string, FhirResource[]> = {};
            entries.forEach((r) => {
                const t = (r as any).resourceType || 'Unknown';
                map[t] = map[t] || [];
                map[t].push(r);
            });
            for (const [t, items] of Object.entries(map)) onResource(t, items);
        };

        const bundle: Bundle = throttleMs && throttleMs > 0 ? await fetchBundleAllWithThrottle(url, throttleMs, pageHandler) : await fetchBundleAll(url, pageHandler);
        return parseBundle(bundle);
    } catch (err) {
        console.info('$everything not available or failed, will fallback', err);
        return null;
    }
}

/**
 * Fallback: query common resource types separately. Returns a map of resourceType -> resources[].
 */
export async function fetchPatientResourcesFallback(
    baseUrl: string,
    patientId: string,
    throttleMs?: number,
    onResource?: (type: string, items: FhirResource[]) => void,
    onBytes?: (bytes: number) => void
): Promise<Record<string, FhirResource[]>> {
    const base = baseUrl.replace(/\/$/, '');

    // Known-good conservative fallback list for servers that don't publish capabilities.
    const STATIC_PATIENT_RESOURCES = [
        'Observation',
        'Condition',
        'MedicationStatement',
        'MedicationRequest',
        'MedicationAdministration',
        'MedicationDispense',
        'AllergyIntolerance',
        'Procedure',
        'Encounter',
        'CarePlan',
        'Immunization',
        'DiagnosticReport',
        'DocumentReference',
        'QuestionnaireResponse',
        'ServiceRequest',
    ];

    async function getPatientResourceTypes(base: string): Promise<string[]> {
        const caps = await fetchServerCapabilities(base);
        const keys = Object.keys(caps || {});
        if (!keys.length) return STATIC_PATIENT_RESOURCES;

        const types: string[] = [];
        for (const [rType, params] of Object.entries(caps)) {
            if (params.has('patient') || params.has('subject')) types.push(rType);
        }

        return types.length ? types : STATIC_PATIENT_RESOURCES;
    }

    const results: Record<string, FhirResource[]> = {};

    const delay = throttleMs && throttleMs > 0 ? throttleMs : 0;

    const resourceTypes = await getPatientResourceTypes(base);

    if (delay > 0) {
        // Sequential, throttled requests
        for (const type of resourceTypes) {
            // try to detect which search parameter is supported via CapabilityStatement
            const caps = await fetchServerCapabilities(base);
            const supported = caps[type] || new Set<string>();

            const urls: string[] = [];
            if (supported.has('patient')) urls.push(`${base}/${type}?patient=${encodeURIComponent(patientId)}`);
            if (supported.has('subject')) urls.push(`${base}/${type}?subject=Patient/${encodeURIComponent(patientId)}`);
            // If capability info lacks this type, fall back to both (getPatientResourceTypes already
            // filtered types, but we still try both params to be safe).
            if (!urls.length) {
                urls.push(`${base}/${type}?patient=${encodeURIComponent(patientId)}`);
                urls.push(`${base}/${type}?subject=Patient/${encodeURIComponent(patientId)}`);
            }

            let found: FhirResource[] = [];
            for (const url of urls) {
                try {
                    const bundle: Bundle = await fetchBundleAllWithThrottle(url, delay, (entries, bytes) => {
                        if (onBytes && bytes) onBytes(bytes);
                        const items = entries.filter((r) => (r as any).resourceType === type);
                        if (items.length && onResource) onResource(type, items);
                    });
                    const items = parseBundle(bundle).filter((r) => (r as any).resourceType === type);
                    if (items.length) {
                        found = items;
                        break;
                    }
                } catch (err: any) {
                    // ignore and try next url
                    // If server complains about unknown search parameter, update cache
                    try {
                        const body = err?.body;
                        if (body && body.resourceType === 'OperationOutcome') {
                            // If we had an advertised capability, remove the unsupported param.
                            if (capabilityCache[base] && capabilityCache[base][type]) {
                                const param = url.includes('?patient=') ? 'patient' : url.includes('?subject=') ? 'subject' : null;
                                if (param) capabilityCache[base][type].delete(param);
                            } else {
                                // No capability info — mark this resource as having no patient/subject params
                                capabilityCache[base] = capabilityCache[base] || {};
                                capabilityCache[base][type] = new Set<string>();
                            }
                        }
                    } catch (e) {
                        // ignore cache update errors
                    }
                }

                // small delay between different url attempts for the same resource
                await sleep(delay);
            }

            results[type] = found.length ? found : [];

            // throttle between resource types
            await sleep(delay);
        }
    } else {
        // Parallel, fast path
        // Parallel fast path — use capability info to pick params where available
        const caps = await fetchServerCapabilities(base);
        await Promise.all(
            resourceTypes.map(async (type) => {
                const supported = caps[type] || new Set<string>();

                const urls: string[] = [];
                if (supported.has('patient')) urls.push(`${base}/${type}?patient=${encodeURIComponent(patientId)}`);
                if (supported.has('subject')) urls.push(`${base}/${type}?subject=Patient/${encodeURIComponent(patientId)}`);
                if (!urls.length) {
                    urls.push(`${base}/${type}?patient=${encodeURIComponent(patientId)}`);
                    urls.push(`${base}/${type}?subject=Patient/${encodeURIComponent(patientId)}`);
                }

                for (const url of urls) {
                    try {
                        const bundle: Bundle = await fetchBundleAll(url, (entries, bytes) => {
                            if (onBytes && bytes) onBytes(bytes);
                            const items = entries.filter((r) => (r as any).resourceType === type);
                            if (items.length && onResource) onResource(type, items);
                        });
                        const items = parseBundle(bundle).filter((r) => (r as any).resourceType === type);
                        if (items.length) {
                            results[type] = items;
                            return;
                        }
                    } catch (err: any) {
                        try {
                            const body = err?.body;
                            if (body && body.resourceType === 'OperationOutcome') {
                                if (capabilityCache[base] && capabilityCache[base][type]) {
                                    const param = url.includes('?patient=') ? 'patient' : url.includes('?subject=') ? 'subject' : null;
                                    if (param) capabilityCache[base][type].delete(param);
                                } else {
                                    capabilityCache[base] = capabilityCache[base] || {};
                                    capabilityCache[base][type] = new Set<string>();
                                }
                            }
                        } catch (e) {
                            // ignore cache update errors
                        }
                        // continue to next url
                    }
                }

                results[type] = [];
            })
        );
    }

    return results;
}

/**
 * Convenience wrapper: given a base FHIR URL and a patient MRN or id, fetch all
 * available data. It will try MRN lookup if `mrn` is provided, otherwise use
 * `id` directly. It prefers the `$everything` operation, and falls back to
 * per-resource queries.
 */
export async function fetchAllPatientData(
    baseUrl: string,
    opts: {
        mrn?: string;
        id?: string;
        useEverything?: boolean;
        throttleMs?: number;
        onResource?: (type: string, items: FhirResource[]) => void;
        onPatient?: (patient: Patient) => void;
        onBytes?: (bytes: number) => void
    } = {}
): Promise<{ patient: Patient | null; resources: Record<string, FhirResource[]> }> {
    let patient: Patient | null = null;
    if (opts.id) {
        patient = await fetchPatientById(baseUrl, opts.id);
    } else if (opts.mrn) {
        const throttleMs = opts.throttleMs ?? fhirConfig.throttleMs;
        patient = await fetchPatientByMRN(baseUrl, opts.mrn, throttleMs);
    }

    if (!patient || !patient.id) {
        return { patient, resources: {} };
    }

    if (opts.onPatient && patient) {
        opts.onPatient(patient);
    }

    const patientId = patient.id;

    const shouldUseEverything = opts.useEverything ?? fhirConfig.enableEverything;
    const throttleMs = opts.throttleMs ?? fhirConfig.throttleMs;

    let everything: FhirResource[] | null = null;
    if (shouldUseEverything) {
        everything = await fetchPatientEverything(baseUrl, patientId, throttleMs, opts.onResource, opts.onBytes);
    }

    if (everything) {
        // group by resourceType
        const map: Record<string, FhirResource[]> = {};
        everything.forEach((r: FhirResource) => {
            const t = r.resourceType || 'Unknown';
            map[t] = map[t] || [];
            map[t].push(r);
        });
        return { patient, resources: map };
    }

    const fallback = await fetchPatientResourcesFallback(baseUrl, patientId, throttleMs, opts.onResource, opts.onBytes);
    return { patient, resources: fallback };
}

/**
 * Fetch a list of Patient resources from the server. Uses `_count` to limit page size
 * then follows pagination to return a complete array of Patient resources.
 */
export async function fetchPatients(baseUrl: string, count = 50): Promise<Patient[]> {
    const base = baseUrl.replace(/\/$/, '');
    const url = `${base}/Patient?_count=${count}`;
    try {
        const bundle: Bundle = await fetchBundleAll(url);
        const resources = parseBundle(bundle).filter((r) => (r as any).resourceType === 'Patient') as Patient[];
        return resources;
    } catch (err) {
        console.warn('fetchPatients failed', err);
        return [];
    }
}
