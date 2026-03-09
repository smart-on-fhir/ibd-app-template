import { humanizeNumericValue, textForCoding } from "../../utils/patientTimeline";
import Collapse               from "../generic/Collapse";
import FhirResourceJsonViewer from "../JsonViewer/FhirJsonViewer";
import type { TimelineEvent } from "./utils";


// TODO: Move this elsewhere later
function resolveEventSuffix(ev: TimelineEvent): string {
    const r = ev.raw;
    switch (r.resourceType) {
        case 'Observation': {
            if (r.valueQuantity != null) {
                const v = r.valueQuantity.value != null ? humanizeNumericValue(r.valueQuantity.value) : '';
                const u = r.valueQuantity.unit || r.valueQuantity.code || '';
                return [v, u].filter(Boolean).join(' ');
            }
            if (r.valueString)              return r.valueString;
            if (r.valueCodeableConcept)     return r.valueCodeableConcept.text || r.valueCodeableConcept.coding?.[0]?.display || '';
            if (r.valueBoolean != null)     return String(r.valueBoolean);
            if (r.valueInteger != null)     return String(r.valueInteger);
            if (r.component && Array.isArray(r.component)) {
                return r.component.map((c: any) => textForCoding(c.code) + ': ' + (c.valueQuantity ? `${humanizeNumericValue(c.valueQuantity.value)}${c.valueQuantity.unit||''}` : c.valueString || '')).join('; ');
            }
            return '';
        }
        case 'Condition':
            return r.clinicalStatus?.coding?.[0]?.code || '';
        case 'Encounter':
            return r.class?.display || r.class?.code || '';
        default:
            return '';
    }
}

export default function TimelineEventView({ ev, showDate = true, topBorder = true, allResources }: {
    ev: TimelineEvent;
    showDate?: boolean;
    topBorder?: boolean;
    allResources: Record<string, any[]>;
}) {
    const suffix = resolveEventSuffix(ev);
    return (
        <div style={{ margin: '0.1rem 0', padding: '0.1rem 0', borderTop: topBorder ? '1px solid #eee' : 'none' }}>
            <Collapse label={
                <div className='d-flex align-items-baseline gap-2 overflow-hidden'>
                    {showDate && <span className='text-muted flex-shrink-0'>{new Date(ev.date).toLocaleDateString('en-US', { dateStyle: 'medium' })}</span>}
                    <span className='flex-shrink-0 text-primary-emphasis fw-semibold'>{ev.display || ev.category || ev.resourceType}</span>
                    {suffix && <span className='text-muted text-truncate' style={{ minWidth: 0 }} title={suffix}>— {suffix}</span>}
                </div>
            }>
                <FhirResourceJsonViewer resource={ev.raw} allResources={allResources} />
            </Collapse>
        </div>
    );
}