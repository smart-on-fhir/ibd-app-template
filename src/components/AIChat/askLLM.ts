import { generateQueryCode } from "./generatePlan";
import { renderResult }      from "./renderResult";
import { execute }           from "../../data/Sandbox/index";
import type { Database }     from "../../data/types";


export async function askLLM(
  question: string,
  database: Database
) {
    let code, data, output
    try {
        // 1. Ask LLM how to query
        code = await generateQueryCode(question);

        // If the LLM returned plain text (an apology or explanation) instead
        // of runnable code, treat it as the final response and skip execution.
        const trimmed = String(code || '').trim();
        const looksLikeRunnable = /(?:async\s+function\s+run|function\s+run|```)/i.test(trimmed);
        if (!looksLikeRunnable) {
                // Strip surrounding quotes or fences if present and return as-is
                const stripFences = (s: string) => s.replace(/^\s*```[\s\S]*?\n|\n```\s*$/g, '').replace(/^\s*["'`]+|["'`]+\s*$/g, '').trim();
                return stripFences(trimmed);
        }

        // 2. Execute safely
        data = await execute(code, database);

        // 3. Ask LLM to explain / render
        output = await renderResult(question, data);

        return output;
    } catch (err) {
        console.log("askLLM error:", { err, code, data, output });
        throw err;
    }
}
