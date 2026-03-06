import Collapse from "../Collapse";
import TimelineEventView from "./TimelineEventView";
import { getIconForResourceType, type TimelineEvent } from "./utils";


// TODO: Move this elsewhere later
// const COLORS = [
//     '#39F',
//     '#C90',
//     '#993',
//     '#F66',
//     '#C3C',
//     '#390',
//     '#6BB',
//     '#AAA',
// ];

// TODO: Move this elsewhere later
// const getColorForResourceType = (function() {
//     const knownResourceTypes: string[] = [];
//     return (resourceType: string) => {
//         let index = knownResourceTypes.indexOf(resourceType);
//         if (index < 0) {
//             index = knownResourceTypes.push(resourceType) - 1;
//         }
//         return COLORS[index % COLORS.length];
//     };
// })();

export default function TimelineEventsPanel({ events, allResources }: {
    events: TimelineEvent[];
    allResources: Record<string, any[]>;
}) {
    const grouped = events
        .slice()
        .sort((a, b) => +new Date(b.date) - +new Date(a.date))
        .reduce<Record<string, TimelineEvent[]>>((acc, ev) => {
            (acc[ev.resourceType] ??= []).push(ev);
            return acc;
        }, {});

    return (
        <div className='mt-2 mb-2 lh-normal'>
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
    );
}
