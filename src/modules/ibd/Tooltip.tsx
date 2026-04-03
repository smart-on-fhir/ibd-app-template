/**
 * GlobalTooltip — document-level tooltip driven by data-tooltip attributes.
 *
 * Mount <GlobalTooltip /> once (in IBDLayout). Any element in the subtree
 * (or anywhere on the page) that carries a `data-tooltip="..."` attribute
 * will show a styled tooltip after a short hover delay.
 *
 * Term — thin wrapper that looks up IBD_GLOSSARY by key and attaches
 * `data-tooltip` to its children, rendering a dotted underline hint.
 *
 * Usage:
 *   <Term term="CRP">CRP</Term>
 *   <Term tip="Any ad-hoc description">custom text</Term>
 */

import { useState, useEffect, useRef, type ReactNode } from 'react';
import { IBD_GLOSSARY } from './config';

// ── GlobalTooltip ─────────────────────────────────────────────────────────────

interface TooltipState { text: string; x: number; y: number }

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
    const [tip, setTip] = useState<TooltipState | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    useEffect(() => {
        function onOver(e: MouseEvent) {
            const text = getTooltipText(e.target);
            clearTimeout(timerRef.current);
            if (text) {
                timerRef.current = setTimeout(
                    () => setTip({ text, x: e.clientX, y: e.clientY }),
                    220,
                );
            } else {
                setTip(null);
            }
        }

        function onMove(e: MouseEvent) {
            setTip(prev => prev ? { ...prev, x: e.clientX, y: e.clientY } : null);
        }

        function onOut(e: MouseEvent) {
            const related = e.relatedTarget instanceof Element ? e.relatedTarget : null;
            if (!getTooltipText(related)) {
                clearTimeout(timerRef.current);
                setTip(null);
            }
        }

        document.addEventListener('mouseover', onOver);
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseout',  onOut);
        return () => {
            document.removeEventListener('mouseover', onOver);
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseout',  onOut);
            clearTimeout(timerRef.current);
        };
    }, []);

    if (!tip) return null;

    const MAX_W = 260;
    const left  = Math.min(tip.x + 14, window.innerWidth  - MAX_W - 12);
    const top   = tip.y + 20;

    return (
        <div style={{
            position:     'fixed',
            left,
            top,
            maxWidth:     MAX_W,
            zIndex:       9999,
            background:   'rgba(33,37,41,0.96)',
            color:        '#fff',
            fontSize:     '0.72rem',
            lineHeight:   1.5,
            padding:      '5px 10px',
            borderRadius: 6,
            boxShadow:    '0 2px 12px rgba(0,0,0,0.3)',
            pointerEvents: 'none',
            whiteSpace:   'normal',
        }}>
            {tip.text}
        </div>
    );
}

// ── Term ──────────────────────────────────────────────────────────────────────

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
