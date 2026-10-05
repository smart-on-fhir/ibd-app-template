import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { StaticComponent } from 'clinical-primitives';
import MermaidDiagram from '../AIChat/MermaidDiagram';
import { FhirResourceLink } from './FhirResourceLink';

// Known component types registered in StaticComponent
const COMPONENT_TYPES = new Set([
    'observation_panel', 'observation_card', 'lab_trend_panel',
    'medication_list', 'condition_list', 'immunization_list',
    'event_feed', 'chart', 'row', 'column', 'text',
]);

/**
 * The LLM sometimes outputs component JSON without ```cp fences — either bare in the text
 * or inside a ```json block. This function finds those objects and wraps them so the
 * code handler can pick them up.
 *
 * Matches top-level {...} objects (no nested braces, but allows [...] for array props).
 * Only promotes objects whose "type" is a known component type.
 */
function promoteComponentBlocks(md: string): string {
    // Strip malformed "cp:```cp {JSON}" — model confused inline and fenced formats
    md = md.replace(/cp:`{3}cp[ \t]+(\{[^\n`]+\})[ \t]*(?:`{3})?/g,
        (_, json) => `\`\`\`cp\n${json.trim()}\n\`\`\``,
    );

    // Normalize single-line ```cp {JSON} (model sometimes puts JSON on same line, possibly unclosed)
    md = md.replace(/```cp[ \t]+(\{[^\n`]+\})[ \t]*(?:```)?/g,
        (_, json) => `\`\`\`cp\n${json.trim()}\n\`\`\``,
    );

    // Promote fenced ```json / ``` blocks that contain a component JSON object
    md = md.replace(/```(?:json)?\s*(\{[^{}]*"type"\s*:\s*"([a-z_]+)"[^{}]*\})\s*```/g,
        (_, json, type) => COMPONENT_TYPES.has(type) ? `\`\`\`cp\n${json}\n\`\`\`` : _,
    );

    // Promote bare JSON objects that aren't already inside a code fence
    // Split on fenced blocks so we only touch prose sections
    const parts = md.split(/(```[\s\S]*?```)/g);
    return parts.map((part, i) => {
        if (i % 2 === 1) return part; // inside a code fence — leave alone
        return part.replace(/\{[^{}]*"type"\s*:\s*"([a-z_]+)"[^{}]*\}/g, (match, type) =>
            COMPONENT_TYPES.has(type) ? `\`\`\`cp\n${match.trim()}\n\`\`\`` : match,
        );
    }).join('');
}

export function LLMMarkdown({ children }: { children: string }) {
    const processed = promoteComponentBlocks(children);

    return (
        <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeRaw]}
            urlTransform={(url) => url.startsWith('fhir:') ? url : defaultUrlTransform(url)}
            components={{
                a: ({ href, children }: any) => {
                    if (typeof href === 'string' && href.startsWith('fhir:')) {
                        const path = href.slice(5);
                        const slash = path.indexOf('/');
                        if (slash > 0) {
                            const resourceType = path.slice(0, slash);
                            const id = path.slice(slash + 1);
                            const label = String(children ?? `${resourceType}/${id}`);
                            return <FhirResourceLink resourceType={resourceType} id={id} label={label} />;
                        }
                    }
                    return <a href={href} target="_blank" rel="noreferrer">{children}</a>;
                },
                // @ts-ignore
                cp: ({ children }: any) => {
                    const raw = Array.isArray(children)
                        ? children.map((c: unknown) => typeof c === 'string' ? c : '').join('')
                        : String(children ?? '');
                    const json = raw.replace(/```[a-z]*\n?/g, '').replace(/\n?```/g, '').trim();
                    if (json.startsWith('{')) return <StaticComponent instruction={json} />;
                    return null;
                },
                pre: ({ node, children: preChildren, ...props }: any) => {
                    const lang = /language-(\w+)/.exec(
                        node?.children?.[0]?.properties?.className?.[0] || ''
                    )?.[1];
                    if (lang === 'cp' || lang === 'mermaid') return <>{preChildren}</>;
                    return <pre {...props}>{preChildren}</pre>;
                },
                code: ({ node: _node, inline, className, children: codeChildren, ...props }: any) => {
                    const codeString = String(codeChildren).replace(/\n$/, '');
                    const match = /language-(\w+)/.exec(className || '');
                    const lang = match ? match[1] : null;

                    if (codeString.startsWith('cp:')) {
                        return <StaticComponent instruction={codeString.slice(3).trim()} />;
                    }
                    if (!inline && lang === 'cp') {
                        return <StaticComponent instruction={codeString} />;
                    }
                    if (!inline && lang === 'mermaid') {
                        const cleaned = codeString.replace(/^---[\s\S]*?---\s*/m, '').trim();
                        return <MermaidDiagram chart={cleaned} />;
                    }

                    const isShortSingleLine = !/\n/.test(codeString) && codeString.length < 120;
                    if (lang && !isShortSingleLine) {
                        return (
                            <SyntaxHighlighter style={oneLight} language={lang} PreTag="div" {...props}>
                                {codeString}
                            </SyntaxHighlighter>
                        );
                    }
                    if (!inline && !isShortSingleLine) {
                        return <pre {...props}><code className={className}>{codeString}</code></pre>;
                    }
                    return <code className={className} {...props}>{codeChildren}</code>;
                },
            }}
        >
            {processed}
        </ReactMarkdown>
    );
}
