import { memo, useEffect, useRef, useState } from "react";
import { usePatientContext } from "../../contexts/PatientContext";
import { runAgentLoop, type AgentStep } from "./fhir/agentLoop";

import OpenAI from "openai";
import { LLMMarkdown } from "./LLMMarkdown";
import { Collapse, JsonViewer, useClinicalData } from "clinical-primitives";
import { FhirResourceModalProvider } from "./FhirResourceModal";
import "./Chat.scss"

const MODEL = "gpt-5.4";

function getOpenAI(): OpenAI | null {
    const apiKey = (import.meta as any).env?.VITE_OPENAI_API_KEY;
    if (!apiKey) return null;
    return new OpenAI({
        apiKey,
        dangerouslyAllowBrowser: true,
        baseURL: "https://ai-chip-nonprod-scus-00-resource.services.ai.azure.com/openai/v1/",        
    });
}

type Message = { role: 'user' | 'assistant'; content: string };

// ---------------------------------------------------------------------------
// Step summary helpers
// ---------------------------------------------------------------------------

const TOOL_COLORS: Record<string, string> = {
    get_observation_trend:         'primary',
    get_medications:               'primary',
    query_patient_data:            'warning',
    describe_resource:             'secondary',
    get_patient_summary:           'success',
    list_available_resource_types: 'info',
};

function toolColor(name: string) {
    return TOOL_COLORS[name] ?? 'dark';
}


// ---------------------------------------------------------------------------
// Dev sidebar component
// ---------------------------------------------------------------------------

function DevSidebar({ steps, open, onToggle }: {
    steps: AgentStep[];
    open: boolean;
    onToggle: () => void;
}) {
    const scrollRef = useRef<HTMLDivElement>(null);

    // Accumulate token totals
    const totalPrompt     = steps.filter((s): s is Extract<AgentStep, { type: 'tokens' }> => s.type === 'tokens').reduce((n, s) => n + s.promptTokens, 0);
    const totalCompletion = steps.filter((s): s is Extract<AgentStep, { type: 'tokens' }> => s.type === 'tokens').reduce((n, s) => n + s.completionTokens, 0);

    // Group by tool call id: call + result pairs
    const pairs: { call: Extract<AgentStep, { type: 'tool_call' }>; result?: Extract<AgentStep, { type: 'tool_result' }> }[] = [];
    for (const step of steps) {
        if (step.type === 'tool_call') {
            pairs.push({ call: step });
        } else if (step.type === 'tool_result') {
            const pair = [...pairs].reverse().find((p) => p.call.id === step.id);
            if (pair) pair.result = step;
        }
    }

    return (
        <div className="d-flex flex-column" style={{ width: open ? 320 : 36, transition: 'width 0.15s', flexShrink: 0, minHeight: 0 }}>
            {/* Toggle button */}
            <div className="d-flex align-items-center justify-content-between border-bottom" style={{ height: 36, padding: '0 6px', overflow: 'visible' }}>
                {open && (
                    <span className="small fw-semibold text-muted">
                        Agent trace
                        {(totalPrompt + totalCompletion) > 0 && (
                            <span className="fw-normal ms-2">
                                <span title="Prompt tokens" className="text-secondary small">{totalPrompt.toLocaleString()}↑</span>
                                {' '}
                                <span title="Completion tokens" className="text-secondary small">{totalCompletion.toLocaleString()}↓</span>
                            </span>
                        )}
                    </span>
                )}
                <button
                    className="btn btn-sm p-0 ms-auto text-muted"
                    style={{ lineHeight: 1, flexShrink: 0 }}
                    title={open ? 'Hide trace' : 'Show agent trace'}
                    onClick={onToggle}
                >
                    <i className={`bi bi-layout-sidebar-${open ? 'reverse' : 'inset-reverse'}`} style={{ fontSize: '1rem' }} />
                </button>
            </div>

            {open && (
                <div ref={scrollRef} className="flex-grow-1 overflow-auto p-2" style={{ fontSize: '0.72rem' }}>
                    {pairs.length === 0 && (
                        <p className="text-muted mb-0">No tool calls yet.</p>
                    )}
                    {pairs.map(({ call, result }, i) => (
                        <div key={i} className="">
                            {/* Iteration divider */}
                            {i === 0 || pairs[i - 1].call.iteration !== call.iteration ? (
                                <div className="text-secondary opacity-75 mt-2" style={{ fontSize: '0.65rem', letterSpacing: '0.05em' }}>
                                    ITERATION {call.iteration + 1}
                                </div>
                            ) : null}

                            <Collapse label={
                            <div className="d-flex align-items-baseline gap-1 w-100 flex-grow-1 flex-grow-1">
                                <div className={`bg-${toolColor(call.name)} rounded flex-shrink-0 mt-1`} style={{ width: '0.7em', height: '0.7em' }}/>
                                <div className="flex-grow-1 fw-bold text-secondary">{call.name.replace(/_/g, '_​')}</div>
                                {result ?
                                    <span className="text-muted ms-auto badge bg-secondary bg-opacity-10">{result.durationMs}ms</span> :
                                    <i className="text-muted fa-spinner fa-pulse fa-sm" />
                                }
                            </div>}>

                            <div className="d-flex flex-column">
                                <div className="border-top py-1 my-1 ps-3" style={{ fontFamily: 'monospace', fontSize: '0.65rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                                    <JsonViewer data={{
                                        "Tool Call": call,
                                        "Result": result?.result ?? (result ? 'No result data' : 'Pending'),
                                    } as any} />
                                </div>
                                {/* <div className="border-top py-1">
                                    {result ? <JsonViewer data={result as any} /> : (
                                        <div className="ms-1 text-muted">
                                            <span className="spinner-border spinner-border-sm me-1" style={{ width: '0.6rem', height: '0.6rem' }} />
                                            running…
                                        </div>
                                    )}
                                </div> */}
                            </div>
                            </Collapse>

                            {/* Tool call */}
                            {/* <div className="d-flex align-items-baseline gap-1"> */}
                                
                                {/* <div className={`bg-${toolColor(call.name)} rounded flex-shrink-0 mt-1`} style={{ width: '0.7em', height: '0.7em' }}/> */}
                                {/* <div className="d-flex flex-column"> */}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Memoized message list — isolated from input state changes
// ---------------------------------------------------------------------------

const MessageList = memo(function MessageList({ messages }: { messages: Message[] }) {
    return (
        <>
            {messages.length === 0 && (
                <p className="text-muted small">Ask a question about the patient record.</p>
            )}
            {messages.map((m, i) => (
                <div key={i} className={`mb-3 chat-turn ${m.role === 'user' ? 'text-end' : ''}`}>
                    {m.role === 'user' ? (
                        <span className="badge bg-primary text-wrap text-start chat-message user-message" style={{ maxWidth: '75%', whiteSpace: 'pre-wrap' }}>
                            {m.content}
                        </span>
                    ) : (
                        <div className="chat-message agent-message">
                            <LLMMarkdown>{m.content}</LLMMarkdown>
                        </div>
                    )}
                </div>
            ))}
        </>
    );
});

// ---------------------------------------------------------------------------
// Main Chat component
// ---------------------------------------------------------------------------

export function Chat() {
    const { selectedPatientResources } = usePatientContext();
    const { loadFromResources } = useClinicalData();
    const [messages, setMessages] = useState<Message[]>([]);
    const [steps, setSteps] = useState<AgentStep[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const inputRef = useRef<HTMLInputElement>(null);
    const chatHistoryRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const flat = Object.values(selectedPatientResources).flat();
        if (flat.length > 0) loadFromResources(flat as any);
    }, [selectedPatientResources]);

    useEffect(() => {
        const container = chatHistoryRef.current;
        if (!container || messages.length === 0) return;
        const last = messages[messages.length - 1];
        if (last.role === 'user') {
            container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
        } else {
            // Scroll so the user prompt that triggered this response is at the top
            const turns = container.querySelectorAll<HTMLElement>('.chat-turn');
            const target = turns[turns.length - 2] ?? turns[turns.length - 1];
            if (target) {
                const offset = target.getBoundingClientRect().top - container.getBoundingClientRect().top;
                container.scrollBy({ top: offset, behavior: 'smooth' });
            }
        }
    }, [messages]);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        const text = input.trim();
        if (!text || loading) return;

        const client = getOpenAI();
        if (!client) {
            setError('API key not configured. Set VITE_OPENAI_API_KEY in .env.');
            return;
        }

        setInput('');
        setError(null);
        setSteps([]);
        setMessages((prev) => [...prev, { role: 'user', content: text }]);
        setLoading(true);

        try {
            const answer = await runAgentLoop(text, {
                openai: client,
                model: MODEL,
                store: selectedPatientResources,
                history: messages,
                onStep: (step) => setSteps((prev) => [...prev, step]),
            });
            setMessages((prev) => [...prev, { role: 'assistant', content: answer }]);
        } catch (err) {
            setError(String(err));
        } finally {
            setLoading(false);
            setTimeout(() => inputRef.current?.focus(), 0);
        }
    }

    return (
        <FhirResourceModalProvider>
        <div className="d-flex h-100" style={{ maxHeight: '80vh' }}>
            {/* Chat panel */}
            <div className="d-flex flex-column flex-grow-1 pe-2" style={{ minWidth: 0 }}>
                <div ref={chatHistoryRef} className="flex-grow-1 overflow-auto p-3 border rounded mb-2 bg-white chat-history" style={{ minHeight: 200 }}>
                    <MessageList messages={messages} />
                    {loading && (
                        <div className="text-muted small">
                            <span className="spinner-border spinner-border-sm me-2" />
                            Thinking...
                        </div>
                    )}
                    {error && <div className="alert alert-danger small py-1 px-2">{error}</div>}
                </div>

                <form onSubmit={handleSubmit} className="d-flex gap-2">
                    <input
                        ref={inputRef}
                        type="text"
                        className="form-control"
                        placeholder="Ask about the patient..."
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        disabled={loading}
                    />
                    <button type="submit" className="btn btn-primary" disabled={loading || !input.trim()}>
                        Send
                    </button>
                </form>
            </div>

            {/* Dev sidebar */}
            <DevSidebar
                steps={steps}
                open={sidebarOpen}
                onToggle={() => setSidebarOpen((v) => !v)}
            />
        </div>
        </FhirResourceModalProvider>
    );
}
