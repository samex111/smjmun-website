import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/security/rate-limit";
import { generateOtp } from "@/lib/otp/generate-otp";
import { hashOtp } from "@/lib/otp/hash-otp";
import { sendOtpEmail } from "@/lib/email/send-otp-email";

const schema = z.object({
  registrationId: z.string().min(8).max(100),
  email: z.string().trim().email().max(255),
  whatsappConsent: z.literal(true),
});

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ success: false, message: "Invalid request body." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ success: false, message: "Enter a valid registration, email and WhatsApp consent." }, { status: 400 });

  const email = parsed.data.email.toLowerCase();
  const limited = await rateLimit(`whatsapp-link:${email}`);
  if (!limited.success) return NextResponse.json({ success: false, message: "Too many attempts. Try again later." }, { status: 429 });

  const registration = await db.registration.findFirst({
    where: { id: parsed.data.registrationId, email },
    select: { id: true, firstName: true, email: true },
  });
  // Avoid revealing whether the supplied registration/email combination exists.
  if (!registration) return NextResponse.json({
    success: true,
    message: "If the details match a registration, a verification code will be sent to its email.",
  });

  const { otp, expiresAt } = generateOtp();
  await db.whatsAppLinkChallenge.create({
    data: {
      registrationId: registration.id,
      email,
      otpHash: hashOtp(otp),
      consentRequested: true,
      expiresAt,
    },
  });
  const result = await sendOtpEmail({ to: email, firstName: registration.firstName, otp });
  if (!result.success) return NextResponse.json({
    success: false,
    message: "Could not deliver the verification email. Please contact the Secretariat.",
  }, { status: 503 });
  return NextResponse.json({ success: true, message: "A verification code has been sent to the registration email." });
}
