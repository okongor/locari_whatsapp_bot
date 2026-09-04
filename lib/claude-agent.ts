// lib/claude-agent.ts
import Anthropic from "@anthropic-ai/sdk";
import { getPropertyListings } from "@/src/ai/tools/listing-retrieval";
import type { ChatMessage } from "./conversation-store";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODEL = "claude-sonnet-4-6";

const SYSTEM_PROMPT = `You are the Locari rental assistant on WhatsApp. You help people in Nigeria find rental properties by chatting naturally.

Guidelines:
- Ask brief clarifying questions if the user's request is vague (e.g. no location or budget given).
- Use the getPropertyListings tool to search whenever you have enough info to run a useful search (even partial: location alone, or budget alone, is enough to try).
- When presenting results, be concise: mention price (yearly rent in Naira), beds/baths, and location (lga, state). Note if a landlord is verified.
- If more than 3 listings match, summarize them briefly in text rather than describing every one in detail — the app will send a picker separately.
- If zero listings match, suggest loosening a filter (higher budget, nearby LGA, etc.) rather than just saying "no results."
- Keep replies short and WhatsApp-appropriate — no long paragraphs, use line breaks.
- Never invent listings or details not returned by the tool.`;

const tools: Anthropic.Tool[] = [
  {
    name: "getPropertyListings",
    description:
      "Search published Locari property listings by location, price, type, and bedrooms. Returns matching listings from Firestore.",
    input_schema: {
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
];

export type AgentResult = {
  replyText: string;
  listings: any[] | null; // populated if getPropertyListings was called
  updatedHistory: ChatMessage[];
};

export async function runAgentTurn(
  history: ChatMessage[],
  userText: string
): Promise<AgentResult> {
  const messages: ChatMessage[] = [
    ...history,
    { role: "user", content: userText },
  ];

  let response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: messages as Anthropic.MessageParam[],
    tools,
  });

  let listingsResult: any[] | null = null;

  // Handle a tool_use turn (search), then get Claude's natural-language follow-up
  const toolUseBlock = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
  );

  if (toolUseBlock && toolUseBlock.name === "getPropertyListings") {
    const input = toolUseBlock.input as {
      location?: string;
      maxPrice?: number;
      propertyType?: string;
      beds?: number;
    };

    listingsResult = await getPropertyListings(input);

    messages.push({ role: "assistant", content: response.content });
    messages.push({
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: toolUseBlock.id,
          content: JSON.stringify(
            // Trim payload sent back to Claude — it doesn't need every field
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
        },
      ],
    });

    response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: messages as Anthropic.MessageParam[],
      tools,
    });
  }

  const textBlock = response.content.find(
    (b): b is Anthropic.TextBlock => b.type === "text"
  );
  const replyText = textBlock?.text ?? "";

  messages.push({ role: "assistant", content: response.content });

  return { replyText, listings: listingsResult, updatedHistory: messages };
}
