/**
 * GlobalTooltip — document-level tooltip driven by data-tooltip attributes.
 *
 * Mount <GlobalTooltip /> once (in IBDLayout). Any element that carries a
 * `data-tooltip="..."` attribute will show a styled tooltip on hover.
 *
 * Term — inline text wrapper: looks up IBD_GLOSSARY and renders a dotted underline.
 * Tip  — block/element wrapper: injects data-tooltip via cloneElement, no extra DOM node.
 *
 * Usage:
 *   <Term term="CRP">CRP</Term>
 *   <Tip term="card:cohort"><div className="card">…</div></Tip>
 */

import { useState, useEffect, useRef, cloneElement, isValidElement, type ReactNode, type ReactElement, type CSSProperties } from 'react';
import { IBD_GLOSSARY } from './config';

// ── GlobalTooltip ─────────────────────────────────────────────────────────────

function getTooltipText(target: EventTarget | Element | null): string | null {
    let el = target instanceof Element ? target : null;
    while (el && el !== document.body) {
        const t = el.getAttribute('data-tooltip');
        if (t) return t;
        el = el.parentElement;
    }
    return null;
}

export function GlobalTooltip() {
    const [content, setContent] = useState<string | null>(null);
    const elRef      = useRef<HTMLDivElement>(null);
    const activeText = useRef<string | null>(null);

    useEffect(() => {
        function place(x: number, y: number) {
            if (!elRef.current) return;
            const left = Math.min(x + 14, window.innerWidth - 272);
            elRef.current.style.transform = `translate(${left}px, ${y + 20}px)`;
        }

        function onOver(e: MouseEvent) {
            const text = getTooltipText(e.target);
            if (text === activeText.current) return;   // still in same zone
            activeText.current = text;
            if (text) place(e.clientX, e.clientY);     // position before fade-in
            setContent(text);
        }

        function onMove(e: MouseEvent) {
            if (activeText.current) place(e.clientX, e.clientY);
        }

        function onLeave() {
            activeText.current = null;
            setContent(null);
        }

        document.addEventListener('mouseover',              onOver);
        document.addEventListener('mousemove',              onMove);
        document.documentElement.addEventListener('mouseleave', onLeave);
        return () => {
            document.removeEventListener('mouseover',              onOver);
            document.removeEventListener('mousemove',              onMove);
            document.documentElement.removeEventListener('mouseleave', onLeave);
        };
    }, []);

    return (
        <div
            ref={elRef}
            style={{
                position:      'fixed',
                top:           0,
                left:          0,
                maxWidth:      260,
                zIndex:        9999,
                background:    'rgba(33,37,41,0.96)',
                color:         '#fff',
                fontSize:      '0.72rem',
                lineHeight:    1.5,
                padding:       '5px 10px',
                borderRadius:  6,
                boxShadow:     '0 2px 12px rgba(0,0,0,0.3)',
                pointerEvents: 'none',
                whiteSpace:    'normal',
                opacity:       content ? 1 : 0,
                transition:    content ? 'opacity 300ms ease 300ms' : 'none',
            }}
        >
            {content}
        </div>
    );
}


interface TermProps {
    /** Glossary key — looked up in IBD_GLOSSARY */
    term?:      string;
    /** Ad-hoc tooltip text — overrides glossary lookup */
    tip?:       string;
    children:   ReactNode;
    className?: string;
}

export function Term({ term, tip, children, className }: TermProps) {
    const text = tip ?? (term ? IBD_GLOSSARY[term] : undefined);
    if (!text) return <>{children}</>;
    return (
        <span
            data-tooltip={text}
            className={className}
            style={{
                borderBottom:   '1px dotted currentColor',
                cursor:         'help',
                textDecoration: 'none',
            }}
        >
            {children}
        </span>
    );
}

// ── Tip ───────────────────────────────────────────────────────────────────────
// Like Term but for non-text elements. Injects data-tooltip directly onto the
// child element via cloneElement — no wrapper added.

interface TipProps {
    term?:      string;
    tip?:       string;
    /** Cursor to apply. Defaults to 'help'. Pass false to leave the cursor unchanged. */
    cursor?:    CSSProperties['cursor'] | false;
    children:   ReactElement;
}

export function Tip({ term, tip, cursor = 'help', children }: TipProps) {
    const text = tip ?? (term ? IBD_GLOSSARY[term] : undefined);
    if (!text || !isValidElement(children)) return <>{children}</>;
    const child = children as ReactElement<Record<string, unknown>>;
    const existingStyle = (child.props.style ?? {}) as CSSProperties;
    const style = cursor ? { cursor, ...existingStyle } : existingStyle;
    return cloneElement(child, { 'data-tooltip': text, style } as Record<string, unknown>);
}
