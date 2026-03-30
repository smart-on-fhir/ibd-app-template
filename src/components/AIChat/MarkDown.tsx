import ReactMarkdown  from 'react-markdown';
import remarkGfm      from 'remark-gfm';
import rehypeRaw      from 'rehype-raw';
import MermaidDiagram from './MermaidDiagram';
import Chart from './Hicharts';
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight }   from 'react-syntax-highlighter/dist/esm/styles/prism';

// register only the languages you need to keep bundle size small
import jsonLang   from 'react-syntax-highlighter/dist/esm/languages/prism/json';
import jsLang     from 'react-syntax-highlighter/dist/esm/languages/prism/javascript';
import tsLang     from 'react-syntax-highlighter/dist/esm/languages/prism/typescript';
import bashLang   from 'react-syntax-highlighter/dist/esm/languages/prism/bash';
import pythonLang from 'react-syntax-highlighter/dist/esm/languages/prism/python';

SyntaxHighlighter.registerLanguage('json', jsonLang);
SyntaxHighlighter.registerLanguage('javascript', jsLang);
SyntaxHighlighter.registerLanguage('typescript', tsLang);
SyntaxHighlighter.registerLanguage('bash', bashLang);
SyntaxHighlighter.registerLanguage('python', pythonLang);


// Normalize input to handle LLM quirks: trim, collapse whitespace,
// remove stray HTML tags in table cells, and preserve code blocks.
function normalizeMarkdownInput(src: string) {
    if (!src) return src;
    let text = String(src).trim();

    // Sometimes LLM generates 2 closing backticks for fenced code blocks
    // instead of 3; fix that.
    text = text.replace(/^\s*``\s*$/gm, '```\n');

    // Preserve fenced code blocks and inline code by replacing with placeholders
    const codeBlocks: string[] = [];
    text = text.replace(/```[\s\S]*?```/g, (m) => {
        const idx = codeBlocks.push(m) - 1;
        return `__CODE_BLOCK_${idx}__`;
    });

    const inlineCodes: string[] = [];
    text = text.replace(/`[^`\n]*`/g, (m) => {
        const idx = inlineCodes.push(m) - 1;
        return `__INLINE_CODE_${idx}__`;
    });

    // Merge multiline GFM table rows into a single line so internal newlines
    // don't break out of the cell. Use a temporary marker so that later
    // trimming doesn't remove the two spaces required for a Markdown hard
    // break. The marker will be restored to '  \n' after normalization.
    const TABLE_NL = '__TABLE_NL__';
    const lines = text.split('\n');
    const merged: string[] = [];
    let buffer: string | null = null;
    for (let i = 0; i < lines.length; i++) {
        const ln = lines[i];
        const trimmed = ln.trimEnd();
        if (buffer === null) {
            // start of a potential table row that continues on next lines
            if (trimmed.startsWith('|') && !trimmed.endsWith('|')) {
                buffer = trimmed;
            } else {
                merged.push(ln);
            }
        } else {
            // continuation of a table row
            if (trimmed.endsWith('|')) {
                buffer = buffer + TABLE_NL + trimmed;
                merged.push(buffer);
                buffer = null;
            } else {
                buffer = buffer + TABLE_NL + ln;
            }
        }
    }
    if (buffer !== null) merged.push(buffer);
    text = merged.join('\n');

    // Normalize common artifacts
    text = text.replace(/<br\s*\/?\s*>/gi, '\n');
    text = text.replace(/[\u00A0\u202F]/g, ' ');
    text = text.replace(/[\u2010-\u2014\u2212]/g, '-');

    // Remove stray HTML tags (this strips tags but preserves the text content)
    text = text.replace(/<[^>]+>/g, '');

    // Collapse multiple spaces on each line, trim line ends
    text = text.split('\n').map((ln) => ln.replace(/[\t ]{2,}/g, ' ').trimEnd()).join('\n');

    // Restore table internal newlines as explicit HTML line breaks so they
    // render inside the table cell and don't terminate the table row.
    // We restore as '<br />' because `rehype-raw` is enabled.
    text = text.replace(/__TABLE_NL__/g, '<br />');

    // Collapse long runs of blank lines to at most one
    text = text.replace(/\n{3,}/g, '\n\n');

    // Restore inline code and code blocks
    text = text.replace(/__INLINE_CODE_(\d+)__/g, (_m, i) => inlineCodes[Number(i)] || '');
    text = text.replace(/__CODE_BLOCK_(\d+)__/g, (_m, i) => codeBlocks[Number(i)] || '');

    return text;
}

export default function MarkDown({ children }: { children: string }) {

    const normalized = normalizeMarkdownInput(children);
    console.log("Normalized Markdown:", normalized);
    return (
        <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeRaw]}
            children={normalized}
            components={{
                code: ({node, inline, className, children, ...props}: any) => {
                    const codeString = String(children).replace(/\n$/, '');
                    const match      = /language-(\w+)/.exec(className || '');
                    const lang       = match ? match[1] : null;
                    
                    // Try to detect a Highcharts config and parse it to JSON.
                    // function tryParseHighchartsOptions(src: string): any | null {
                    //     const s = src.trim();
                    //     // If starts with an object literal, try JSON.parse first
                    //     let candidate = s;
                    //     if (s.startsWith('{')) {
                    //         try {
                    //             return JSON.parse(candidate);
                    //         } catch (_) {
                    //             // fallthrough to heuristic cleanup
                    //         }
                    //     }

                    //     // Extract first top-level {...} block
                    //     const firstBrace = s.indexOf('{');
                    //     if (firstBrace === -1) return null;
                    //     let depth = 0;
                    //     let end = -1;
                    //     for (let i = firstBrace; i < s.length; i++) {
                    //         const ch = s[i];
                    //         if (ch === '{') depth++;
                    //         else if (ch === '}') {
                    //             depth--;
                    //             if (depth === 0) { end = i; break; }
                    //         }
                    //     }
                    //     if (end === -1) return null;
                    //     candidate = s.slice(firstBrace, end + 1);

                    //     // Heuristic cleanup: replace single quotes with double quotes,
                    //     // remove trailing commas before `}` or `]`.
                    //     let cleaned = candidate.replace(/\n/g, ' ')
                    //                            .replace(/(['"])\s*:\s*(['"])?/g, '"$2":$3')
                    //                            .replace(/,\s*(}[,\]])/g, '$1');
                    //     // fallback simple single->double quote replacement
                    //     cleaned = cleaned.replace(/'/g, '"');
                    //     cleaned = cleaned.replace(/,\s*}/g, '}').replace(/,\s*\]/g, ']');
                    //     try {
                    //         return JSON.parse(cleaned);
                    //     } catch (e) {
                    //         return null;
                    //     }
                    // }
                    
                    if (!inline && lang === 'mermaid') {
                        const cleaned = codeString.replace(/^---[\s\S]*?---\s*/m, '').trim();
                        return <MermaidDiagram chart={cleaned} />;
                    }

                    // if (!inline && lang === 'highcharts') {
                    //     // const cleaned = codeString.replace(/\/\/.*$/gm, '').trim();
                    //     const options = tryParseHighchartsOptions(codeString);
                    //     if (options && typeof options === 'object' && (options.chart || options.series || options.xAxis || options.yAxis)) {
                    //         return <Chart options={options} />;
                    //     }
                    // }


                    // If this is a fenced block and looks like a highcharts options
                    // object, render the interactive chart inline.
                    if (!inline) {
                        try {
                            const options = JSON.parse(codeString);
                            console.log("Parsed Highcharts options ======> ", options, codeString);
                            if (options && typeof options === 'object' && (options.chart || options.series || options.xAxis || options.yAxis)) {
                                return <Chart options={options} />;
                            }
                        } catch (e) {
                            console.error("Error parsing Highcharts options: ", e);
                        }
                    }
                    
                    const isShortSingleLine = !/\n/.test(codeString) && codeString.length < 120;

                    if (lang && !isShortSingleLine) {
                        return (
                            <SyntaxHighlighter
                                style={oneLight}
                                language={lang}
                                PreTag="div"
                                {...props}
                            >
                                {codeString}
                            </SyntaxHighlighter>
                        );
                    }

                    if (!inline && !isShortSingleLine) {
                        return <pre {...props}><code className={className}>{codeString}</code></pre>;
                    }
                    return <code className={className} {...props}>{children}</code>;
                },

                

                // Render Markdown tables with Bootstrap table styling
                table: ({ node, ...props }) => <table className="table table-bordered table-sm small table-striped" {...props} />,

                // Ensure all links open in a new tab and use rel="noopener noreferrer"
                a: ({ node, ...props }: any) => (
                    <a {...props} target="_blank" rel="noopener noreferrer" />
                ),
            }}
        />
    )
}