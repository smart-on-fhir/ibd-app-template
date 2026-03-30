import type { FhirResource } from 'fhir/r4';
import type { JSX }  from 'react';
import { summarize } from '../utils/summarizer';
import { Decorator } from './JsonViewer/FhirJsonViewer';

/**
 * Return a plain‑text summary for any FHIR resource.  This is just a thin
 * wrapper around `summarize()` in the shared utility so callers are not tied
 * to that implementation.
 */
export function summarizeResourceText(resource: FhirResource): string {
    return summarize(resource) as string;
}

/**
 * JSX version of the summary.  Each line of the text output becomes a
 * `<div>`; the portion before the first `:` is rendered in **bold**.
 */
export function summarizeResourceJSX(resource: FhirResource): JSX.Element {
    const text = summarize(resource, true);
    return (
        <div className="resource-summary">
            <div className='p-1'>
                <strong>Resource Type:</strong>
                <div className='text-muted' style={{ paddingLeft: '1rem' }}>{resource.resourceType}</div>
            </div>
            <div className='p-1 border-top'>
                <strong>Resource ID:</strong>
                <div className='text-muted' style={{ paddingLeft: '1rem' }}>{resource.id}</div>
            </div>
            { typeof text === 'string' ?
                text.split('\n').map((line, idx) => {
                    const [label, ...rest] = line.split(': ');
                    if (rest.length === 0) {
                        return <div key={idx} className='p-1 text-muted border-top' style={{ paddingLeft: '1rem', whiteSpace: 'pre-wrap' }}>{line}</div>;
                    }
                    return (
                        <div key={idx} className='p-1 border-top'>
                            <strong>{label}:</strong>
                            <div className='text-muted' style={{ paddingLeft: '1rem', whiteSpace: 'pre-wrap' }}>{rest.join(': ')}</div>
                        </div>
                    );
                }) :
                text.map((prop, idx) => (
                    <div key={idx} className='p-1 border-top'>
                        <strong>{prop.name}:</strong>
                        <div className='text-muted' style={{ paddingLeft: '1rem', whiteSpace: 'pre-wrap', maxHeight: 200, overflowY: 'auto' }}>
                            <Decorator type={prop.type as any}>{prop.value}</Decorator>
                        </div>
                    </div>
                ))
            }
        </div>
    );
}

export default function ResourceSummary({ resource }: { resource: FhirResource }) {
    return summarizeResourceJSX(resource);
}
