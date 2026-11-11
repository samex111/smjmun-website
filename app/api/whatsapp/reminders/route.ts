import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendWhatsAppTemplate } from "@/lib/whatsapp/client";
import { sendPaidRegistrationWhatsAppConfirmation } from "@/lib/whatsapp/notifications";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const recipients = (process.env.META_SECRETARIAT_NUMBERS || "")
    .split(",").map((item) => item.trim().replace(/\D/g, "")).filter(Boolean);
  const templateName = process.env.META_SUPPORT_ALERT_TEMPLATE;
  if (recipients.length < 2 || !templateName) {
    return NextResponse.json({ sent: 0, skipped: true, reason: "Secretariat recipients or approved support template are not configured." });
  }

  const cutoff = new Date(Date.now() - 5 * 60_000);
  const retryableNotifications = await db.whatsAppNotification.findMany({
    where: { status: { in: ["PENDING", "FAILED"] } },
    select: { registrationId: true },
    take: 50,
  });
  for (const notification of retryableNotifications) {
    try {
      await sendPaidRegistrationWhatsAppConfirmation(notification.registrationId);
    } catch (error) {
      console.error("[WhatsApp reminder] Payment confirmation retry failed:", error);
    }
  }

  const cases = await db.supportCase.findMany({
    where: {
      channel: "WHATSAPP",
      status: "NOTIFIED",
      humanRepliedAt: null,
      reminderSentAt: null,
      createdAt: { lte: cutoff },
      waId: { not: null },
    },
    orderBy: { createdAt: "asc" },
    take: 50,
  });

  let sent = 0;
  for (const supportCase of cases) {
    const detail = [
      "SMJMUN — Reminder: delegate still waiting for human support",
      `Case: ${supportCase.id}`,
      `Delegate: ${supportCase.requesterName || "Not verified"}`,
      `WhatsApp: ${supportCase.requesterPhone || supportCase.waId}`,
      `Email: ${supportCase.requesterEmail || "Not verified"}`,
      `Issue: ${supportCase.reason}`,
      `Requested action: ${supportCase.requestedAction}`,
      `Summary: ${supportCase.summary}`,
      "Please open the delegate's existing conversation in the WhatsApp Business App and reply there.",
    ].join("\n").slice(0, 950);

    const outcomes = await Promise.allSettled(recipients.map((to) =>
      sendWhatsAppTemplate(to, templateName, process.env.META_SUPPORT_ALERT_LANGUAGE || "en", [detail])
    ));
    const successful = outcomes.filter((outcome) => outcome.status === "fulfilled").length;
    if (successful === recipients.length) {
      await db.supportCase.update({
        where: { id: supportCase.id },
        data: { reminderSentAt: new Date() },
      });
      sent += 1;
    }
  }

  return NextResponse.json({ scanned: cases.length, remindersSent: sent, paymentConfirmationRetries: retryableNotifications.length });
}
