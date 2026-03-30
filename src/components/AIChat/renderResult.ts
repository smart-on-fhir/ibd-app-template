// renderResult.ts
import { openai } from "./openaiClient";
import { rendererSystemPrompt } from "./rendererPrompt";

export async function renderResult(
  userQuestion: string,
  resultData: any
) {
  if (!openai) throw new Error('OpenAI not configured');
  const response = await openai.chat.completions.create({
    model: "gpt-oss-120b",
    temperature: 0.2,
    messages: [
      { role: "system", content: rendererSystemPrompt },
      {
        role: "user",
        content: `
User question:
${userQuestion}

Data (JSON):
${JSON.stringify(resultData, null, 2)}
`
      }
    ]
  });

  return response.choices[0].message.content!;
}
