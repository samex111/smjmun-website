import { Intent, Action, ParsedQuery } from "../types";
import { GeminiProvider } from "../../providers/gemini";
import { GroqProvider } from "../../providers/groq";
import { NvidiaProvider } from "../../providers/nvidia-provider";
import { AIProvider } from "../../providers/types";

export class UnderstandingLayer {
  private static getProvider(): AIProvider {
    if (process.env.NVIDIA_API_KEY) {
      return new NvidiaProvider();
    } else if (process.env.GROQ_API_KEY) {
      return new GroqProvider();
    }
    return new GeminiProvider();
  }

  static async understand(rawQuery: string, normalizedQuery: string): Promise<ParsedQuery> {
    const prompt = `
You are the natural language understanding layer for Tejas AI by SMJMUN.
Your ONLY job is to parse the user's query into a structured JSON object.
Do NOT answer the question. Do NOT include any text outside of the JSON block.
Do NOT output internal planner logic.

Allowed Intents: CONFERENCE, PROGRAM, ORGANIZATION, FAQ, CONTACT, GREETING, UNKNOWN
Allowed Actions: GET, LIST, COMPARE, SEARCH, UNKNOWN

Rules for Fields:
- If the user asks a broad question like "tell me everything", "full information", or "all details", leave the "field" property as null.
- Only extract specific fields (e.g. "venue", "registrationFee", "schedule") if explicitly requested.

Examples:
- "what is smjmun" -> {"intent": "ORGANIZATION", "action": "GET", "entity": "smjmun"}
- "what the mun" -> {"intent": "ORGANIZATION", "action": "GET", "entity": "mun"}
- "tell me about the training cell program" -> {"intent": "PROGRAM", "action": "GET", "entity": "training cell"}
- "all upcoming conferences" -> {"intent": "CONFERENCE", "action": "LIST"}
- "where is the next event" -> {"intent": "CONFERENCE", "action": "GET", "field": "venue"}
- "give me full information on the ips conference" -> {"intent": "CONFERENCE", "action": "GET", "entity": "ips conference", "field": null}
- "I want to complain" -> {"intent": "CONTACT", "action": "GET"}

Output exactly this JSON format:
{
  "intent": "...",
  "action": "...",
  "entity": "...",      // (optional) specific conference/program name
  "field": "...",       // (optional) what the user wants (e.g. registrationFee, venue)
  "filters": {},        // (optional) key-value pairs of filters
  "confidence": 0.0     // number between 0.0 and 1.0
}

User Query: "${normalizedQuery}"
    `.trim();

    try {
      const provider = this.getProvider();
      const response = await provider.generateResponse(prompt);
      
      // Attempt to extract JSON from the response
      let jsonString = response;
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonString = jsonMatch[0];
      }
      
      const parsed = JSON.parse(jsonString);
      
      return {
        intent: parsed.intent as Intent || Intent.UNKNOWN,
        action: parsed.action as Action || Action.UNKNOWN,
        entity: parsed.entity,
        field: parsed.field,
        filters: parsed.filters,
        confidence: parsed.confidence || 0.5,
        rawQuery,
        normalizedQuery
      };
    } catch (e) {
      console.error("Understanding layer failed:", e);
      // Fallback
      return {
        intent: Intent.UNKNOWN,
        action: Action.UNKNOWN,
        confidence: 0.1,
        rawQuery,
        normalizedQuery
      };
    }
  }
}
