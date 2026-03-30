import AttachmentPreview from '../JsonViewer/Attachment';

// ─── Sanitize HTML ────────────────────────────────────────────────────────────
// Strip script/style tags before rendering FHIR narrative HTML in the DOM.
function sanitizeHtml(html: string): string {
    return html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
}

// ─── Reason badge ─────────────────────────────────────────────────────────────
// Explains to the user why this resource appears in the Clinical Notes lens.
function inclusionReason(raw: any): string {
    const rt: string = raw.resourceType ?? '';
    if (rt === 'DocumentReference') return 'Document Reference';
    if (rt === 'Communication')     return 'Communication payload';
    if (rt === 'Composition')       return 'Structured document';
    if (rt === 'DiagnosticReport') {
        if (raw.conclusion)           return 'Contains written conclusion';
        if (raw.presentedForm?.length) return 'Contains attachment';
        return 'Contains narrative';
    }
    if (rt === 'Observation' && typeof raw.valueString === 'string') return 'Free-text observation';
    return 'Contains narrative text';
}

// ─── Section renderer ─────────────────────────────────────────────────────────
function NarrativeHtml({ html }: { html: string }) {
    return (
        <div
            className="fhir-narrative"
            style={{ fontSize: '0.9rem', lineHeight: 1.6 }}
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }}
        />
    );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function NoteContentViewer({ resource }: { resource: any }) {
    const raw: any = resource;
    const rt: string = raw.resourceType ?? '';

    const reason = inclusionReason(raw);

    const previewStyle: React.CSSProperties = {
        fontSize: '13px',
        lineHeight: 1.6,
        margin: 0,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word'
    };

    const body = (() => {
        // ── DocumentReference ──────────────────────────────────────────────
        if (rt === 'DocumentReference') {
            const attachments: any[] = (raw.content ?? []).map((c: any) => c.attachment).filter(Boolean);
            if (attachments.length > 0) {
                return (
                    <div className="d-flex flex-column gap-3">
                        {attachments.map((att: any, i: number) => (
                            <div key={i} style={previewStyle}>
                                {att.title && (
                                    <div className="fw-semibold text-muted small mb-1">{att.title}</div>
                                )}
                                <AttachmentPreview attachment={att} />
                            </div>
                        ))}
                    </div>
                );
            }
            // Fallback to narrative
            if (typeof raw.text?.div === 'string') {
                return <NarrativeHtml html={raw.text.div} />;
            }
            return <span className="text-muted small">No attachment content available.</span>;
        }

        // ── Communication ──────────────────────────────────────────────────
        if (rt === 'Communication') {
            const texts: string[] = (raw.payload ?? [])
                .map((p: any) => p.contentString)
                .filter((s: any) => typeof s === 'string' && s.trim());
            if (texts.length > 0) {
                return (
                    <div className="d-flex flex-column gap-2">
                        {texts.map((t, i) => (
                            <pre key={i} style={previewStyle}>{t}</pre>
                        ))}
                    </div>
                );
            }
            if (typeof raw.text?.div === 'string') return <NarrativeHtml html={raw.text.div} />;
            return <span className="text-muted small">No payload content available.</span>;
        }

        // ── Composition ────────────────────────────────────────────────────
        if (rt === 'Composition') {
            const sections: any[] = raw.section ?? [];
            if (sections.length > 0) {
                return (
                    <div className="d-flex flex-column gap-3">
                        {sections.map((sec: any, i: number) => (
                            <div key={i}>
                                {sec.title && (
                                    <div className="fw-semibold mb-1" style={{ fontSize: '0.9rem', color: '#318ebc' }}>
                                        {sec.title}
                                    </div>
                                )}
                                {typeof sec.text?.div === 'string'
                                    ? <NarrativeHtml html={sec.text.div} />
                                    : <span className="text-muted small">No section text.</span>
                                }
                            </div>
                        ))}
                    </div>
                );
            }
            if (typeof raw.text?.div === 'string') return <NarrativeHtml html={raw.text.div} />;
            return <span className="text-muted small">No section content available.</span>;
        }

        // ── DiagnosticReport ───────────────────────────────────────────────
        if (rt === 'DiagnosticReport') {
            const parts: React.ReactNode[] = [];
            if (typeof raw.conclusion === 'string') {
                parts.push(
                    <pre key="conclusion" style={previewStyle}>
                        {raw.conclusion}
                    </pre>
                );
            }
            const forms: any[] = raw.presentedForm ?? [];
            if (forms.length > 0) {
                parts.push(
                    <div key="forms" className="d-flex flex-column gap-3 mt-2">
                        {forms.map((att: any, i: number) => (
                            <div key={i}>
                                {att.title && (
                                    <div className="fw-semibold text-muted small mb-1">{att.title}</div>
                                )}
                                <AttachmentPreview attachment={att} />
                            </div>
                        ))}
                    </div>
                );
            }
            if (parts.length > 0) return <>{parts}</>;
            if (typeof raw.text?.div === 'string') return <NarrativeHtml html={raw.text.div} />;
            return <span className="text-muted small">No report content available.</span>;
        }

        // ── Observation (valueString) ──────────────────────────────────────
        if (rt === 'Observation' && typeof raw.valueString === 'string') {
            return (
                <pre style={previewStyle}>
                    {raw.valueString}
                </pre>
            );
        }

        // ── Catch-all: text.div ────────────────────────────────────────────
        if (typeof raw.text?.div === 'string') {
            return <NarrativeHtml html={raw.text.div} />;
        }

        return <span className="text-muted small">No note content found.</span>;
    })();

    return (
        <div style={{ padding: '8px 4px' }}>
            {/* Inclusion reason badge */}
            <div className="mb-2">
                <span className="badge rounded-pill text-bg-secondary fw-normal" style={{ fontSize: '0.72rem' }}>
                    <i className="bi bi-file-earmark-text me-1" />
                    {reason}
                </span>
            </div>

            {/* Note body — scrollable */}
            <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                {body}
            </div>
        </div>
    );
}
