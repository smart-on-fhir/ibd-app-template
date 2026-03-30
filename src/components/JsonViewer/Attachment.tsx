import type { Attachment }     from "fhir/r4";
import { useEffect, useState } from "react";


export default function AttachmentPreview({ attachment }: { attachment: Attachment }) {
    const [url, setUrl] = useState<string | null>(null);

    useEffect(() => {
        if (!attachment || !attachment.data) {
            setUrl(null);
            return;
        }
        try {
            const contentType = (attachment.contentType || 'application/octet-stream').split(';')[0].trim();
            const binary = Uint8Array.from(atob(attachment.data), (c) => c.charCodeAt(0));
            const blob = new Blob([binary], { type: contentType });
            const obj = URL.createObjectURL(blob);
            setUrl(obj);
            return () => {
                URL.revokeObjectURL(obj);
                setUrl(null);
            };
        } catch (err) {
            console.error('Attachment decode error', err);
            setUrl(null);
        }
    }, [attachment && attachment.data, attachment && attachment.contentType]);


    if (!attachment || !attachment.data) {
        // If we know the type or url, show a friendlier message
        const type = attachment?.contentType?.split(';')[0].trim() || '';
        const url  = attachment?.url;
        let label = 'file';
        if (type === 'application/pdf') label = 'PDF file';
        else if (type.startsWith('image/')) label = 'image';
        else if (type === 'text/html') label = 'HTML document';
        else if (type === 'text/plain') label = 'text file';
        else if (type) label = type;
        if (url) {
            return <span className="text-muted">
                There is a <span className="badge bg-secondary">{label}</span> attached but the file is not present in this bundle.<br />
                URL: <code>{url}</code>
            </span>;
        }
        if (type) {
            return <span className="text-muted">
                There is a <span className="badge bg-secondary">{label}</span> attached but the file is not present in this bundle.
            </span>;
        }
        return <span className="text-muted">No attachment data</span>;
    }

    const contentType = attachment.contentType?.split(';')[0].trim() || '';

    // Images
    if (contentType.startsWith('image/')) {
        return url ? <img src={url} alt={attachment.title || 'image'} style={{ maxWidth: '100%', height: 'auto', borderRadius: 6 }} /> : <div>Loading...</div>;
    }

    // PDF preview
    if (contentType === 'application/pdf') {
        return url ? (
            <iframe
                src={url}
                title={attachment.title || 'pdf-preview'}
                style={{ width: 'clamp(300px, 100%, 800px)', aspectRatio: '16/9', border: '1px solid #ccc', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}
                sandbox={''}
            />
        ) : <div>Loading...</div>;
    }

    // HTML preview (sandboxed, no scripts)
    if (contentType === 'text/html') {
        return url ? (
            <iframe
                src={url}
                title={attachment.title || 'html-preview'}
                style={{ width: 'clamp(300px, 100%, 800px)', aspectRatio: '16/9', border: '2px solid #69C', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', borderRadius: 7 }}
                // keep sandbox restrictive: no scripts, no same-origin
                sandbox={'allow-same-origin'}
            />
        ) : <div>Loading...</div>;
    }

    // Plain text
    if (contentType === 'text/plain') {
        return <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.9rem' }}>
            {attachment.data ? atob(attachment.data) : 'No data'}
        </pre>;
    }

    // Fallback: offer download and try to embed in an iframe
    return url ? (
        <div>
            <div style={{ marginBottom: '0.5rem' }}>
                <a className="btn btn-sm btn-outline-primary me-2" href={url} download={attachment.title || 'file'}>Download</a>
            </div>
            <iframe src={url} title={attachment.title || 'preview'} style={{ width: '100%', height: '500px', border: 0 }} sandbox={''} />
        </div>
    ) : <div>Loading...</div>;
}
