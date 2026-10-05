import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useClinicalData } from 'clinical-primitives';
import NoteContentViewer from '../Timeline/NoteContentViewer';

// ─── Types ────────────────────────────────────────────────────────────────────

type FhirTarget = { resourceType: string; id: string; label: string };

// ─── Context ──────────────────────────────────────────────────────────────────

const FhirModalContext = createContext<(target: FhirTarget) => void>(() => {});

export function useFhirModal() {
    return useContext(FhirModalContext);
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function Modal({ target, onClose }: { target: FhirTarget; onClose: () => void }) {
    const { resources } = useClinicalData();
    const resourceList = (resources as Record<string, unknown[]>)[target.resourceType];
    const resource = resourceList?.find((r: any) => r.id === target.id);

    return (
        <div
            className="modal show d-block"
            style={{ backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 1055 }}
            onClick={onClose}
        >
            <div
                className="modal-dialog modal-lg modal-dialog-scrollable"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="modal-content">
                    <div className="modal-header py-2">
                        <h6 className="modal-title mb-0 fw-semibold">{target.label}</h6>
                        <button type="button" className="btn-close" aria-label="Close" onClick={onClose} />
                    </div>
                    <div className="modal-body">
                        {resource ? (
                            <NoteContentViewer resource={resource} />
                        ) : (
                            <p className="text-muted small mb-0">
                                Resource <code>{target.resourceType}/{target.id}</code> was not found in this patient's record.
                            </p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function FhirResourceModalProvider({ children }: { children: ReactNode }) {
    const [target, setTarget] = useState<FhirTarget | null>(null);

    const open = useCallback((t: FhirTarget) => setTarget(t), []);
    const close = useCallback(() => setTarget(null), []);

    // Catch fhir: link clicks anywhere in the document that aren't already
    // handled by FhirResourceLink (e.g. links inside rendered note HTML,
    // EvidenceNoteItem markdown, dangerouslySetInnerHTML content).
    useEffect(() => {
        function handleClick(e: MouseEvent) {
            const anchor = (e.target as Element).closest('a');
            if (!anchor) return;
            const href = anchor.getAttribute('href') ?? '';
            if (!href.startsWith('fhir:')) return;
            e.preventDefault();
            const path = href.slice(5);
            const slash = path.indexOf('/');
            if (slash <= 0) return;
            open({
                resourceType: path.slice(0, slash),
                id: path.slice(slash + 1),
                label: anchor.textContent?.trim() || path,
            });
        }
        document.addEventListener('click', handleClick);
        return () => document.removeEventListener('click', handleClick);
    }, [open]);

    return (
        <FhirModalContext.Provider value={open}>
            {children}
            {target && <Modal target={target} onClose={close} />}
        </FhirModalContext.Provider>
    );
}
