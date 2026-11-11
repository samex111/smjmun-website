import { RegistrationStatus, type Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { Registration, RegistrationDraft } from "@prisma/client";
import type { Conference } from "@/lib/sanity/conference/types";

type TransactionClient = Omit<
  Prisma.TransactionClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

export async function createRegistrationFromDraft(
  draft: RegistrationDraft,
  conference: Conference,
  client: TransactionClient = db
): Promise<Registration> {
  return client.registration.create({
    data: {
      email: draft.email,
      firstName: draft.firstName,
      lastName: draft.lastName,
      phone: draft.phone,
      institution: draft.institution,
      city: draft.city,
      committeePreference: draft.committeePreference,
      dietaryRequirements: draft.dietaryRequirements,
      whatsappUpdatesConsent: draft.whatsappUpdatesConsent,
      whatsappConsentAt: draft.whatsappUpdatesConsent ? new Date() : null,
      conferenceId: conference._id,
      conferenceTitle: conference.title,
      conferenceDate: conference.date ? new Date(conference.date) : null,
      conferenceFee: conference.registrationFee ?? 0,
      currency: "INR",
      status: RegistrationStatus.PENDING_PAYMENT,
    },
  });
}
