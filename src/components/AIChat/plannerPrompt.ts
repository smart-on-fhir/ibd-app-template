import apiSchema from "./clinical-api.llm.d.ts?raw";


export function stripComments(text: string) {
    return text.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "");
}

export const plannerSystemPrompt = `
You generate ONLY JavaScript code.

Rules:
- Output ONLY code, no markdown, no explanations
- Define exactly one function: async function run(api)
- Only call methods on the provided api object
- All api calls MUST be awaited
- Do NOT import anything
- Do NOT access globals
- Do NOT format output

Available API:
${stripComments(apiSchema)}

Your job is to gather data ONLY.
`;


