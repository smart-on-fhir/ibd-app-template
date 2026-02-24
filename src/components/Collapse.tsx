import { useEffect, useRef, useState } from "react";

export default function Collapse({
    children,
    label
}: {
    children: React.ReactNode,
    label: React.ReactNode
}) {
    const [isOpen, setIsOpen] = useState(false);
    const contentRef = useRef<HTMLDivElement | null>(null);
    const [height, setHeight] = useState<string>('0px');
    const [isTransitioning, setIsTransitioning] = useState(false);

    useEffect(() => {
        const el = contentRef.current;
        if (!el) return;

        if (isOpen) {
            // Opening: set to measured height, then to auto after transition
            const measured = `${el.scrollHeight}px`;
            setHeight(measured);
            setIsTransitioning(true);
        } else {
            // Closing: from auto or current height -> measured -> 0
            const measured = `${el.scrollHeight}px`;
            // Force browser to register the measured height first
            setHeight(measured);
            // next tick collapse to 0
            requestAnimationFrame(() => requestAnimationFrame(() => {
                setHeight('0px');
                setIsTransitioning(true);
            }));
        }
    }, [isOpen]);

    function onTransitionEnd() {
        if (isOpen) {
            setHeight('auto');
        }
        setIsTransitioning(false);
    }

    return (
        <div>
            <div onClick={() => setIsOpen((v) => !v)} className="d-flex gap-1 align-items-baseline" style={{ cursor: 'pointer' }}>
                <i className={"text-muted lh-0 small " + (isOpen ? "bi bi-caret-down-fill" : "bi bi-caret-right-fill")} />
                <div>{label}</div>
            </div>
            <div
                ref={contentRef}
                onTransitionEnd={onTransitionEnd}
                style={{
                    overflow: isTransitioning ? 'hidden' : 'visible',
                    transition: 'height 200ms ease, opacity 100ms ease',
                    height: height,
                    opacity: isOpen || isTransitioning ? 1 : 0,
                    width: '100%'
                }}
            >
                <div>{isOpen && children}</div>
            </div>
        </div>
    );
}
