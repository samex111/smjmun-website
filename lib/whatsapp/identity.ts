import { db } from "@/lib/db";
import type { Actor } from "@/lib/whatsapp/types";

export async function getWhatsAppActor(waId: string, conversationId: string): Promise<Actor> {
  const link = await db.whatsAppRegistrationLink.findFirst({
    where: { waId, isVerified: true },
    orderBy: { createdAt: "desc" },
    select: { registrationId: true },
  });
  return {
    channel: "whatsapp",
    sessionId: conversationId,
    phone: waId,
    verifiedRegistrationId: link?.registrationId,
  };
}
