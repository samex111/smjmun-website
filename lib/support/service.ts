import { db } from "@/lib/db";
import { sendWhatsAppTemplate } from "@/lib/whatsapp/client";
import type { Actor } from "@/lib/whatsapp/types";

type EscalationInput = {
  actor: Actor;
  reason: string;
  requestedAction: string;
  summary: string;
  urgency: "normal" | "high" | "critical";
};

function buildStaffSummary(input: EscalationInput, registration: {
  id: string; firstName: string; lastName: string; email: string;
  conferenceTitle: string; conferenceFee: number; currency: string;
  paymentId: string | null; status: string;
} | null, caseId: string) {
  return [
    "SMJMUN — Human assistance requested",
    `Case: ${caseId}`,
    `Channel: ${input.actor.channel}`,
    `Delegate: ${registration ? `${registration.firstName} ${registration.lastName}` : "Not verified"}`,
    `WhatsApp: ${input.actor.phone || "Not available"}`,
    `Email: ${registration?.email || "Not verified"}`,
    `Conference: ${registration?.conferenceTitle || "Not linked"}`,
    `Registration: ${registration?.id || "Not linked"}`,
    `Payment: ${registration ? `${registration.currency} ${registration.conferenceFee} · ${registration.status} · ${registration.paymentId || "transaction reference unavailable"}` : "Not verified"}`,
    `Issue: ${input.reason}`,
    `Requested action: ${input.requestedAction}`,
    `Conversation summary: ${input.summary}`,
    `Priority: ${input.urgency.toUpperCase()}`,
    "Reply to the delegate in the WhatsApp Business App conversation. Coexistence must be enabled so your reply is synced back to Tejas.",
  ].join("\n").slice(0, 950);
}

export async function createSupportCase(input: EscalationInput) {
  const isWhatsApp = input.actor.channel === "whatsapp";
  const registration = input.actor.verifiedRegistrationId
    ? await db.registration.findUnique({
        where: { id: input.actor.verifiedRegistrationId },
        select: {
          id: true, firstName: true, lastName: true, email: true,
          conferenceTitle: true, conferenceFee: true, currency: true,
          paymentId: true, status: true,
        },
      })
    : null;

  const supportCase = await db.supportCase.create({
    data: {
      channel: isWhatsApp ? "WHATSAPP" : "WEBSITE",
      sessionId: isWhatsApp ? input.actor.sessionId : null,
      waId: input.actor.phone || null,
      registrationId: registration?.id || null,
      requesterName: registration ? `${registration.firstName} ${registration.lastName}` : null,
      requesterEmail: registration?.email || null,
      requesterPhone: input.actor.phone || null,
      reason: input.reason,
      requestedAction: input.requestedAction,
      summary: input.summary,
      urgency: input.urgency === "critical" ? "CRITICAL" : input.urgency === "high" ? "HIGH" : "NORMAL",
      status: "OPEN",
    },
  });

  if (!isWhatsApp || !input.actor.phone) {
    return {
      caseId: supportCase.id,
      status: "OPEN",
      handoff: false,
      notificationStatus: "not_applicable",
      message: "This visitor is using website chat. Do not claim that a live human has joined the website widget; provide the Secretariat's published contact details.",
    };
  }

  const recipients = (process.env.META_SECRETARIAT_NUMBERS || "")
    .split(",").map((item) => item.trim().replace(/\D/g, "")).filter(Boolean);
  const templateName = process.env.META_SUPPORT_ALERT_TEMPLATE;
  if (recipients.length < 2 || !templateName) {
    return {
      caseId: supportCase.id,
      status: "OPEN",
      handoff: false,
      notificationStatus: "not_configured",
      message: "The support case is saved, but Secretariat WhatsApp recipients or the approved alert template are not configured. Do not pause the assistant or promise a human reply yet.",
    };
  }

  const detail = buildStaffSummary(input, registration, supportCase.id);
  const results = await Promise.allSettled(recipients.map((to) =>
    sendWhatsAppTemplate(to, templateName, process.env.META_SUPPORT_ALERT_LANGUAGE || "en", [detail])
  ));
  const notified = results.filter((result) => result.status === "fulfilled").length;
  if (notified > 0) {
    await db.$transaction([
      db.whatsAppConversation.update({
        where: { id: input.actor.sessionId },
        data: { activeHumanHandoff: true, lastMessageAt: new Date() },
      }),
      db.supportCase.update({
        where: { id: supportCase.id },
        data: { status: "NOTIFIED" },
      }),
    ]);
  }

  return {
    caseId: supportCase.id,
    status: notified === recipients.length ? "NOTIFIED" : "OPEN",
    handoff: notified > 0,
    notified,
    recipients: recipients.length,
    notificationStatus: notified === recipients.length ? "sent" : notified > 0 ? "partial" : "failed",
    message: notified > 0
      ? "The Secretariat has been notified. A human team member will reply here in this same WhatsApp conversation."
      : "The support case is saved, but the Secretariat notification failed. Keep Tejas active and provide the official contact details instead of promising a handoff.",
  };
}
