import { z } from "zod";

const emptyToUndefined = (val: unknown) =>
  val === "" || val === null || val === undefined ? undefined : val;

function isValidIndianPhone(phone: string): boolean {
  const normalized = phone.replace(/[\s-]/g, "");
  return /^(\+91|91)?[6-9]\d{9}$/.test(normalized);
}

export const registrationSchema = z.object({
  firstName: z
    .string()
    .trim()
    .min(1, "First name is required")
    .max(100, "First name must be 100 characters or fewer"),
  lastName: z
    .string()
    .trim()
    .min(1, "Last name is required")
    .max(100, "Last name must be 100 characters or fewer"),
  email: z
    .string()
    .trim()
    .email("Please enter a valid email address")
    .max(255, "Email must be 255 characters or fewer"),
  whatsappUpdatesConsent: z.boolean().optional().default(false),
  phone: z
    .string()
    .trim()
    .min(1, "Phone number is required")
    .refine(isValidIndianPhone, {
      message: "Please enter a valid Indian mobile number",
    }),
  institution: z
    .string()
    .trim()
    .min(1, "Institution is required")
    .max(200, "Institution must be 200 characters or fewer"),
  conferenceSlug: z
    .string()
    .trim()
    .min(1, "Conference is required"),
  city: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .trim()
      .max(100, "City must be 100 characters or fewer")
      .optional()
  ),
  committeePreference: z.preprocess(emptyToUndefined, z.string().optional()),
  dietaryRequirements: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .trim()
      .max(500, "Dietary requirements must be 500 characters or fewer")
      .optional()
  ),
});

export type RegistrationInput = z.infer<typeof registrationSchema>;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
