// lib/llm-agent.ts
// Agent logic powered by DeepSeek, via its OpenAI-compatible API.
// Requires env var: DEEPSEEK_API_KEY

import OpenAI from "openai";
import { getPropertyListings } from "@/src/ai/tools/listing-retrieval";
import type { ChatMessage } from "./conversation-store";

const deepseek = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: "https://api.deepseek.com",
});

const MODEL = "deepseek-chat";

const SYSTEM_PROMPT = `You are the Locari rental assistant on WhatsApp. You help people in Nigeria find rental properties by chatting naturally.

Guidelines:
- Ask brief clarifying questions if the user's request is vague (e.g. no location or budget given).
- Use the getPropertyListings tool to search whenever you have enough info to run a useful search (even partial: location alone, or budget alone, is enough to try).
- When presenting results, be concise: mention price (yearly rent in Naira), beds/baths, and location (lga, state). Note if a landlord is verified.
- If more than 3 listings match, summarize them briefly in text rather than describing every one in detail — the app will send a picker separately.
- If zero listings match, suggest loosening a filter (higher budget, nearby LGA, etc.) rather than just saying "no results."
- Keep replies short and WhatsApp-appropriate — no long paragraphs, use line breaks.
- Never invent listings or details not returned by the tool.`;

const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "getPropertyListings",
      description:
        "Search published Locari property listings by location, price, type, and bedrooms. Returns matching listings from Firestore.",
      parameters: {
        type: "object",
        properties: {
          location: {
            type: "string",
            description:
              "LGA, neighborhood, city, or state in Nigeria, e.g. 'Ikeja', 'Lekki', 'Oyo State'",
          },
          maxPrice: {
            type: "number",
            description: "Maximum yearly rent in Naira",
          },
          propertyType: {
            type: "string",
            enum: ["House", "Shortlet", "Office Space", "Warehouse", "Shop"],
          },
          beds: {
            type: "number",
            description: "Minimum number of bedrooms required",
          },
        },
      },
    },
  },
];

export type AgentResult = {
  replyText: string;
  listings: any[] | null;
  updatedHistory: ChatMessage[];
};

export async function runAgentTurn(
  history: ChatMessage[],
  userText: string
): Promise<AgentResult> {
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...(history as OpenAI.Chat.Completions.ChatCompletionMessageParam[]),
    { role: "user", content: userText },
  ];

  let response = await deepseek.chat.completions.create({
    model: MODEL,
    messages,
    tools,
  });

  let listingsResult: any[] | null = null;
  let assistantMessage = response.choices[0].message;

  if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
    const toolCall = assistantMessage.tool_calls[0];

    if (toolCall.function.name === "getPropertyListings") {
      const input = JSON.parse(toolCall.function.arguments || "{}") as {
        location?: string;
        maxPrice?: number;
        propertyType?: string;
        beds?: number;
      };

      listingsResult = await getPropertyListings(input);

      messages.push(assistantMessage);
      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: JSON.stringify(
          listingsResult.map((l: any) => ({
            id: l.id,
            title: l.title,
            yearlyRent: l.yearlyRent,
            type: l.type,
            beds: l.beds,
            baths: l.baths,
            lga: l.address?.lga,
            state: l.address?.state,
            verified: l.landlord?.isVerified,
          }))
        ),
      });

      response = await deepseek.chat.completions.create({
        model: MODEL,
        messages,
        tools,
      });
      assistantMessage = response.choices[0].message;
    }
  }

  const replyText = assistantMessage.content ?? "";

  // Store history without the system prompt (it's re-added every turn)
  const updatedHistory: ChatMessage[] = [
    ...(history as ChatMessage[]),
    { role: "user", content: userText },
    { role: "assistant", content: assistantMessage as any },
  ];

  return { replyText, listings: listingsResult, updatedHistory };
}
