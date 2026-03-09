import mermaid               from "mermaid";
import { useEffect, useRef } from "react";


// Mermaid renderer for mermaid code blocks
export default function MermaidDiagram({ chart }: { chart: string }) {
    const ref = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
        if (!ref.current) return;
        let mounted = true;

        const escapeHtml = (s: string) =>
            s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        // Quick heuristic: mermaid charts typically start with a directive
        // like `graph`, `sequenceDiagram`, `gantt`, `classDiagram`, etc.
        const firstLine = (chart || '').trim().split('\n')[0] || '';
        const isLikelyMermaid = /^(graph|sequenceDiagram|gantt|classDiagram|stateDiagram|erDiagram|journey|timeline|flowchart)\b/i.test(firstLine);

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
                // - convert HTML <br> tags to literal newlines
                // - replace various dash/hyphen unicode characters with ASCII '-'
                // - replace non-breaking spaces with regular spaces
                chartToRender = chartToRender.replace(/<br\s*\/?>/gi, '\n');
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
                        // If insertion fails, fallthrough to error handling below.
                        throw e;
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
    }, [chart]);
    return <div ref={ref} className="mermaid-diagram" />;
}
