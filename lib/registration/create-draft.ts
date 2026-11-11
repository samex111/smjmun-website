import { db } from "@/lib/db";
import type { RegistrationDraft } from "@prisma/client";

export interface CreateDraftInput {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  institution: string;
  city?: string;
  committeePreference?: string;
  dietaryRequirements?: string;
  whatsappUpdatesConsent?: boolean;
  conferenceId: string;
}

export async function createOrReplaceDraft(
  input: CreateDraftInput
): Promise<RegistrationDraft> {
  await db.registrationDraft.deleteMany({
    where: {
      email: input.email,
      conferenceId: input.conferenceId,
    },
  });

  return db.registrationDraft.create({
    data: {
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
      institution: input.institution,
      city: input.city,
      committeePreference: input.committeePreference,
      dietaryRequirements: input.dietaryRequirements,
      whatsappUpdatesConsent: input.whatsappUpdatesConsent ?? false,
      conferenceId: input.conferenceId,
    },
  });
}
