import { z } from "zod";
import { GoogleGenAI, type Content, type FunctionDeclaration, type Part } from "@google/genai";
import { Groq } from "groq-sdk";
import OpenAI from "openai";
import { SiteSettingsService } from "@/lib/sanity/siteSettings/service";
import { ConferenceService } from "@/lib/sanity/conference/service";
import { BlogService } from "@/lib/sanity/blog/service";
import { FAQService } from "@/lib/sanity/faq/service";
import { getAllPrograms } from "@/data/programs";
import { db } from "@/lib/db";
import { CONVERSATION_STYLE_GUIDE } from "@/lib/chatbot/v2/prompts/system";
import { createSupportCase } from "@/lib/support/service";
import { verifyPayment } from "@/lib/payment/verify-payment";
import { PaymentError } from "@/lib/payment/errors";
import type { Actor } from "@/lib/whatsapp/types";

type ToolResult = { ok: boolean; data?: unknown; error?: string };
type ChatMessage = { role: "user" | "assistant"; content: string };

const searchSchema = z.object({ query: z.string().trim().min(2).max(500) });
const paymentSchema = z.object({ registrationId: z.string().trim().optional() });
const escalationSchema = z.object({
  reason: z.string().trim().min(3).max(180),
  requestedAction: z.string().trim().min(3).max(500),
  summary: z.string().trim().min(10).max(2000),
  urgency: z.enum(["normal", "high", "critical"]).default("normal"),
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function portableTextToString(value: unknown): string {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return value.map((block) => {
    const children = isRecord(block) && Array.isArray(block.children) ? block.children : [];
    return children.map((child) => {
      if (!isRecord(child)) return "";
      return typeof child.text === "string" ? child.text : "";
    }).join("");
  }).filter(Boolean).join("\n");
}

function flatten(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(flatten).filter(Boolean).join("\n");
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !["gallery", "heroImage", "image", "coverImage", "videoSrc", "imageSrc", "testimonials", "stats"].includes(key))
      .map(([key, entry]) => {
        const text = flatten(entry);
        return text ? `${key}: ${text}` : "";
      }).filter(Boolean).join("\n");
  }
  return "";
}

function scoreDocument(queryTerms: string[], title: string, text: string) {
  const titleLower = title.toLowerCase();
  const bodyLower = `${title} ${text}`.toLowerCase();
  return queryTerms.reduce((score, term) => score + (titleLower.includes(term) ? 4 : bodyLower.includes(term) ? 1 : 0), 0);
}

type PublicDocument = { type: string; title: string; text: string; url?: string; slug?: string };

async function searchPublicKnowledge(query: string) {
  const [settings, conferences, blogs, faqs] = await Promise.all([
    SiteSettingsService.getSiteSettings(),
    ConferenceService.getConferencesForSearch(),
    BlogService.getBlogPosts(),
    FAQService.getFAQs(),
  ]);
  const documents: PublicDocument[] = [];

  if (settings) {
    documents.push({
      type: "organization",
      title: settings.organizationName || settings.fullName || "SMJMUN",
      text: flatten({
        ...settings,
        whyJoinSMJMUN: portableTextToString(settings.whyJoinSMJMUN),
      }),
    });
  }

  for (const program of getAllPrograms()) {
    documents.push({
      type: "program",
      title: program.meta.title,
      text: flatten({
        meta: program.meta, hero: program.hero, intro: program.intro,
        sections: program.sections, timeline: program.timeline, benefits: program.benefits,
        faq: program.faq, cta: program.cta,
      }),
      url: `/programs/${program.slug}`,
    });
  }

  for (const conference of conferences) {
    documents.push({
      type: "conference",
      title: conference.title,
      text: flatten({
        ...conference,
        overview: portableTextToString(conference.overview),
        agenda: portableTextToString(conference.agenda),
        eligibilityRichText: portableTextToString(conference.eligibilityRichText),
      }),
      url: `/conferences/${conference.slug?.current || ""}`,
    });
  }

  for (const faq of faqs) {
    documents.push({ type: "faq", title: faq.question, text: portableTextToString(faq.answer) });
  }

  const terms = query.toLowerCase().split(/[^a-z0-9]+/).filter((term) => term.length > 2);
  const blogCandidates: PublicDocument[] = blogs.map((blog) => ({
    type: "blog",
    title: blog.title,
    text: [blog.excerpt, ...(blog.tags || [])].filter(Boolean).join("\n"),
    slug: blog.slug.current,
    url: `/blogs/${blog.slug.current}`,
  }));

  const ranked = [...documents, ...blogCandidates]
    .map((document) => ({
      ...document,
      score: scoreDocument(terms, document.title, document.text),
    }))
    .filter((document) => document.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  // Fetch full published blog bodies only for the best matching articles.
  const results = await Promise.all(ranked.map(async (document) => {
    if (document.type !== "blog" || !document.slug) {
      return { type: document.type, title: document.title, content: document.text.slice(0, 6500), url: document.url };
    }
    const article = await BlogService.getBlogPostBySlug(document.slug);
    return {
      type: "blog",
      title: document.title,
      content: [article?.excerpt, portableTextToString(article?.body), ...(article?.tags || [])].filter(Boolean).join("\n").slice(0, 6500),
      url: document.url,
    };
  }));
  return results;
}

async function getPaymentDetails(actor: Actor, registrationId?: string): Promise<ToolResult> {
  if (actor.channel !== "whatsapp" || !actor.phone) {
    return { ok: false, error: "Private registration information is available only after securely linking the delegate's WhatsApp number to a registration." };
  }
  const links = await db.whatsAppRegistrationLink.findMany({
    where: {
      waId: actor.phone,
      isVerified: true,
      ...(registrationId ? { registrationId } : {}),
    },
    select: { registrationId: true },
    orderBy: { createdAt: "desc" },
  });
  if (!links.length) {
    return { ok: false, error: "No verified registration is linked to this WhatsApp number. Ask the delegate to complete the email-verified WhatsApp linking flow." };
  }
  let registrations = await db.registration.findMany({
    where: { id: { in: links.map((link) => link.registrationId) } },
    orderBy: { createdAt: "desc" },
  });

  // The tool may refresh a pending order through the existing deterministic HDFC verifier.
  // The model never calls HDFC and never changes payment status itself.
  const verificationNotes = new Map<string, string>();
  for (const registration of registrations) {
    if (registration.status !== "PENDING_PAYMENT" || !registration.hdfcOrderId) continue;
    try {
      const verification = await verifyPayment(registration.id);
      verificationNotes.set(
        registration.id,
        verification.outcome === "paid"
          ? "HDFC verified this payment as CHARGED."
          : verification.outcome === "pending"
            ? `HDFC currently reports ${verification.hdfcStatus}; payment is not confirmed yet.`
            : `HDFC reports ${verification.hdfcStatus}; payment is not confirmed as paid.`,
      );
    } catch (error) {
      if (error instanceof PaymentError && error.code === "ALREADY_PAID") continue;
      verificationNotes.set(
        registration.id,
        error instanceof PaymentError
          ? `Live HDFC verification could not be completed (${error.code}). Do not describe this payment as confirmed.`
          : "Live HDFC verification could not be completed. Do not describe this payment as confirmed.",
      );
      console.error("[Tejas payment tool] HDFC status refresh did not complete:", error);
    }
  }

  registrations = await db.registration.findMany({
    where: { id: { in: links.map((link) => link.registrationId) } },
    orderBy: { createdAt: "desc" },
  });
  return {
    ok: true,
    data: {
      registrations: registrations.map((registration) => ({
        registrationId: registration.id,
        name: `${registration.firstName} ${registration.lastName}`,
        email: registration.email,
        conference: registration.conferenceTitle,
        conferenceDate: registration.conferenceDate,
        registrationStatus: registration.status,
        paymentStatus: registration.status === "PAID" ? "PAID" : registration.status,
        amount: registration.conferenceFee,
        currency: registration.currency,
        transactionId: registration.paymentId,
        paidAt: registration.paidAt,
        hdfcOrderId: registration.hdfcOrderId,
        verificationNote: verificationNotes.get(registration.id)
          || (registration.status === "PAID" ? "Stored PAID status was written only by the deterministic HDFC verification flow." : "This is the latest recorded registration status; no successful HDFC charge confirmation is recorded."),
      })),
    },
  };
}

async function runTool(name: string, rawArgs: unknown, actor: Actor): Promise<ToolResult> {
  if (name === "search_smjmun_knowledge") {
    const args = searchSchema.parse(rawArgs);
    const results = await searchPublicKnowledge(args.query);
    return { ok: true, data: results };
  }
  if (name === "get_payment_details") {
    const args = paymentSchema.parse(rawArgs);
    return getPaymentDetails(actor, args.registrationId);
  }
  if (name === "escalate_to_human") {
    const args = escalationSchema.parse(rawArgs);
    const result = await createSupportCase({
      actor,
      reason: args.reason,
      requestedAction: args.requestedAction,
      summary: args.summary,
      urgency: args.urgency,
    });
    return { ok: true, data: result };
  }
  return { ok: false, error: "Unknown tool." };
}

const toolDefinitions = [
  {
    type: "function",
    function: {
      name: "search_smjmun_knowledge",
      description: "Search current, public SMJMUN organization details, founder, mission, vision, programs, public conference information, published FAQs, policies and educational blogs. Use this for factual questions before answering.",
      parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"], additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "get_payment_details",
      description: "Get all registrations and payment details linked to the verified WhatsApp sender, optionally filtered by registration ID. For pending HDFC orders, the server calls the existing deterministic HDFC verification service before returning the fresh status. Never approve or execute a refund or registration change.",
      parameters: { type: "object", properties: { registrationId: { type: "string" } }, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "escalate_to_human",
      description: "Hand a WhatsApp conversation to the SMJMUN Secretariat when a human is explicitly requested or a refund, transfer, complaint, payment dispute, exception or other staff-only action is needed. Do not approve or execute refunds.",
      parameters: {
        type: "object",
        properties: {
          reason: { type: "string" },
          requestedAction: { type: "string" },
          summary: { type: "string" },
          urgency: { type: "string", enum: ["normal", "high", "critical"] },
        },
        required: ["reason", "requestedAction", "summary"],
        additionalProperties: false,
      },
    },
  },
] as const;

type CompatibleToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};
type AgentMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: CompatibleToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };
type GeminiFunctionCall = NonNullable<Part["functionCall"]>;
type GeminiPart = Part;
type GeminiTurn = { provider: "gemini"; parts: GeminiPart[]; text: string };
type CompatibleAssistantMessage = {
  role: "assistant";
  content: string | null;
  tool_calls?: CompatibleToolCall[];
};
type CompatibleTurn = {
  provider: "groq" | "nvidia";
  message?: CompatibleAssistantMessage;
};
type AgentTurn = GeminiTurn | CompatibleTurn;

const geminiFunctionDeclarations: FunctionDeclaration[] = toolDefinitions.map((tool) => ({
  name: tool.function.name,
  description: tool.function.description,
  parametersJsonSchema: tool.function.parameters,
}));

const systemPrompt = (actor: Actor) => `${CONVERSATION_STYLE_GUIDE}

You are Tejas AI, one tool-calling assistant used by the SMJMUN website and WhatsApp.
Use search_smjmun_knowledge before factual SMJMUN answers. Treat published blogs as learning resources, never as authoritative policy.
Never invent a privacy, refund or cancellation policy. When authoritative policy content is not found, say the Secretariat must confirm it.
Use get_payment_details only for a WhatsApp sender whose phone number is already email-OTP verified and linked to a registration. Never expose private payment information to an anonymous website visitor.
HDFC payment verification is deterministic application code. This tool only reads recorded registration/payment facts. Never say a payment is confirmed unless the stored status is PAID. Never issue refunds, change registrations, transfer seats or modify payment state.
For refund requests, payment disputes, transfers, exceptions, serious complaints or an explicit request for a human, call escalate_to_human. The Secretariat must approve and operate such actions.
Only say a human was notified and will reply in this same WhatsApp chat when the escalation tool result has handoff=true and notificationStatus is sent or partial. If handoff=false, explain honestly that the case was recorded but a human notification could not be completed; keep Tejas active and use the public knowledge tool to give official contact details. Never promise an exact response time. AI must remain silent while human handoff is active, until the delegate asks to resume Tejas.
For anonymous website visitors who need a human, provide the published contact/WhatsApp details instead of claiming a live website-chat takeover.
Channel: ${actor.channel}. WhatsApp identity verified: ${Boolean(actor.verifiedRegistrationId)}.`;

function parseJsonObject(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? parsed : { value: parsed };
  } catch {
    return { value: raw };
  }
}

async function callGemini(messages: AgentMessage[]): Promise<GeminiTurn> {
  const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  const system = messages.find((message) => message.role === "system")?.content;
  const functionNames = new Map<string, string>();

  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const call of message.tool_calls || []) {
      functionNames.set(call.id, call.function.name);
    }
  }

  const contents: Content[] = messages.flatMap((message): Content[] => {
    if (message.role === "system") return [];

    if (message.role === "user") {
      return [{ role: "user", parts: [{ text: message.content }] }];
    }

    if (message.role === "assistant") {
      const parts: Part[] = [];
      if (message.content) parts.push({ text: message.content });
      for (const call of message.tool_calls || []) {
        parts.push({
          functionCall: {
            name: call.function.name,
            args: parseJsonObject(call.function.arguments),
            id: call.id,
          },
        });
      }
      return parts.length ? [{ role: "model", parts }] : [];
    }

    const name = functionNames.get(message.tool_call_id);
    if (!name) return [];
    return [{
      role: "user",
      parts: [{
        functionResponse: {
          name,
          id: message.tool_call_id,
          response: parseJsonObject(message.content),
        },
      }],
    }];
  });

  const response = await client.models.generateContent({
    model: process.env.TEJAS_GEMINI_MODEL || "gemini-2.5-flash",
    contents,
    config: {
      systemInstruction: system,
      tools: [{ functionDeclarations: geminiFunctionDeclarations }],
      temperature: 0.25,
    },
  });

  const parts = response.candidates?.[0]?.content?.parts || [];
  return { provider: "gemini", parts, text: response.text || "" };
}

async function callOpenAICompatible(
  messages: AgentMessage[],
  provider: "groq" | "nvidia",
): Promise<CompatibleTurn> {
  if (provider === "groq") {
    const client = new Groq({ apiKey: process.env.GROQ_API_KEY! });
    const completion = await client.chat.completions.create({
      model: process.env.TEJAS_GROQ_MODEL || "llama-3.3-70b-versatile",
      messages,
      tools: toolDefinitions as unknown as NonNullable<Parameters<typeof client.chat.completions.create>[0]["tools"]>,
      tool_choice: "auto",
      temperature: 0.25,
    });
    const message = completion.choices[0]?.message;
    return {
      provider: "groq",
      message: message
        ? {
            role: "assistant",
            content: message.content,
            tool_calls: message.tool_calls?.map((call) => ({
              id: call.id,
              type: "function",
              function: { name: call.function.name, arguments: call.function.arguments },
            })),
          }
        : undefined,
    };
  }

  const client = new OpenAI({
    apiKey: process.env.NVIDIA_API_KEY!,
    baseURL: "https://integrate.api.nvidia.com/v1",
  });
  const completion = await client.chat.completions.create({
    model: process.env.TEJAS_NVIDIA_MODEL || "openai/gpt-oss-20b",
    messages,
    tools: toolDefinitions as unknown as NonNullable<Parameters<typeof client.chat.completions.create>[0]["tools"]>,
    tool_choice: "auto",
    temperature: 0.25,
    max_tokens: 1400,
  });
  const message = completion.choices[0]?.message;
  return {
    provider: "nvidia",
    message: message
      ? {
          role: "assistant",
          content: message.content,
          tool_calls: message.tool_calls
            ?.filter((call) => call.type === "function")
            .map((call) => ({
              id: call.id,
              type: "function",
              function: { name: call.function.name, arguments: call.function.arguments },
            })),
        }
      : undefined,
  };
}

export class TejasAssistantService {
  static async reply(input: { message: string; actor: Actor; history?: ChatMessage[] }) {
    const messages: AgentMessage[] = [
      { role: "system", content: systemPrompt(input.actor) },
      ...(input.history || []).slice(-12).map((item) => ({ role: item.role, content: item.content })),
      { role: "user", content: input.message },
    ];

    for (let turn = 0; turn < 4; turn += 1) {
      let response: AgentTurn;
      if (process.env.GEMINI_API_KEY) response = await callGemini(messages);
      else if (process.env.GROQ_API_KEY) response = await callOpenAICompatible(messages, "groq");
      else if (process.env.NVIDIA_API_KEY) response = await callOpenAICompatible(messages, "nvidia");
      else throw new Error("Configure GEMINI_API_KEY, GROQ_API_KEY or NVIDIA_API_KEY for Tejas AI.");

      if (response.provider === "gemini") {
        const calls = response.parts
          .map((part) => part.functionCall)
          .filter((call): call is GeminiFunctionCall & { name: string } => Boolean(call?.name));
        if (!calls.length) {
          const answer = response.text || response.parts.map((part) => part.text || "").join("");
          return { text: answer || "I couldn't prepare a response just now." };
        }

        const normalizedCalls = calls.map((call, index) => ({
          call,
          id: call.id || `gemini_call_${turn}_${index}`,
        }));
        messages.push({
          role: "assistant",
          content: response.text || null,
          tool_calls: normalizedCalls.map(({ call, id }) => ({
            id,
            type: "function",
            function: { name: call.name, arguments: JSON.stringify(call.args || {}) },
          })),
        });

        for (const { call, id } of normalizedCalls) {
          let result: ToolResult;
          try { result = await runTool(call.name, call.args || {}, input.actor); }
          catch (error) { result = { ok: false, error: error instanceof Error ? error.message : "Tool execution failed." }; }
          messages.push({ role: "tool", tool_call_id: id, content: JSON.stringify(result) });
        }
      } else {
        const assistant = response.message;
        const calls = assistant?.tool_calls || [];
        if (!assistant || !calls.length) {
          return { text: assistant?.content || "I couldn't prepare a response just now." };
        }
        messages.push({
          role: "assistant",
          content: assistant.content,
          tool_calls: calls,
        });
        for (const call of calls) {
          let result: ToolResult;
          try { result = await runTool(call.function.name, JSON.parse(call.function.arguments || "{}"), input.actor); }
          catch (error) { result = { ok: false, error: error instanceof Error ? error.message : "Tool execution failed." }; }
          messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
        }
      }
    }
    return { text: "I couldn't complete that request just now. Please try again or ask for the Secretariat." };
  }
}
