import type { DocumentReference, FhirResource, Resource } from "fhir/r4";
import Collapse                                           from "../Collapse";
import type { JSONValue }                                 from "../../types";
import JsonViewer                                         from ".";
import AttachmentPreview                                  from "./Attachment";


export function createValueRenderer(allResources: Record<string, FhirResource[]>) {
    return function renderValue(value: string | number | boolean | null, path?: string, root?: JSONValue): React.ReactNode {
        
        // Root nodes
        if (!path) {
            return String(value);
        }

        if (typeof value === "number") {
            return <span style={{ color: '#a0a' }}>{value}</span>;
        }
        if (typeof value === "boolean") {
            return <span style={{ color: !!value ? '#090' : '#900' }}>{String(value)}</span>;    
        }
        if (value === null || value === undefined) {
            return <span className='text-muted'>{String(value)}</span>;
        }
        if (value.match(/^https?:\/\/.+/)) {
            return (
                <a href={value} target="_blank" rel="noopener noreferrer" style={{ color: '#00F' }}>
                    {value}
                    <i className="bi bi-box-arrow-up-right ms-1" />
                </a>
            );
        }
        if (value.match(/^\d{4}-\d{2}-\d{2}/)) {
            return <span style={{ color: '#C60' }}>{value}</span>;
        }

        const match = path.match(/^DocumentReference\.content\[(\d+)\]\.attachment\.data$/);
        if (match) {
            console.log('Found attachment data:', path, value, match);
            if (root && typeof root === 'object' && (root as any).resourceType === 'DocumentReference') {
                const attachment = (root as unknown as DocumentReference).content?.[+match[1]]?.attachment;
                if (attachment) {
                    console.log('Attachment details:', attachment);
                    return (
                        <Collapse label={<span className="text-primary">{attachment.title || 'Attachment'}</span>}>
                            <AttachmentPreview attachment={attachment} />
                        </Collapse>
                    );
                }
            }
            return <span style={{ color: '#C6C' }}>{value}</span>;
        }

        if (path.endsWith('.reference') || path.endsWith('.url')) {
            const [resourceType, id] = value.split('/');
            if (resourceType && id) {
                const resource = allResources[resourceType]?.find(r => r.id === id);
                if (resource) {
                    return (
                        <Collapse label={<span className="text-primary">{value}</span>}>
                            <JsonViewer data={resource as any} renderValue={renderValue} />
                        </Collapse>
                    );
                } else {
                    return (
                        <span className='text-danger' title="Not found in patient's resources">
                            {value}
                            <i className="bi bi-exclamation-triangle-fill ms-1" />
                        </span>
                    );
                }
            }
        }
        return <span style={{ color: '#044' }}>{String(value)}</span>;
    };
}

export default function FhirResourceJsonViewer({
    resource,
    allResources
}: {
    resource    : Resource,
    allResources: Record<string, FhirResource[]>
}) {
    const renderValue = createValueRenderer(allResources);
    return <JsonViewer data={resource as any} renderValue={renderValue} />;
}