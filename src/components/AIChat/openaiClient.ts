// openaiClient.ts
import OpenAI from "openai";

const apiKey = import.meta.env.VITE_OPENAI_API_KEY;

export const openai: OpenAI | null = apiKey
    ? new OpenAI({
        apiKey,
        dangerouslyAllowBrowser: true,
        baseURL: "https://ai-chip-nonprod-scus-00-resource.services.ai.azure.com/openai/v1/",
    })
    : null;
