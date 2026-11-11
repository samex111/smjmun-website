import { db } from "@/lib/db";
import { ConferenceService } from "@/lib/sanity/conference/service";
import { SiteSettingsService } from "@/lib/sanity/siteSettings/service";
import { sendWhatsAppTemplate } from "@/lib/whatsapp/client";

export async function sendPaidRegistrationWhatsAppConfirmation(registrationId: string) {
  const registration = await db.registration.findUnique({ where: { id: registrationId } });
  if (!registration || registration.status !== "PAID" || !registration.whatsappUpdatesConsent) return;
  const links = await db.whatsAppRegistrationLink.findMany({
    where: { registrationId, isVerified: true },
    select: { waId: true },
  });
  if (!links.length) return;

  const templateName = process.env.META_PAYMENT_CONFIRMATION_TEMPLATE;
  if (!templateName) {
    console.warn("[WhatsApp] Payment template is not configured; skipping confirmation.");
    return;
  }
  const existing = await db.whatsAppNotification.findUnique({
    where: { registrationId_type: { registrationId, type: "PAYMENT_CONFIRMATION" } },
  });
  if (existing?.status === "SENT") return;

  const conference = await ConferenceService.getConferenceById(registration.conferenceId);
  const siteSettings = await SiteSettingsService.getSiteSettings();
  const contactEmail = conference?.contact?.email || siteSettings?.contact?.email || "See the official SMJMUN contact page";
  const contactPhone = conference?.contact?.phone || siteSettings?.contact?.phone;
  const resources = Array.isArray(conference?.resources)
    ? conference.resources.slice(0, 2).map((resource: any) => {
        const title = resource.title || resource.name || "Conference resource";
        const url = resource.url || resource.href || resource.file?.asset?.url;
        return url ? `${title}: ${url}` : title;
      }).join(" · ")
    : "";
  const detail = [
    "SMJMUN — payment confirmed",
    `Delegate: ${registration.firstName} ${registration.lastName}`,
    `Registration: ${registration.id}`,
    `Conference: ${registration.conferenceTitle}`,
    `Amount paid: ${registration.currency} ${registration.conferenceFee}`,
    `HDFC transaction: ${registration.paymentId || "Not supplied by gateway"}`,
    `Paid at: ${registration.paidAt?.toISOString() || "Not available"}`,
    `Date: ${conference?.date || registration.conferenceDate?.toISOString() || "To be announced"}`,
    `Venue: ${conference?.venue || "To be announced"}`,
    `Reporting: ${conference?.reportingTime || "See conference brief"} · Dress: ${conference?.dressCode || "See conference brief"}`,
    `Food: ${conference?.foodProvided ? "Provided" : "Not listed"} · Stay: ${conference?.accommodationAvailable ? "Available" : "Not listed"}`,
    `Transport: ${conference?.transportAvailable ? "Available" : "Not listed"} · Parking: ${conference?.parkingAvailable ? "Available" : "Not listed"}`,
    `Delegate kit: ${conference?.delegateKitIncluded ? "Included" : "See conference brief"} · Certificate: ${conference?.certificateProvided ? "Included" : "See conference brief"}`,
    resources ? `Resources: ${resources}` : "",
    `Secretariat: ${contactEmail}${contactPhone ? ` · ${contactPhone}` : ""}`,
    "Reply here to ask Tejas about your registration or conference.",
  ].filter(Boolean).join("\n").slice(0, 950);

  await db.whatsAppNotification.upsert({
    where: { registrationId_type: { registrationId, type: "PAYMENT_CONFIRMATION" } },
    create: { registrationId, type: "PAYMENT_CONFIRMATION", status: "PENDING" },
    update: { status: "PENDING", error: null },
  });

  const results = await Promise.allSettled(links.map(async ({ waId }) => {
    const sent = await sendWhatsAppTemplate(
      waId,
      templateName,
      process.env.META_PAYMENT_CONFIRMATION_LANGUAGE || "en",
      [detail],
    );
    return sent.messages?.[0]?.id || null;
  }));
  const successful = results.filter((result) => result.status === "fulfilled");
  const firstMessageId = successful.length
    ? (successful[0] as PromiseFulfilledResult<string | null>).value
    : null;

  await db.whatsAppNotification.update({
    where: { registrationId_type: { registrationId, type: "PAYMENT_CONFIRMATION" } },
    data: {
      status: successful.length === links.length ? "SENT" : "FAILED",
      messageId: firstMessageId,
      error: successful.length === links.length ? null : "One or more WhatsApp recipients could not be notified.",
    },
  });
}
