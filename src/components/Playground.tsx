import { useState }   from "react";
import ReactMarkdown  from "react-markdown";
import rehypeRaw      from "rehype-raw";
import remarkGfm      from "remark-gfm";
import MermaidDiagram from "./AIChat/MermaidDiagram";
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight }   from 'react-syntax-highlighter/dist/esm/styles/prism';
import { StaticComponent } from "clinical-primitives";

function ComponentDemo({ instruction }: { instruction?: string }) {
    const [currentInstruction, setCurrentInstruction] = useState<string>(instruction || '');
    return (
        <div className='row' style={{ minHeight: '12rem' }}>
            <div className='col col-5'>
                <textarea
                    className='form-control mb-2 font-monospace text-sm'
                    placeholder='Instruction'
                    style={{ resize: 'vertical', height: '100%', fontSize: 'var(--text-sm)', whiteSpace: 'pre-wrap', background: 'var(--bg-secondary)' }}
                    value={currentInstruction}
                    onChange={(e) => setCurrentInstruction(e.target.value)} />
            </div>
            <div className='col col-7'>
                <StaticComponent instruction={currentInstruction} />
            </div>
        </div>
    )
}

function MarkdownDemo({ markdown = '' }: { markdown?: string }) {
    
    const [md, setMd] = useState<string>(markdown || '');
    
    return (
        <div className='row' style={{ minHeight: '6rem' }}>
            <div className='col col-5'>
                <textarea
                    className='form-control mb-2 font-monospace text-sm'
                    placeholder='Markdown'
                    style={{ resize: 'vertical', height: '100%', fontSize: 'var(--text-sm)', whiteSpace: 'pre-wrap', background: 'var(--bg-secondary)' }}
                    value={md}
                    onChange={(e) => setMd(e.target.value)} />
            </div>
            <div className='col col-7'>
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} children={md} components={{
                    pre: ({ node, children, ...props }: any) => {
                        // Skip the <pre> wrapper for custom-rendered block types
                        // so they render as normal React components, not inside a <pre>.
                        const lang = /language-(\w+)/.exec(
                            node?.children?.[0]?.properties?.className?.[0] || ''
                        )?.[1];
                        if (lang === 'cp' || lang === 'mermaid') return <>{children}</>;
                        return <pre {...props}>{children}</pre>;
                    },
                    code: ({ node, inline, className, children, ...props }: any) => {
                        const codeString = String(children).replace(/\n$/, '');
                        const match      = /language-(\w+)/.exec(className || '');
                        const lang       = match ? match[1] : null;

                        // Inline cp: prefix — usable inside table cells and paragraphs
                        if (codeString.startsWith('cp:')) {
                            return <StaticComponent instruction={codeString.slice(3).trim()} />;
                        }

                        if (!inline && lang === 'cp') {
                            return <StaticComponent instruction={children} />;
                        }

                        if (!inline && lang === 'mermaid') {
                            const cleaned = codeString.replace(/^---[\s\S]*?---\s*/m, '').trim();
                            return <MermaidDiagram chart={cleaned} />;
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
                    }
                }} />
            </div>
        </div>
    )
}

export default function ClinicalPrimitivesPlayground() {
    return (
        <div>
            <h2>Clinical Primitives Playground</h2>
            <p>This page is for testing and developing clinical primitives in the context of a real patient. Use the dropdown below to select different render instructions and see how they look.</p>
            <hr/>
            
            
            <h6>text</h6>
            <div className='width-100 mb-4'>
                <ComponentDemo instruction={`{
    "type": "text",
    "content": "this is a test"
}`} />
            </div>
            
            
            <h6>observation_card</h6>
            <div className='width-100 mb-4'>
                <ComponentDemo instruction={`{
    "type": "observation_card",
    "observationId": "fMNYJguZAtH3kIWjlpEqiRtSwmzAMjn9wFKd1V2F3J6Q4"
}`} />
            </div>
            
            
            <h6>observation_panel</h6>
            <div className='width-100 mb-4'>
                <ComponentDemo instruction={`{
    "type": "observation_panel",
    "title": "My Observations Panel",
    "filters": ["Vitals", "IBD"]
}`} />
            </div>
            
            
            <h6>medication_list</h6>
            <div className='width-100 mb-4'>
                <ComponentDemo instruction={`{
    "type": "medication_list",
    "title": "My Medications"
}`} />
            </div>

            <h6>condition_list</h6>
            <div className='width-100 mb-4'>
                <ComponentDemo instruction={`{
    "type": "condition_list",
    "title": "My Conditions"
}`} />
            </div>

            <h6>immunization_list</h6>
            <div className='width-100 mb-4'>
                <ComponentDemo instruction={`{
    "type": "immunization_list",
    "title": "My Immunizations"
}`} />
            </div>

            <h6>lab_trend_panel</h6>
            <div className='width-100 mb-4'>
                <ComponentDemo instruction={`{
    "type": "lab_trend_panel",
    "title": "My Lab Trends",
    "labs": ["WBC", "RBC", "Hemoglobin", "Platelets"]
}`} />
            </div>

            <h6>Markdown</h6>
            <div className='width-100 mb-4'>
                <MarkdownDemo markdown={`# Hello World

This is a **markdown** demo with some sample content.

- Item 1
- Item 2
- Item 3


\`\`\`cp
{
    "type":"row",
    "gap": "1rem",
    "wrap": true,
    "children":[
        {
            "type": "observation_card",
            "observationId": "fMNYJguZAtH3kIWjlpEqiRtSwmzAMjn9wFKd1V2F3J6Q4",
            "style": {
                "width": "8em"
            }
        },
        {
            "type": "condition_list",
            "title": "Conditions List"
        }
    ]
}
\`\`\`

<br/><br/>


| Table | Example |
|-------|---------|
| Weight | \`cp:{"type":"observation_card","observationId":"fMNYJguZAtH3kIWjlpEqiRtSwmzAMjn9wFKd1V2F3J6Q4","style":{"width":"min-content","margin":"1ch"}}\` |
| Row 2 | Data 2   |

---
Here is an observation card \`cp:{"type":"observation_card","observationId":"fMNYJguZAtH3kIWjlpEqiRtSwmzAMjn9wFKd1V2F3J6Q4","style":{"width":"min-content"}}\` that renders inline.

---

[Link to Google](https://www.google.com)

`} />
            </div>

        </div>
    );
}
