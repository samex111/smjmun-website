import { NextResponse } from "next/server";
import { RegistrationStatus } from "@prisma/client";
import { ConferenceService } from "@/lib/sanity/conference/service";
import type { Conference } from "@/lib/sanity/conference/types";
import { db } from "@/lib/db";
import {
  normalizeEmail,
  registrationSchema,
} from "@/lib/validations/registration";
import { generateOtp } from "@/lib/otp/generate-otp";
import { hashOtp } from "@/lib/otp/hash-otp";
import { createOtpRecord } from "@/lib/otp/create-otp-record";
import { sendOtpEmail } from "@/lib/email/send-otp-email";
import { createOrReplaceDraft } from "@/lib/registration/create-draft";
import { rateLimit } from "@/lib/security/rate-limit";

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  const maskedLocal = local.length <= 1 ? `${local}****` : `${local[0]}****`;
  return `${maskedLocal}@${domain}`;
}

function isRegistrationOpen(conference: Conference): boolean {
  if (!conference.registrationOpen) return false;
  if (conference.status !== "upcoming" && conference.status !== "live") {
    return false;
  }
  if (
    conference.registrationCloseDate &&
    new Date(conference.registrationCloseDate) < new Date()
  ) {
    return false;
  }
  return true;
}

function isValidCommitteePreference(
  conference: Conference,
  preference?: string
): boolean {
  if (!preference) return true;
  if (!conference.committees?.length) return false;
  return conference.committees.some(
    (committee) => committee.name === preference
  );
}

async function isCapacityReached(conference: Conference): Promise<boolean> {
  if (conference.capacity == null) return false;

  const registrationCount = await db.registration.count({
    where: {
      conferenceId: conference._id,
      status: {
        in: [RegistrationStatus.PENDING_PAYMENT, RegistrationStatus.PAID],
      },
    },
  });

  return registrationCount >= conference.capacity;
}

export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, message: "Invalid request body" },
        { status: 400 }
      );
    }

    const parsed = registrationSchema.safeParse(body);
    if (!parsed.success) {
      const message =
        parsed.error.issues[0]?.message ?? "Validation failed";
      return NextResponse.json(
        { success: false, message },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const email = normalizeEmail(data.email);

    const rateLimitResult = await rateLimit(email);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { success: false, message: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    const conference = await ConferenceService.getConferenceBySlug(data.conferenceSlug);

    if (!conference) {
      return NextResponse.json(
        { success: false, message: "Conference not found." },
        { status: 404 }
      );
    }

    if (!isRegistrationOpen(conference)) {
      return NextResponse.json(
        { success: false, message: "Registration is closed for this conference." },
        { status: 403 }
      );
    }

    if (!isValidCommitteePreference(conference, data.committeePreference)) {
      return NextResponse.json(
        { success: false, message: "Invalid committee preference selected." },
        { status: 400 }
      );
    }

    if (await isCapacityReached(conference)) {
      return NextResponse.json(
        { success: false, message: "This conference has reached capacity." },
        { status: 403 }
      );
    }

    const existingRegistration = await db.registration.findUnique({
      where: {
        email_conferenceId: {
          email,
          conferenceId: conference._id,
        },
      },
    });

    if (existingRegistration) {
      return NextResponse.json(
        {
          success: false,
          message: "You have already registered for this conference.",
        },
        { status: 409 }
      );
    }

    const { otp, expiresAt } = generateOtp();
    const otpHash = hashOtp(otp);

    await createOrReplaceDraft({
      email,
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone,
      institution: data.institution,
      city: data.city,
      committeePreference: data.committeePreference,
      dietaryRequirements: data.dietaryRequirements,
      whatsappUpdatesConsent: data.whatsappUpdatesConsent,
      conferenceId: conference._id,
    });

    await createOtpRecord({
      email,
      otpHash,
      expiresAt,
    });

    const emailResult = await sendOtpEmail({
      to: email,
      firstName: data.firstName,
      otp,
    });

    return NextResponse.json({
      success: true,
      message: "OTP generated successfully",
      email: maskEmail(email),
      warning: emailResult.success ? undefined : "OTP generated but email delivery failed.",
    });
  } catch (error) {
    console.error("[POST /api/register]", error);
    return NextResponse.json(
      { success: false, message: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}
