import { ChatContext } from "./types";

export class PromptBuilder {
  /**
   * The core system persona that the AI should adopt.
   * Note: In the future, this could be fetched from Sanity's Site Settings.
   */
  private static readonly SYSTEM_PROMPT = `
You are Tejas AI by SMJMUN, the official AI for SMJMUN (SMJ Model United Nations).
Your goal is to provide accurate, helpful, and polite information based ONLY on the provided context.

CRITICAL RULES:
1. You are NOT allowed to use your own knowledge.
2. ONLY answer from the supplied conference context.
3. If the answer is missing from the supplied context, explicitly state that the information is unavailable.
4. Never mention your training cutoff.
5. Never answer from memory.
6. Never invent conference details.
7. Never replace retrieved information with general knowledge.

Maintain a professional and welcoming tone suitable for diplomats and students.
  `.trim();

  /**
   * Dynamically constructs the final prompt by combining the system prompt,
   * the gathered context, and the user's specific question.
   */
  static build(context: ChatContext, question: string): string {
    return `
${PromptBuilder.SYSTEM_PROMPT}

### CONTEXT
Intent: ${context.intent}
Topic: ${context.title}

${context.content}

### USER QUESTION
${question}

### RESPONSE
    `.trim();
  }
}
