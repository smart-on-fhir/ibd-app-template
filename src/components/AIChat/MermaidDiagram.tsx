import mermaid               from "mermaid";
import { useEffect, useRef } from "react";


// Mermaid renderer for mermaid code blocks
export default function MermaidDiagram({ chart, minWidth }: { chart: string, minWidth?: string }) {
    const ref = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
        if (!ref.current) return;
        let mounted = true;

        const escapeHtml = (s: string) =>
            s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        // Quick heuristic: mermaid charts typically start with a directive
        // like `graph`, `sequenceDiagram`, `gantt`, `classDiagram`, etc.
        // Skip leading %%{init}%% lines before checking the diagram type.
        const allLines = (chart || '').trim().split('\n');
        const firstNonInit = allLines.find(l => !/^\s*%%/.test(l)) ?? allLines[0] ?? '';
        const isLikelyMermaid = /^(graph|sequenceDiagram|gantt|classDiagram|stateDiagram|erDiagram|journey|timeline|flowchart)\b/i.test(firstNonInit);

        // Heuristic: if the LLM concatenated markdown after the mermaid fence,
        // strip trailing table/HR/header lines before rendering to avoid parser
        // errors (we'll show the original source in the error details).
        const lines = (chart || '').split('\n');
        let endIndex = lines.length;
        for (let i = 0; i < lines.length; i++) {
            const l = lines[i];
            if (/^\s*-{3,}\s*$/.test(l) || /^\s*\|.*\|\s*$/.test(l) || /^\s*#{1,6}\s+/.test(l)) {
                endIndex = i;
                break;
            }
        }
        const trimmedChart = lines.slice(0, endIndex).join('\n').trim();

            (async () => {
            try {
                if (!isLikelyMermaid) {
                    // Don't attempt to parse non-mermaid text — show source instead
                    if (mounted && ref.current) ref.current.innerHTML = `<pre class="mermaid-raw">${escapeHtml(chart)}</pre>`;
                    return;
                }

                // Use trimmed chart (stop before markdown tables/HR/headers)
                let chartToRender = trimmedChart || chart;

                // Normalize common LLM artifacts that break the mermaid parser:
                // - replace various dash/hyphen unicode characters with ASCII '-'
                // - replace non-breaking spaces with regular spaces
                // NOTE: <br/> tags are intentionally preserved — Mermaid renders
                // them as line breaks in HTML labels (securityLevel: 'loose').
                chartToRender = chartToRender.replace(/[\u00A0\u202F]/g, ' ');
                chartToRender = chartToRender.replace(/[\u2010\u2011\u2012\u2013\u2014\u2212]/g, '-');

                mermaid.initialize({ startOnLoad: false, securityLevel: 'loose' });
                const id = `m-${Math.random().toString(36).slice(2, 9)}`;
                const { svg } = await mermaid.render(id, chartToRender);
                // Insert the generated SVG into our container first.
                if (mounted && ref.current) {
                    try {
                        ref.current.innerHTML = svg;
                    } catch (e) {
                        throw e;
                    }
                    // Mermaid sets explicit width/height attributes and an inline
                    // max-width on the SVG, all of which fight container-driven sizing.
                    // The correct responsive SVG pattern: keep viewBox, drop the
                    // width/height attributes, set width:100% via CSS — the browser
                    // then scales height automatically from the aspect ratio.
                    const svgEl = ref.current.querySelector('svg');
                    if (svgEl) {
                        // Capture natural width from viewBox before stripping attributes.
                        // viewBox="minX minY width height" — 3rd token is natural width.
                        const vb = svgEl.getAttribute('viewBox');
                        const naturalW = vb ? parseFloat(vb.trim().split(/\s+/)[2]) : NaN;
                        svgEl.removeAttribute('width');
                        svgEl.removeAttribute('height');
                        svgEl.style.maxWidth = '';
                        // width:100% fills the container; max-width caps at the diagram's
                        // natural size so small charts don't stretch and blow up the font.
                        svgEl.style.width    = '100%';
                        if (!isNaN(naturalW) && naturalW > 0) {
                            svgEl.style.maxWidth = `${naturalW}px`;
                        }
                        svgEl.style.height   = 'auto';
                        svgEl.style.minWidth = minWidth ?? '';
                    }
                }

                // mermaid sometimes leaves a temporary container with id `dm-<id>`
                // attached to document.body when rendering errors occur. Remove
                // any such temporary nodes that do NOT contain our generated
                // SVG (id=`m-${id}`) to avoid removing the node mermaid used.
                try {
                    const temps = Array.from(document.querySelectorAll('[id^="dm-"]')) as Element[];
                    for (const t of temps) {
                        try {
                            if (t.querySelector && t.querySelector(`#m-${id}`)) {
                                // keep the temp that contains our svg
                                continue;
                            }
                            if (t && t.parentElement) t.parentElement.removeChild(t);
                        } catch (e) {
                            // ignore per-node errors
                        }
                    }
                } catch (e) {
                    // ignore cleanup errors
                }
            } catch (err: any) {
                const msg = err?.message ?? String(err);
                if (mounted && ref.current) {
                    ref.current.innerHTML = `
                    <div class="alert alert-warning p-2">
                        <strong>Mermaid render error:</strong> ${escapeHtml(msg)}
                    </div>
                    <details style="white-space:pre-wrap;border:1px solid #ddd;padding:8px;margin-top:8px">
                        <summary>Trimmed source used for render</summary>
                        <pre>${escapeHtml(trimmedChart || chart)}</pre>
                    </details>
                    <details style="white-space:pre-wrap;border:1px solid #ddd;padding:8px;margin-top:8px">
                        <summary>Original source</summary>
                        <pre>${escapeHtml(chart)}</pre>
                    </details>`;
                        
                    // Ensure no stray mermaid temp nodes remain after error
                    try {
                        const temps = Array.from(document.querySelectorAll('[id^="dm-"]'));
                        for (const t of temps) {
                            if (t && t.parentElement) t.parentElement.removeChild(t);
                        }
                    } catch (e) {
                        // ignore cleanup errors
                    }
                }
            }
        })();
        return () => { mounted = false; };
    }, [chart, minWidth]);
    return <div ref={ref} className="mermaid-diagram" />;
}
