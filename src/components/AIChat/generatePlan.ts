// generatePlan.ts
import { openai } from "./openaiClient";
import { plannerSystemPrompt } from "./plannerPrompt";

export async function generateQueryCode(userQuestion: string) {
  const response = await openai.chat.completions.create({
    model: "gpt-oss-120b",
    temperature: 0,
    messages: [
      { role: "system", content: plannerSystemPrompt },
      { role: "user", content: userQuestion }
    ]
  });

  return response.choices[0].message.content!;
}
