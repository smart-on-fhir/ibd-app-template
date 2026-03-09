// openaiClient.ts
import OpenAI from "openai";

export const openai = new OpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true,
  baseURL: "https://ai-chip-nonprod-scus-00-resource.services.ai.azure.com/openai/v1/",
});
