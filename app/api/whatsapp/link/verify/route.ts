import { NextResponse } from "next/server";
import { randomBytes, createHash } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { verifyOtp } from "@/lib/otp/hash-otp";
import { rateLimit } from "@/lib/security/rate-limit";

const schema = z.object({
  registrationId: z.string().min(8).max(100),
  email: z.string().trim().email().max(255),
  otp: z.string().regex(/^\d{6}$/),
});

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ success: false, message: "Invalid request body." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ success: false, message: "Enter the six-digit code sent to your registration email." }, { status: 400 });

  const email = parsed.data.email.toLowerCase();
  const limited = await rateLimit(`whatsapp-link-verify:${email}`);
  if (!limited.success) return NextResponse.json({ success: false, message: "Too many attempts. Try again later." }, { status: 429 });

  const challenge = await db.whatsAppLinkChallenge.findFirst({
    where: { registrationId: parsed.data.registrationId, email, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!challenge || challenge.attempts >= 5 || !verifyOtp(parsed.data.otp, challenge.otpHash)) {
    if (challenge) await db.whatsAppLinkChallenge.update({
      where: { id: challenge.id },
      data: { attempts: { increment: 1 } },
    });
    return NextResponse.json({ success: false, message: "The code is invalid or expired. Request a new code if needed." }, { status: 401 });
  }

  const registration = await db.registration.findFirst({
    where: { id: challenge.registrationId, email },
    select: { id: true },
  });
  if (!registration) return NextResponse.json({ success: false, message: "Registration not found." }, { status: 404 });

  const rawToken = randomBytes(24).toString("base64url");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  await db.$transaction(async (tx) => {
    await tx.whatsAppLinkToken.create({
      data: { tokenHash, registrationId: registration.id, expiresAt: new Date(Date.now() + 10 * 60_000) },
    });
    await tx.registration.update({
      where: { id: registration.id },
      data: { whatsappUpdatesConsent: true, whatsappConsentAt: new Date() },
    });
    await tx.whatsAppLinkChallenge.delete({ where: { id: challenge.id } });
  });

  const businessNumber = (process.env.META_WHATSAPP_DISPLAY_NUMBER || "").replace(/\D/g, "");
  if (!businessNumber) return NextResponse.json({ success: false, message: "The Secretariat WhatsApp number is not configured yet." }, { status: 503 });
  const link = `https://wa.me/${businessNumber}?text=${encodeURIComponent(`LINK_${rawToken}`)}`;
  return NextResponse.json({
    success: true,
    link,
    expiresInMinutes: 10,
    message: "Your email is verified. Open WhatsApp and send the pre-filled linking message from the number you want to connect.",
  });
}
