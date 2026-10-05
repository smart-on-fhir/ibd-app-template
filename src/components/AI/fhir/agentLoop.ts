import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { TOOL_DEFINITIONS, runTool, type ResourcesByType } from './tools';
import SYSTEM_PROMPT_BASE from './systemPrompt.md?raw';
import COMPONENT_TYPES_RAW from './componentTypes.d.ts?raw';

const SYSTEM_PROMPT = SYSTEM_PROMPT_BASE.replace(
    '{{COMPONENT_TYPES}}',
    '```typescript\n' + COMPONENT_TYPES_RAW + '\n```',
);

const MAX_ITERATIONS = 45;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AgentStep =
    | { type: 'tool_call'; id: string; name: string; args: Record<string, unknown>; iteration: number }
    | { type: 'tool_result'; id: string; name: string; result: unknown; iteration: number; durationMs: number }
    | { type: 'tokens'; iteration: number; promptTokens: number; completionTokens: number };

export type AgentLoopOptions = {
    openai: OpenAI;
    model: string;
    store: ResourcesByType;
    history?: { role: 'user' | 'assistant'; content: string }[];
    onChunk?: (chunk: string) => void;
    onStep?: (step: AgentStep) => void;
};

// ---------------------------------------------------------------------------
// Agent loop
// ---------------------------------------------------------------------------

export async function runAgentLoop(
    userMessage: string,
    opts: AgentLoopOptions,
): Promise<string> {
    const { openai, model, store, onChunk, onStep } = opts;

    const messages: ChatCompletionMessageParam[] = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...(opts.history ?? []),
        { role: 'user', content: userMessage },
    ];

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
        const response = await openai.chat.completions.create({
            model,
            temperature: 0,
            messages,
            tools: TOOL_DEFINITIONS,
            tool_choice: 'auto',
            stream: false, 
        });

        const msg = response.choices[0].message;
        console.debug(`[agentLoop] iteration ${iteration} finish_reason:`, response.choices[0].finish_reason);
        if (response.usage) {
            onStep?.({ type: 'tokens', iteration, promptTokens: response.usage.prompt_tokens, completionTokens: response.usage.completion_tokens });
        }

        messages.push({ role: 'assistant', content: msg.content ?? null, tool_calls: msg.tool_calls });

        // No tool calls → final answer
        if (!msg.tool_calls || msg.tool_calls.length === 0) {
            const text = msg.content ?? '';
            onChunk?.(text);
            return text;
        }

        // Execute all tool calls in parallel
        const toolMessages = await Promise.all(
            msg.tool_calls.filter((tc) => tc.type === 'function').map(async (tc) => {
                let args: Record<string, unknown>;
                try {
                    args = JSON.parse(tc.function.arguments);
                } catch {
                    args = {};
                }

                onStep?.({ type: 'tool_call', id: tc.id, name: tc.function.name, args, iteration });

                let result: unknown;
                const t0 = Date.now();
                try {
                    result = runTool(tc.function.name, args, store);
                } catch (err) {
                    result = { error: String(err) };
                }

                onStep?.({ type: 'tool_result', id: tc.id, name: tc.function.name, result, iteration, durationMs: Date.now() - t0 });

                return {
                    role: 'tool' as const,
                    tool_call_id: tc.id,
                    content: JSON.stringify(result),
                };
            }),
        );

        messages.push(...toolMessages);
    }

    return 'I was unable to generate a response within the allowed number of steps.';
}
