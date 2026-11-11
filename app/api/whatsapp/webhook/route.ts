import { createHmac, timingSafeEqual, createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { TejasAssistantService } from "@/lib/chatbot/tejas-assistant";
import { sendWhatsAppText } from "@/lib/whatsapp/client";
import { getWhatsAppActor } from "@/lib/whatsapp/identity";
import { extractWhatsAppText, isResumeRequest } from "@/lib/whatsapp/types";
import { rateLimit } from "@/lib/security/rate-limit";
import { sendPaidRegistrationWhatsAppConfirmation } from "@/lib/whatsapp/notifications";

export const runtime = "nodejs";
export const maxDuration = 60;

const webhookSchema = z.object({
  object: z.literal("whatsapp_business_account"),
  entry: z.array(z.unknown()),
});

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function recordArray(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function stringField(value: JsonRecord, key: string): string {
  const field = value[key];
  return typeof field === "string" ? field : "";
}

function signatureIsValid(rawBody: string, signature: string | null) {
  const secret = process.env.META_APP_SECRET;
  if (!secret || !signature?.startsWith("sha256=")) return false;
  const expected = Buffer.from(`sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`);
  const supplied = Buffer.from(signature);
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

async function storeMessage(input: {
  conversationId: string;
  waId: string;
  messageId: string;
  direction: "INBOUND" | "OUTBOUND";
  role: "USER" | "AI" | "HUMAN" | "SYSTEM";
  content: string;
  rawPayload?: unknown;
}) {
  return db.whatsAppMessage.createMany({
    data: [{
      conversationId: input.conversationId,
      waId: input.waId,
      waMessageId: input.messageId,
      direction: input.direction,
      role: input.role,
      content: input.content,
      rawPayload: input.rawPayload as Prisma.InputJsonValue | undefined,
    }],
    skipDuplicates: true,
  });
}

async function sendAndStore(conversationId: string, waId: string, content: string) {
  const response = await sendWhatsAppText(waId, content);
  await storeMessage({
    conversationId,
    waId,
    messageId: response.messages?.[0]?.id || `local-${randomUUID()}`,
    direction: "OUTBOUND",
    role: "AI",
    content,
  });
}

async function completeWhatsAppLink(waId: string, conversationId: string, rawToken: string) {
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const token = await db.whatsAppLinkToken.findUnique({ where: { tokenHash } });
  if (!token || token.usedAt || token.expiresAt < new Date()) {
    await sendAndStore(conversationId, waId, "That WhatsApp linking code has expired or was already used. Please request a new code from the website.");
    return;
  }

  const registration = await db.registration.findUnique({ where: { id: token.registrationId } });
  if (!registration || !registration.whatsappUpdatesConsent) {
    await sendAndStore(conversationId, waId, "WhatsApp linking is not enabled for this registration. Please complete the consent step on the website first.");
    return;
  }

  await db.$transaction(async (tx) => {
    const consumed = await tx.whatsAppLinkToken.updateMany({
      where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (consumed.count !== 1) throw new Error("WhatsApp link token was already consumed.");
    await tx.whatsAppIdentity.upsert({ where: { waId }, create: { waId }, update: {} });
    await tx.whatsAppRegistrationLink.upsert({
      where: { waId_registrationId: { waId, registrationId: registration.id } },
      create: { waId, registrationId: registration.id, isVerified: true },
      update: { isVerified: true },
    });
  });

  if (registration.status === "PAID") {
    try { await sendPaidRegistrationWhatsAppConfirmation(registration.id); }
    catch (error) { console.error("[WhatsApp] Failed to send delayed payment confirmation:", error); }
  }

  const summary = registration.status === "PAID"
    ? [
        "Your WhatsApp number is now linked to your SMJMUN registration.",
        `Delegate: ${registration.firstName} ${registration.lastName}`,
        `Conference: ${registration.conferenceTitle}`,
        `Registration status: ${registration.status}`,
        `Payment: ${registration.currency} ${registration.conferenceFee} · ${registration.status}`,
        `Transaction reference: ${registration.paymentId || "Not yet available"}`,
        `Paid at: ${registration.paidAt?.toISOString() || "Not available"}`,
        "Your payment confirmation has been sent in this chat. You can now ask Tejas about your registration and conference. For refunds or changes, ask for the Secretariat.",
      ].join("\n")
    : "Your WhatsApp number is securely linked. You can now ask Tejas about SMJMUN and your registration. Payment details will be available once HDFC confirms the payment.";
  await sendAndStore(conversationId, waId, summary);
}

async function handleInboundMessage(message: JsonRecord) {
  const waId = stringField(message, "from");
  const messageId = stringField(message, "id");
  const text = extractWhatsAppText(message);
  if (!waId || !messageId) return;

  const conversation = await db.whatsAppConversation.upsert({
    where: { waId },
    create: { waId, lastMessageAt: new Date() },
    update: { lastMessageAt: new Date() },
  });
  const saved = await storeMessage({
    conversationId: conversation.id,
    waId,
    messageId,
    direction: "INBOUND",
    role: "USER",
    content: text,
    rawPayload: message,
  });
  if (saved.count === 0) return;

  const limited = await rateLimit(`whatsapp:${waId}`);
  if (!limited.success) {
    await sendAndStore(conversation.id, waId, "You're sending messages too quickly. Please try again in a minute.");
    return;
  }

  if (/^(stop|unsubscribe|cancel|opt[ -]?out)$/i.test(text.trim())) {
    const links = await db.whatsAppRegistrationLink.findMany({
      where: { waId, isVerified: true },
      select: { registrationId: true },
    });
    if (links.length) {
      await db.registration.updateMany({
        where: { id: { in: links.map((link) => link.registrationId) } },
        data: { whatsappUpdatesConsent: false, whatsappOptedOutAt: new Date() },
      });
    }
    await sendAndStore(conversation.id, waId, "You have opted out of automatic SMJMUN WhatsApp updates. You can still message us when you need help. To opt in again, use the WhatsApp linking page on the SMJMUN website.");
    return;
  }

  const linkMatch = text.match(/^LINK[_ ]([A-Za-z0-9_-]{20,100})$/i);
  if (linkMatch) {
    await completeWhatsAppLink(waId, conversation.id, linkMatch[1]);
    return;
  }

  const current = await db.whatsAppConversation.findUnique({ where: { id: conversation.id } });
  if (current?.activeHumanHandoff && !isResumeRequest(text)) return;

  if (current?.activeHumanHandoff && isResumeRequest(text)) {
    await db.whatsAppConversation.update({
      where: { id: conversation.id },
      data: { activeHumanHandoff: false },
    });
    await db.supportCase.updateMany({
      where: { sessionId: conversation.id, status: { in: ["OPEN", "NOTIFIED"] } },
      data: { status: "RESOLVED" },
    });
  }

  const actor = await getWhatsAppActor(waId, conversation.id);
  const stored = await db.whatsAppMessage.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "desc" },
    take: 13,
  });
  const history = stored.reverse().slice(0, -1).map((item) => ({
    role: item.role === "USER" ? "user" as const : "assistant" as const,
    content: item.content,
  }));

  const response = await TejasAssistantService.reply({ message: text, actor, history });
  // escalate_to_human activates handoff before this acknowledgement is sent.
  await sendAndStore(conversation.id, waId, response.text);
}

async function handleHumanEcho(echo: JsonRecord) {
  const waId = stringField(echo, "to");
  const messageId = stringField(echo, "id");
  if (!waId || !messageId) return;

  const conversation = await db.whatsAppConversation.upsert({
    where: { waId },
    create: { waId, lastMessageAt: new Date() },
    update: { lastMessageAt: new Date() },
  });
  const saved = await storeMessage({
    conversationId: conversation.id,
    waId,
    messageId,
    direction: "OUTBOUND",
    role: "HUMAN",
    content: extractWhatsAppText(echo),
    rawPayload: echo,
  });
  if (saved.count > 0) {
    await db.supportCase.updateMany({
      where: { sessionId: conversation.id, status: { in: ["OPEN", "NOTIFIED"] } },
      data: { humanRepliedAt: new Date() },
    });
    await db.whatsAppConversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date() },
    });
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  if (mode === "subscribe" && token && token === process.env.META_WEBHOOK_VERIFY_TOKEN && challenge) {
    return new Response(challenge, { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!signatureIsValid(rawBody, request.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
  }

  let body: unknown;
  try { body = JSON.parse(rawBody); }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }

  const parsed = webhookSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ received: true });

  for (const entryValue of parsed.data.entry) {
    if (!isRecord(entryValue)) continue;
    for (const changeValue of recordArray(entryValue.changes)) {
      const field = stringField(changeValue, "field");
      const value = isRecord(changeValue.value) ? changeValue.value : {};
      if (field === "smb_message_echoes") {
        for (const echo of recordArray(value.message_echoes)) await handleHumanEcho(echo);
      }
      if (field === "messages") {
        for (const message of recordArray(value.messages)) await handleInboundMessage(message);
      }
    }
  }
  return NextResponse.json({ received: true });
}
