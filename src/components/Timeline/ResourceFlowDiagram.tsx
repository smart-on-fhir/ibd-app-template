import { useMemo, useEffect, useRef, useState } from 'react';
import MermaidDiagram  from '../AIChat/MermaidDiagram';
import { type TimelineEvent } from './utils';
import { summarizeHumanName, summarizeOrganization } from '../../utils/summarizer';
import { ellipsis } from '../../utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FlowNode {
    id:           string;   // "ResourceType/resourceId"
    label:        string;   // human-readable single-line label
    resourceType: string;
    isStart:      boolean;
    tooltip:      string;   // shown as native browser hover title
}

interface FlowEdge {
    from:  string;  // FlowNode id
    to:    string;  // FlowNode id
    label: string;  // edge verb
}

// ─── Reference walking ────────────────────────────────────────────────────────

// Fields to skip — present on nearly every resource, add noise not signal
const SKIP_FIELDS = new Set([
    'subject', 'patient', 'beneficiary', 'performer', 'practitioner',
    'organization', 'author', 'recorder', 'asserter', 'enterer',
    'requester', 'location', 'managingOrganization', 'custodian',
    'meta', 'text', 'contained', 'extension', 'modifierExtension',
]);

// Fields where FHIR stores a child-→-parent reference but clinical flow is parent→child.
// When we see Observation.encounter = "Encounter/x", it means Encounter caused/hosted
// the Observation, so we draw: Encounter → Observation.
const REVERSE_FIELDS = new Set([
    'encounter', 'basedOn', 'partOf', 'derivedFrom', 'context',
    'request', 'inResponseTo', 'reasonReference',
]);

// Human-readable labels for edge verbs
const EDGE_LABELS: Record<string, string> = {
    encounter:       'during visit',
    basedOn:         'fulfills order',
    partOf:          'part of',
    derivedFrom:     'derived from',
    context:         'in context of',
    request:         'fulfills request',
    reasonReference: 'reason',
    hasMember:       'includes',
    result:          'resulted in',
    supportingInfo:  'supported by',
    insurance:       'covered by',
    diagnosis:       'diagnosis',
    procedure:       'procedure',
    referral:        'referral',
    coverage:        'covered by',
    facility:        'at',
    about:           'about',
    patient:         'patient',
};

// When a generic field name resolves to a specific resource type, use a better label.
// Key: "fieldName:ResourceType"
const EDGE_LABEL_BY_TYPE: Record<string, string> = {
    'individual:Practitioner':       'practitioner',
    'individual:Patient':            'patient',
    'individual:RelatedPerson':      'related person',
    'participant:Practitioner':      'practitioner',
    'participant:Patient':           'patient',
    'agent:Practitioner':            'practitioner',
    'who:Practitioner':              'practitioner',
    'onBehalfOf:Practitioner':       'on behalf of',
    'onBehalfOf:Organization':       'on behalf of',
};

function resolveEdgeLabel(fieldName: string, targetResourceType?: string): string {
    if (targetResourceType) {
        const override = EDGE_LABEL_BY_TYPE[`${fieldName}:${targetResourceType}`];
        if (override) return override;
    }
    return EDGE_LABELS[fieldName] ?? fieldName.replace(/([A-Z])/g, ' $1').toLowerCase().trim();
}

interface RefEntry {
    ref:       string;   // "ResourceType/id"
    fieldName: string;
    reversed:  boolean;  // true  → edge goes ref→node, false → edge goes node→ref
}

/** Recursively walk a FHIR resource JSON and collect all {reference} leaves. */
function extractReferences(
    obj: any,
    fieldName: string,
    depth: number,
    out: RefEntry[],
) {
    if (!obj || depth > 6) return;
    if (Array.isArray(obj)) {
        obj.forEach(item => extractReferences(item, fieldName, depth, out));
        return;
    }
    if (typeof obj === 'object') {
        if (typeof obj.reference === 'string'
            && (obj.reference.includes('/') || obj.reference.startsWith('#') || obj.reference.startsWith('urn:uuid:'))) {
            out.push({
                ref:      obj.reference,
                fieldName,
                reversed: SKIP_FIELDS.has(fieldName) ? false : REVERSE_FIELDS.has(fieldName),
            });
        }
        for (const [key, val] of Object.entries(obj)) {
            if (SKIP_FIELDS.has(key)) continue;
            if (typeof val === 'object') {
                extractReferences(val, key, depth + 1, out);
            }
        }
    }
}

/** Resolve "ResourceType/id", "urn:uuid:xxx", or "#localId" against the allResources map. */
function resolveRef(ref: string, allResources: Record<string, any[]>, uuidMap?: Map<string, any>): any | null {
    if (ref.startsWith('urn:uuid:')) {
        const uuid = ref.slice('urn:uuid:'.length);
        return uuidMap?.get(uuid) ?? null;
    }
    const slash = ref.lastIndexOf('/');
    if (slash < 0) return null;
    const rType = ref.slice(0, slash);
    const rId   = ref.slice(slash + 1);
    return allResources[rType]?.find(r => r.id === rId) ?? null;
}

// ─── Display labeling ────────────────────────────────────────────────────────

// function shortDate(dateStr: string | undefined): string {
//     if (!dateStr) return '';
//     const d = new Date(dateStr);
//     return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { dateStyle: 'medium' });
// }

function codingText(c: any): string {
    return c?.text ?? c?.coding?.[0]?.display ?? c?.coding?.[0]?.code ?? '';
}

function getDisplayLabel(resource: any): string {
    const rt = resource.resourceType ?? 'Resource';
    let name = '';
    switch (rt) {
        case 'Observation':
            name = codingText(resource.code);
            break;
        case 'DiagnosticReport':
            name = codingText(resource.code);
            break;
        case 'Condition':
            name = codingText(resource.code);
            break;
        case 'MedicationRequest':
            name = codingText(resource.medicationCodeableConcept)
                || resource.medicationReference?.display
                || 'Medication';
            break;
        case 'Immunization':
            name = codingText(resource.vaccineCode);
            break;
        case 'Procedure':
            name = codingText(resource.code);
            break;
        case 'Encounter':
            name = resource.type?.[0]?.text
                ?? resource.type?.[0]?.coding?.[0]?.display
                ?? resource.class?.display
                ?? resource.class?.code
                ?? 'Encounter';
            break;
        case 'ServiceRequest':
            name = codingText(resource.code);
            break;
        case 'Coverage':
            name = resource.class?.[0]?.name
                ?? resource.class?.[0]?.value
                ?? codingText(resource.type)
                ?? resource.subscriberId
                ?? 'Coverage';
            break;
        case 'Claim':
        case 'ExplanationOfBenefit':
            name = [codingText(resource.type)|| '', resource.use || 'claim'].filter(Boolean).join(' ');
            break;
        case 'CarePlan':
            name = resource.title ?? codingText(resource.category?.[0]) ?? 'CarePlan';
            break;
        case 'MedicationAdministration':
            name = codingText(resource.medicationCodeableConcept) || 'Med Admin';
            break;
        case 'Practitioner':
        case 'Patient':
        case 'RelatedPerson':
            name = summarizeHumanName(resource.name);
            break;
        case 'Organization':
            name = summarizeOrganization(resource);
            break;
        case 'Goal':
            name = resource.description?.text || 'Goal';
            break;
        default:
            name = resource.code?.text ?? resource.name?.[0]?.text ?? rt;
    }
    // Trim to 40 chars so Mermaid labels stay readable
    const trimmed = ellipsis(name || rt, 60);
    return `${trimmed}`;
    // const date = shortDate(
    //     resource.effectiveDateTime
    //     ?? resource.authoredOn
    //     ?? resource.occurrenceDateTime
    //     ?? resource.recordedDate
    //     ?? resource.period?.start
    //     ?? resource.onsetDateTime
    //     ?? resource.created
    // );
    // return date ? `${rt}: ${trimmed}\n${date}` : `${rt}: ${trimmed}`;
}

function getNodeTooltip(resource: any): string {
    const rt = resource.resourceType ?? 'Resource';
    const rawDate =
        resource.effectiveDateTime
        ?? resource.authoredOn
        ?? resource.occurrenceDateTime
        ?? resource.recordedDate
        ?? resource.period?.start
        ?? resource.onsetDateTime
        ?? resource.created;
    const date = rawDate
        ? new Date(rawDate).toLocaleDateString('en-US', { dateStyle: 'medium' })
        : '';
    return [rt, date].filter(Boolean).join(' · ');
}

// ─── Graph builder ────────────────────────────────────────────────────────────

const MAX_NODES = 15;

function resourceId(resource: any): string {
    return `${resource.resourceType}/${resource.id}`;
}

export function buildFlowGraph(
    startResource: any,
    allResources: Record<string, any[]>,
    reverseIndex?: Map<string, Array<{ res: any; entry: RefEntry }>>,
    uuidMap?: Map<string, any>,
): { nodes: Map<string, FlowNode>; edges: FlowEdge[] } {
    const nodes = new Map<string, FlowNode>();
    const edges: FlowEdge[] = [];
    const edgeSet = new Set<string>();

    const startId = resourceId(startResource);

    const addNode = (res: any, isStart = false) => {
        const id = resourceId(res);
        if (!nodes.has(id)) {
            nodes.set(id, {
                id,
                label:        getDisplayLabel(res),
                resourceType: res.resourceType,
                isStart,
                tooltip:      getNodeTooltip(res),
            });
        }
    };

    const addEdge = (from: string, to: string, label: string) => {
        const key = `${from}→${to}`;
        if (!edgeSet.has(key)) {
            edgeSet.add(key);
            edges.push({ from, to, label });
        }
    };

    // ── Contained resources: build local lookup map ─────────────────────────
    // FHIR allows a resource to carry inline "contained" resources referenced
    // as "#id" local references.  We harvest them here so they can be resolved
    // through resolveAnyRef just like any external resource.
    const containedById = new Map<string, any>();
    for (const c of (startResource.contained ?? [])) {
        if (c?.id && c?.resourceType) {
            // Assign a synthetic full id so resourceId() works uniformly.
            if (!c.id.includes('/')) {
                containedById.set(`#${c.id}`, { ...c });
            }
        }
    }

    /** Resolve either a local "#id", "urn:uuid:xxx", or "ResourceType/id" reference. */
    const resolveAnyRef = (ref: string): any | null => {
        if (ref.startsWith('#')) return containedById.get(ref) ?? null;
        return resolveRef(ref, allResources, uuidMap);
    };

    addNode(startResource, true);

    // ── Patient node: attach from start resource only ────────────────────────
    // subject/patient are in SKIP_FIELDS to avoid every node pointing to the
    // same patient in the backward scan. We handle it once, explicitly here.
    const patientRef =
        startResource.subject?.reference ??
        startResource.patient?.reference ??
        startResource.beneficiary?.reference;
    if (patientRef) {
        const patientRes = resolveAnyRef(patientRef);
        if (patientRes) {
            addNode(patientRes);
            addEdge(startId, resourceId(patientRes), 'patient');
        }
    }

    // ── Forward walk: follow refs OUT of startResource ──────────────────────
    const fwdRefs: RefEntry[] = [];
    extractReferences(startResource, '', 0, fwdRefs);

    for (const entry of fwdRefs) {
        if (nodes.size >= MAX_NODES) break;
        if (entry.fieldName === '') continue;  // top-level artifact

        const related = resolveAnyRef(entry.ref);
        if (!related) continue;
        addNode(related);

        const relId = resourceId(related);
        const edgeLabel = resolveEdgeLabel(entry.fieldName, related.resourceType);

        if (entry.reversed) {
            // FHIR ref goes child→parent but clinical flow goes parent→child
            addEdge(relId, startId, edgeLabel);
        } else {
            addEdge(startId, relId, edgeLabel);
        }

        // One level deeper for reversed (parent) nodes so we can get the
        // Encounter's type/org, for example — but only structural fields
        if (entry.reversed && nodes.size < MAX_NODES) {
            const deepRefs: RefEntry[] = [];
            extractReferences(related, '', 0, deepRefs);
            for (const deep of deepRefs) {
                if (nodes.size >= MAX_NODES) break;
                if (deep.fieldName === '') continue;
                // Only follow non-reversible refs from parent (avoid infinite loops)
                if (REVERSE_FIELDS.has(deep.fieldName)) continue;
                const deepRes = resolveAnyRef(deep.ref);
                if (!deepRes || resourceId(deepRes) === startId) continue;
                addNode(deepRes);
                const deepLabel = resolveEdgeLabel(deep.fieldName, deepRes.resourceType);
                addEdge(relId, resourceId(deepRes), deepLabel);
            }
        }
    }

    // ── Backward walk: find resources that reference startResource ───────────
    // (e.g. DiagnosticReport.result → this Observation)
    // Uses pre-built reverse index for O(1) lookup instead of scanning all resources.
    if (nodes.size < MAX_NODES) {
        const refPattern = `${startResource.resourceType}/${startResource.id}`;
        const backrefs = reverseIndex?.get(refPattern) ?? [];

        for (const { res, entry } of backrefs) {
            if (nodes.size >= MAX_NODES) break;
            const rid = resourceId(res);
            if (rid === startId) continue;
            addNode(res);
            const edgeLabel = resolveEdgeLabel(entry.fieldName, startResource.resourceType);
            if (REVERSE_FIELDS.has(entry.fieldName)) {
                addEdge(startId, rid, edgeLabel);
            } else {
                addEdge(rid, startId, edgeLabel);
            }
        }
    }

    return { nodes, edges };
}

// ─── Mermaid serializer ───────────────────────────────────────────────────────

/** Sanitize a string for use as a Mermaid node label (inside quotes). */
function sanitizeMermaidLabel(s: string): string {
    return s
        .replace(/\\/g, '\\\\')
        .replace(/"/g, "'")
        .replace(/[{}[\]|]/g, ' ')
        // Escape literal < > from content before adding <br/> tags
        .replace(/</g, '&lt;').replace(/>/g, '&gt;')
        // Use HTML line break — works with mermaid securityLevel: 'loose'
        .replace(/[\r\n]+/g, '<br/>');
}

/** Turn a node id like "Observation/abc-123" into a safe Mermaid node id. */
export function safeMermaidId(id: string): string {
    return id.replace(/[^a-zA-Z0-9_]/g, '_');
}

export function graphToMermaid(
    nodes: Map<string, FlowNode>,
    edges: FlowEdge[],
    options: {
        clickCallbackName?: string;
        fontSize?:          string;   // e.g. "13px"
    } = {},
): string {
    const { clickCallbackName, fontSize } = options;
    const lines: string[] = [];

    const themeVars: any = { fontFamily: 'inherit', primaryColor: '#e8f0fe', primaryBorderColor: '#318ebc' };
    if (fontSize) themeVars.fontSize = fontSize;

    const initObj: any = { theme: 'base', themeVariables: themeVars };
    lines.push(`%%{init: ${JSON.stringify(initObj)}}%%`);

    lines.push('flowchart LR');

    // Node declarations
    for (const node of nodes.values()) {
        const mid   = safeMermaidId(node.id);
        let label = sanitizeMermaidLabel(node.label);
        if (node.isStart) {
            lines.push(`  ${mid}["${label}"]`);
        } else {
            lines.push(`  ${mid}("${label}")`);
        }
    }

    // Edges
    for (const edge of edges) {
        const from  = safeMermaidId(edge.from);
        const to    = safeMermaidId(edge.to);
        const label = sanitizeMermaidLabel(edge.label);
        lines.push(`  ${from} -->|"${label}"| ${to}`);
    }

    // Style: start node (blue)
    const startNode = [...nodes.values()].find(n => n.isStart);
    if (startNode) {
        lines.push(`  style ${safeMermaidId(startNode.id)} fill:#318ebc,color:#fff,stroke:#1a6e9e`);
    }

    // Click handlers + tooltips.
    // Mermaid only accepts a tooltip 3rd-arg after a real callback name.
    // We always emit one (either the caller's or our global no-op) so the
    // tooltip syntax is valid; actual click handling uses the native DOM listener.
    const cbName = clickCallbackName ?? '__fhirFlowNoop';
    for (const node of nodes.values()) {
        const mid     = safeMermaidId(node.id);
        const tooltip = node.tooltip.replace(/"/g, "'");
        lines.push(`  click ${mid} ${cbName} "${tooltip}"`);
    }

    return lines.join('\n');
}

// ─── Component ────────────────────────────────────────────────────────────────

// Register a global no-op so Mermaid click directives with tooltips always parse correctly.
// Actual click handling is via the native DOM listener in ResourceFlowDiagram.
(window as any).__fhirFlowNoop = () => {};

export default function ResourceFlowDiagram({
    event,
    allResources,
    onNodeClick,
    fontSize = '13px',
    minWidth = '300px',
}: {
    event:         TimelineEvent | null | undefined;
    allResources:  Record<string, any[]>;
    onNodeClick?:  (resource: any) => void;
    fontSize?:     string;
    minWidth?:    string;
}) {
    // Maps safeMermaidId → original "ResourceType/id"  (populated in useMemo)
    const nodeIdMap     = useRef<Map<string, string>>(new Map());
    // Maps safeMermaidId → tooltip text
    const nodeTooltipMap = useRef<Map<string, string>>(new Map());
    // Currently selected (last-clicked) node id — drives orange-border highlight
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

    const containerRef = useRef<HTMLDivElement>(null);
    const tooltipRef   = useRef<HTMLDivElement>(null);

    // Build a UUID→resource map so urn:uuid: references (Synthea transaction bundles)
    // can be resolved in O(1). Synthea sets resource.id to the same UUID used in fullUrl.
    const uuidMap = useMemo(() => {
        const map = new Map<string, any>();
        for (const bucket of Object.values(allResources)) {
            for (const res of bucket) {
                if (res.id) map.set(res.id, res);
            }
        }
        return map;
    }, [allResources]);

    // Pre-build reverse reference index once per allResources change so the
    // backward walk in buildFlowGraph is O(1) instead of O(n * depth).
    // urn:uuid: refs are normalized to ResourceType/id so the lookup key matches.
    const reverseIndex = useMemo(() => {
        const index = new Map<string, Array<{ res: any; entry: RefEntry }>>();
        for (const bucket of Object.values(allResources)) {
            for (const res of bucket) {
                const refs: RefEntry[] = [];
                extractReferences(res, '', 0, refs);
                for (const entry of refs) {
                    if (!entry.ref || entry.fieldName === '') continue;
                    let indexRef = entry.ref;
                    if (indexRef.startsWith('urn:uuid:')) {
                        const target = uuidMap.get(indexRef.slice('urn:uuid:'.length));
                        if (!target) continue;
                        indexRef = `${target.resourceType}/${target.id}`;
                    }
                    const arr = index.get(indexRef);
                    if (arr) arr.push({ res, entry });
                    else index.set(indexRef, [{ res, entry }]);
                }
            }
        }
        return index;
    }, [allResources, uuidMap]);

    const chart = useMemo(() => {
        if (!event?.raw) return null;
        const { nodes, edges } = buildFlowGraph(event.raw, allResources, reverseIndex, uuidMap);
        if (nodes.size <= 1 && edges.length === 0) return null;
        nodeIdMap.current      = new Map([...nodes.values()].map(n => [safeMermaidId(n.id), n.id]));
        nodeTooltipMap.current = new Map([...nodes.values()].map(n => [safeMermaidId(n.id), n.tooltip]));
        return graphToMermaid(nodes, edges, { clickCallbackName: undefined, fontSize });
    }, [event, allResources, reverseIndex, uuidMap, fontSize]);

    // Reset selection when the start event changes
    useEffect(() => { setSelectedNodeId(null); }, [event]);

    // Native delegated click listener — more reliable than Mermaid click directives.
    // Walks up from the click target to find a <g> whose id starts with "flowchart-".
    useEffect(() => {
        const root = containerRef.current;
        if (!root) return;

        const handler = (e: MouseEvent) => {
            let el = e.target as Element | null;
            while (el && el !== root) {
                const id = el.getAttribute('id') ?? '';
                const m  = id.match(/^flowchart-([^-].+)-\d+$/);
                if (m) {
                    const safeId = m[1];
                    const origId = nodeIdMap.current.get(safeId);
                    if (origId) {
                        setSelectedNodeId(prev => prev === origId ? null : origId);
                        if (onNodeClick) {
                            const slash    = origId.lastIndexOf('/');
                            const resource = allResources[origId.slice(0, slash)]
                                ?.find((r: any) => r.id === origId.slice(slash + 1));
                            if (resource) onNodeClick(resource);
                        }
                    }
                    return;
                }
                el = el.parentElement;
            }
        };

        root.addEventListener('click', handler);
        return () => root.removeEventListener('click', handler);
    // allResources stable ref — intentionally omitted
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [onNodeClick, chart]);

    // Custom tooltip on hover — more reliable than SVG <title> elements.
    useEffect(() => {
        const root    = containerRef.current;
        const tipEl   = tooltipRef.current;
        if (!root || !tipEl) return;

        const findNodeG = (target: Element | null) => {
            let el = target;
            while (el && el !== root) {
                const m = (el.getAttribute('id') ?? '').match(/^flowchart-([^-].+)-\d+$/);
                if (m) return m[1];
                el = el.parentElement;
            }
            return null;
        };

        const placeTip = (e: MouseEvent) => {
            const rect = root.getBoundingClientRect();
            // Position relative to container, not the event target
            let x = e.clientX - rect.left + 12;
            let y = e.clientY - rect.top  + 12;
            // Clamp so tip stays inside the container
            x = Math.min(x, root.offsetWidth  - tipEl.offsetWidth  - 4);
            y = Math.min(y, root.offsetHeight - tipEl.offsetHeight - 4);
            tipEl.style.left = `${Math.max(0, x)}px`;
            tipEl.style.top  = `${Math.max(0, y)}px`;
        };

        const onOver = (e: MouseEvent) => {
            const safeId  = findNodeG(e.target as Element);
            const tooltip = safeId ? nodeTooltipMap.current.get(safeId) : undefined;
            if (!tooltip) { tipEl.style.display = 'none'; return; }
            tipEl.textContent   = tooltip;
            tipEl.style.display = 'block';
            placeTip(e);
        };

        const onMove = (e: MouseEvent) => {
            if (tipEl.style.display === 'none') return;
            placeTip(e);
        };

        const onOut = () => { tipEl.style.display = 'none'; };

        root.addEventListener('mouseover', onOver);
        root.addEventListener('mousemove', onMove);
        root.addEventListener('mouseout',  onOut);
        return () => {
            root.removeEventListener('mouseover', onOver);
            root.removeEventListener('mousemove', onMove);
            root.removeEventListener('mouseout',  onOut);
        };
    }, [chart]);

    // DOM-patch: highlight selected node only (padding is now handled via
    // label HTML, so no manual DOM adjustment required).
    useEffect(() => {
        const root = containerRef.current;
        if (!root) return;

        // Clear previous highlight
        root.querySelectorAll<SVGElement>('[data-fhir-selected]').forEach(el => {
            el.removeAttribute('data-fhir-selected');
            el.style.removeProperty('stroke');
            el.style.removeProperty('stroke-width');
        });

        if (!selectedNodeId) return;

        const apply = () => {
            const safeId = safeMermaidId(selectedNodeId);
            const nodeG  = root.querySelector<SVGGElement>(`[id^="flowchart-${safeId}-"]`);
            const shape  = nodeG?.querySelector<SVGElement>('rect, path, polygon');
            if (!shape) return false;
            shape.setAttribute('data-fhir-selected', '1');
            shape.style.stroke      = '#FF8800CC';
            shape.style.strokeWidth = '4px';
            return true;
        };

        if (!apply()) {
            const id = setTimeout(apply, 120);
            return () => clearTimeout(id);
        }
    }, [selectedNodeId, chart]);

    if (!event) {
        return (
            <div className='text-muted small text-center py-3'>
                <i className='bi bi-diagram-3 me-2 opacity-50' style={{ fontSize: '1.5rem', display: 'block', marginBottom: 6 }} />
                Click a timeline event to see its clinical context
            </div>
        );
    }

    if (!chart) {
        return (
            <div className='text-muted small text-center py-3'>
                <i className='bi bi-diagram-3 me-2 opacity-50' style={{ fontSize: '1.5rem', display: 'block', marginBottom: 6 }} />
                No related resources found for this event
            </div>
        );
    }

    return (
        <div ref={containerRef} style={{ overflowX: 'auto', position: 'relative', minWidth: minWidth || 'none' }}>
            <style>{`
                .mermaid-diagram .node rect,
                .mermaid-diagram .node path,
                .mermaid-diagram .node polygon { cursor: pointer; }
            `}</style>
            <div ref={tooltipRef} style={{
                display:         'none',
                position:        'absolute',
                background:      '#333',
                color:           '#fff',
                padding:         '3px 8px',
                borderRadius:    4,
                fontSize:        '0.75rem',
                whiteSpace:      'nowrap',
                pointerEvents:   'none',
                zIndex:          10,
            }} />
            <MermaidDiagram chart={chart} minWidth={minWidth} />
        </div>
    );
}
