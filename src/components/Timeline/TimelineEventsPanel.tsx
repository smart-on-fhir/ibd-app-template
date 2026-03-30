import Collapse from "../generic/Collapse";
import TimelineEventView from "./TimelineEventView";
import ResourceFlowDiagram from "./ResourceFlowDiagram";
import { getIconForResourceType, type TimelineEvent } from "./utils";
import FhirResourceJsonViewer from "../JsonViewer/FhirJsonViewer";
import { useState, useEffect } from "react";
import ResourceSummary from "../ResourceSummary";


export default function TimelineEventsPanel({ events, allResources, clickedEvent, onNodeClick }: {
    events:        TimelineEvent[];
    allResources:  Record<string, any[]>;
    clickedEvent?: TimelineEvent | null;
    onNodeClick?:  (resource: any) => void;
}) {

    const [selectedResource, setSelectedResource] = useState<any>(clickedEvent?.raw ?? (events.length === 1 ? events[0].raw : null));
    const [tab, setTab] = useState<string>('summary');

    useEffect(() => {
        setSelectedResource(clickedEvent?.raw ?? (events.length === 1 ? events[0].raw : null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clickedEvent, events]);

    const grouped = events
        .slice()
        .sort((a, b) => +new Date(b.date) - +new Date(a.date))
        .reduce<Record<string, TimelineEvent[]>>((acc, ev) => {
            (acc[ev.resourceType] ??= []).push(ev);
            return acc;
        }, {});

    const groupNames = Object.keys(grouped);
    if (groupNames.length === 0) {
        return (
            <div className='text-center text-muted small my-4'>
                No timeline events selected.
            </div>
        );
    }

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
                            <button className={"nav-link px-4 py-1 " + (tab === 'summary' ? 'active' : '')} onClick={() => setTab('summary')}>Summary</button>
                            <button className={"nav-link px-4 py-1 " + (tab === 'data' ? 'active' : '')} onClick={() => setTab('data')}>Data Tree</button>
                            <button className={"nav-link px-4 py-1 " + (tab === 'raw' ? 'active' : '')} onClick={() => setTab('raw')}>FHIR Data</button>
                        </div>
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

    return (
        <div className="container-fluid my-2 pt-2">
            <div className="row">
                <div className='lh-normal col'>
                    <h5>Selected Events</h5>
                    <hr/>
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
                </div>
            </div>
        </div>
    );
}
