import type { DocumentReference, FhirResource, Resource } from "fhir/r4";
import Collapse                                           from "../generic/Collapse";
import type { JSONValue }                                 from "../../types";
import JsonViewer                                         from ".";
import AttachmentPreview                                  from "./Attachment";

export function Decorator({ children, type }: { children: React.ReactNode; type?: 'number' | 'boolean' | 'string' }) {
    
    if (type === 'string') {
        return <span style={{ color: '#044' }}>{children}</span>;
    }
    
    if (type === 'number') {
        return <span style={{ color: '#a0a' }}>{children}</span>;
    }
    
    if (type === 'boolean') {
        return <span style={{ color: children === 'true' ? '#090' : '#900' }}>{children}</span>;    
    }

    if (children === null || children === undefined) {
        return <span className='text-muted'>{String(children)}</span>;
    }

    if (typeof children === 'string') {
        
        // URL values
        if (children.match(/^https?:\/\/.+/)) {
            return (
                <a href={children} target="_blank" rel="noopener noreferrer" style={{ color: '#00F' }}>
                    {children}
                    <i className="bi bi-box-arrow-up-right ms-1" />
                </a>
            );
        }

        // Date values
        if (children.match(/^\d{4}-\d{2}-\d{2}/)) {
            return <span style={{ color: '#C60' }}>{children}</span>;
        }
    }

    return children;
}


export function createValueRenderer(allResources: Record<string, FhirResource[]>) {
    return function renderValue(value: string | number | boolean | null, path?: string, root?: JSONValue): React.ReactNode {
        
        // Root nodes
        if (!path) {
            return String(value);
        }

        // Numbers
        if (typeof value === "number") {
            return <Decorator type="number">{value}</Decorator>;
        }

        // Booleans
        if (typeof value === "boolean") {
            return <Decorator type="boolean">{String(value)}</Decorator>;    
        }

        // null or undefined
        if (value === null || value === undefined) {
            return <Decorator>{value}</Decorator>;
        }

        // URL values
        if (value.match(/^https?:\/\/.+/)) {
            return (
                <a href={value} target="_blank" rel="noopener noreferrer" style={{ color: '#00F' }}>
                    {value}
                    <i className="bi bi-box-arrow-up-right ms-1" />
                </a>
            );
        }

        // Date values
        if (value.match(/^\d{4}-\d{2}-\d{2}/)) {
            return <span style={{ color: '#C60' }}>{value}</span>;
        }

        // Attachment data in DocumentReference
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

        // Reference values
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

        // Multi-line strings
        if (typeof value === 'string' && value.includes('\n')) {
            return (
                <Collapse label={<span style={{ color: '#044' }}>Multi-line string ({value.split('\n').length} lines)</span>}>
                    <pre className="text-muted" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0 }}>{value}</pre>
                </Collapse>
            );
        }

        // Normal strings
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