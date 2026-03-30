import Collapse from "../generic/Collapse";
import TimelineEventView from "./TimelineEventView";
import ResourceFlowDiagram from "./ResourceFlowDiagram";
import { getIconForResourceType, type TimelineEvent } from "./utils";
import FhirResourceJsonViewer from "../JsonViewer/FhirJsonViewer";
import { useState, useEffect, useMemo } from "react";
import { useSearchParams, Link } from "react-router-dom";
import ResourceSummary from "../ResourceSummary";
import NoteContentViewer from "./NoteContentViewer";
import { hasNarrativeContent } from "./lenses";


/** Shallow-walk a resource's references and return all note-bearing resources (including itself). */
function findReferencedNotes(raw: any, allResources: Record<string, any[]>): any[] {
    const notes: any[] = [];
    const seen = new Set<string>();

    const maybeAdd = (res: any) => {
        if (!res?.resourceType || !res?.id) return;
        const id = `${res.resourceType}/${res.id}`;
        if (seen.has(id)) return;
        seen.add(id);
        if (hasNarrativeContent(res)) notes.push(res);
    };

    const walk = (obj: any) => {
        if (!obj || typeof obj !== 'object') return;
        if (Array.isArray(obj)) { obj.forEach(walk); return; }
        if (typeof obj.reference === 'string') {
            const ref = obj.reference;
            const slash = ref.lastIndexOf('/');
            if (slash >= 0) {
                const resolved = allResources[ref.slice(0, slash)]?.find((r: any) => r.id === ref.slice(slash + 1));
                if (resolved) maybeAdd(resolved);
            }
        }
        for (const val of Object.values(obj)) {
            if (typeof val === 'object') walk(val);
        }
    };

    maybeAdd(raw);
    walk(raw);
    return notes;
}

export default function TimelineEventsPanel({ events, allResources, clickedEvent, onNodeClick: onNodeClickProp }: {
    events:        TimelineEvent[];
    allResources:  Record<string, any[]>;
    clickedEvent?: TimelineEvent | null;
    onNodeClick?:  (resource: any) => void;

}) {

    const [searchParams] = useSearchParams();
    const makeResourceUrl = (res: any) => {
        const next = new URLSearchParams(searchParams);
        next.set('resource', `${res.resourceType}/${res.id}`);
        next.delete('start');
        next.delete('end');
        return `?${next.toString()}`;
    };

    const [selectedResource, setSelectedResource] = useState<any>(clickedEvent?.raw ?? (events.length === 1 ? events[0].raw : null));

    // Determine if the Note tab should be shown for the current resource
    const showNoteTab = !!selectedResource && hasNarrativeContent(selectedResource);
    const [tab, setTab] = useState<string>(() => showNoteTab ? 'note' : 'summary');

    useEffect(() => {
        const resource = clickedEvent?.raw ?? (events.length === 1 ? events[0].raw : null);
        setSelectedResource(resource);
        // Default to Note tab when the selected resource has narrative content
        const isNote = !!resource && hasNarrativeContent(resource);
        setTab(isNote ? 'note' : 'summary');
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clickedEvent, events]);

    // When the flow diagram sets a different resource directly, re-validate the active tab.
    // If the new resource doesn't support the Note tab, fall back to Summary.
    useEffect(() => {
        const isNote = !!selectedResource && hasNarrativeContent(selectedResource);
        if (!isNote) setTab(t => t === 'note' ? 'summary' : t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedResource]);

    const noteResources = useMemo(() => {
        const seen = new Set<string>();
        const results: Array<{ event: TimelineEvent; resource: any }> = [];
        for (const ev of events) {
            for (const res of findReferencedNotes(ev.raw, allResources)) {
                const id = `${res.resourceType}/${res.id}`;
                if (!seen.has(id)) {
                    seen.add(id);
                    results.push({ event: ev, resource: res });
                }
            }
        }
        return results;
    }, [events, allResources]);
    const [multiTab, setMultiTab] = useState<'events' | 'notes'>('events');

    const grouped = events
        .slice()
        .sort((a, b) => +new Date(b.date) - +new Date(a.date))
        .reduce<Record<string, TimelineEvent[]>>((acc, ev) => {
            (acc[ev.resourceType] ??= []).push(ev);
            return acc;
        }, {});

    if (selectedResource) {
        return (
            <div className="m-2 py-2">
                <h5>Selected Event</h5>
                <div className="d-grid" style={{ gridTemplateColumns: '3fr 2fr', width: '100%', gap: '1rem' }}>
                    <div className="">
                        <div className='small pe-2 h-100 mw-100 overflow-auto border-end' style={{
                            minHeight: '200px',
                            overflow : 'auto'
                        }}>
                            <ResourceFlowDiagram
                                event={clickedEvent}
                                allResources={allResources}
                                onNodeClick={setSelectedResource}
                                fontSize="clamp(14px, 2vw, 0.8rem)"
                                minWidth="400px"
                            />
                        </div>
                    </div>
                    <div className='overflow-hidden'>
                        <div className="nav nav-pills justify-content-center pb-2 border-bottom small">
                            {showNoteTab && (
                                <button className={"nav-link px-4 py-1 " + (tab === 'note' ? 'active' : '')} onClick={() => setTab('note')}>
                                    Notes
                                </button>
                            )}
                            <button className={"nav-link px-4 py-1 " + (tab === 'summary' ? 'active' : '')} onClick={() => setTab('summary')}>Summary</button>
                            <button className={"nav-link px-4 py-1 " + (tab === 'data' ? 'active' : '')} onClick={() => setTab('data')}>Tree</button>
                            <button className={"nav-link px-4 py-1 " + (tab === 'raw' ? 'active' : '')} onClick={() => setTab('raw')}>FHIR</button>
                        </div>
                        { tab === 'note' && <div className="small">
                            <NoteContentViewer resource={selectedResource} />
                        </div> }
                        { tab === 'summary' && <div className="small">
                            <ResourceSummary resource={selectedResource} />
                        </div> }
                        { tab === 'data' && <div className="flex-grow-1">
                            <div className='mt-1 small'>
                                <FhirResourceJsonViewer resource={selectedResource} allResources={allResources} />
                            </div>
                        </div> }
                        { tab === 'raw' && <div className="flex-grow-1">
                            <pre className='mt-1 text-muted' style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: '0.7rem', maxHeight: '400px', overflow: 'auto' }}>{JSON.stringify(selectedResource, null, 2)}</pre>
                        </div> }
                    </div>
                </div>
            </div>
        );
    }

    if (Object.keys(grouped).length === 0) {
        return (
            <div className='text-center text-muted small my-4'>
                No timeline events selected.
            </div>
        );
    }

    return (
        <div className="container-fluid my-2 pt-2">
            <div className="row">
                <div className='lh-normal col'>
                    <div className="d-flex align-items-center justify-content-between mb-2">
                        <h5 className="mb-0">Selected Events</h5>
                        <div className="nav nav-pills small">
                            <button className={"nav-link px-3 py-1 " + (multiTab === 'events' ? 'active' : '')} onClick={() => setMultiTab('events')}>
                                Events
                            </button>
                            <button className={"nav-link px-3 py-1 " + (multiTab === 'notes' ? 'active' : '') + (noteResources.length === 0 ? ' disabled' : '')} onClick={() => noteResources.length > 0 && setMultiTab('notes')}>
                                <i className="bi bi-file-earmark-text me-1" />
                                Notes
                                <span className={"badge rounded-pill ms-1 fw-normal " + (multiTab === 'notes' ? 'text-bg-light' : 'text-bg-secondary')} style={{ fontSize: '0.7rem' }}>{noteResources.length}</span>
                            </button>
                        </div>
                    </div>
                    <hr className="mt-0"/>

                    {multiTab === 'notes' && (
                        <div className="d-flex flex-column gap-3">
                            {noteResources.map(({ event: ev, resource }) => (
                                <div key={`${resource.resourceType}/${resource.id}`} className="border rounded p-2">
                                    <div className="d-flex align-items-baseline gap-2 mb-2">
                                        <Link to={makeResourceUrl(resource)} className="fw-semibold small text-decoration-none">
                                            <i className="bi bi-link-45deg me-1 opacity-50" />
                                            {resource.resourceType}
                                        </Link>
                                        {resource.resourceType !== ev.resourceType && (
                                            <span className="text-muted small">via {ev.display ?? ev.resourceType}</span>
                                        )}
                                        <span className="text-muted small">{new Date(ev.date).toLocaleDateString('en-US', { dateStyle: 'medium' })}</span>
                                    </div>
                                    <NoteContentViewer resource={resource} />
                                </div>
                            ))}
                        </div>
                    )}

                    {multiTab === 'events' && <>
                        {Object.entries(grouped).map(([resourceType, typeEvents], groupIdx) => (
                        <div key={resourceType} style={{
                            margin: '0.1rem 0',
                            padding: '0.1rem 0',
                            borderTop: groupIdx > 0 ? '1px solid #eee' : 'none'
                        }} className="small">
                            <Collapse label={
                                <div className='fw-bold'>
                                    {/* <i className="bi bi-circle-fill me-1 small" style={{ color: getColorForResourceType(resourceType) }} /> */}
                                    <i className={"bi text-primary opacity-75 me-2 text-shadow-sm " + getIconForResourceType(resourceType)} />
                                    {resourceType}
                                    <span className='badge bg-primary rounded-pill ms-2 fw-normal'>{typeEvents.length}</span>
                                </div>
                            }>
                                <div className='ps-3'>
                                    {typeEvents.length > 10
                                        ? Object.entries(
                                            typeEvents.reduce<Record<string, TimelineEvent[]>>((acc, ev) => {
                                                (acc[ev.date.slice(0, 10)] ??= []).push(ev);
                                                return acc;
                                            }, {})
                                        ).map(([day, dayEvents], dayIdx) => (
                                            <div key={day} style={{ margin: '0.1rem 0', padding: '0.1rem 0', borderTop: dayIdx > 0 ? '1px solid #eee' : 'none' }}>
                                                <Collapse label={
                                                    <div className='d-flex align-items-baseline gap-2'>
                                                        <span className='text-muted flex-shrink-0'>{new Date(day).toLocaleDateString('en-US', { dateStyle: 'medium' })}</span>
                                                        <span className='badge bg-secondary rounded-pill fw-normal'>{dayEvents.length}</span>
                                                    </div>
                                                }>
                                                    <div className='ps-3'>
                                                        {dayEvents.map((ev, idx) => (
                                                            <TimelineEventView key={ev.resourceId} ev={ev} showDate={false} topBorder={idx > 0} allResources={allResources} />
                                                        ))}
                                                    </div>
                                                </Collapse>
                                            </div>
                                        ))
                                        : typeEvents.map((ev, idx) => (
                                            <TimelineEventView key={ev.resourceId} ev={ev} topBorder={idx > 0} allResources={allResources} />
                                        ))
                                    }
                                </div>
                            </Collapse>
                        </div>
                    ))}
                    </>}
                </div>
            </div>
        </div>
    );
}
