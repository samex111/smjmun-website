import { RegistrationStatus } from "@prisma/client";
import type { Registration } from "@prisma/client";
import { APIError } from "expresscheckout-nodejs";
import { db } from "@/lib/db";
import { checkHdfcOrderStatus } from "@/lib/hdfc/check-order-status";
import {
  alreadyPaid,
  amountMismatch,
  missingOrderId,
  orderMismatch,
  registrationNotFound,
  unauthorized,
} from "@/lib/payment/errors";
import { logPaymentEvent } from "@/lib/payment/log-payment-event";
import { ConferenceService } from "@/lib/sanity/conference/service";
import { sendRegistrationEmail } from "@/lib/email/send-registration-email";
import { sendPaidRegistrationWhatsAppConfirmation } from "@/lib/whatsapp/notifications";

const PENDING_STATUSES = new Set(["PENDING", "PENDING_VBV"]);
const FAILED_STATUSES = new Set([
  "AUTHORIZATION_FAILED",
  "AUTHENTICATION_FAILED",
  "CANCELLED",
  "REFUNDED",
]);

export type PaymentVerificationOutcome = "paid" | "pending" | "failed";

export interface PaymentVerificationResult {
  outcome: PaymentVerificationOutcome;
  registration: Registration;
  hdfcStatus: string;
}

function roundAmount(amount: number): number {
  return Math.round(amount * 100) / 100;
}

function amountsMatch(expected: number, actual: number): boolean {
  return roundAmount(expected) === roundAmount(actual);
}

function toPublicRegistration(registration: Registration) {
  return {
    id: registration.id,
    email: registration.email,
    firstName: registration.firstName,
    lastName: registration.lastName,
    conferenceTitle: registration.conferenceTitle,
    conferenceDate: registration.conferenceDate,
    conferenceFee: registration.conferenceFee,
    currency: registration.currency,
    status: registration.status,
    hdfcOrderId: registration.hdfcOrderId,
    paymentId: registration.paymentId,
    paidAt: registration.paidAt,
  };
}

export async function verifyPayment(
  registrationId: string
): Promise<PaymentVerificationResult> {
  const registration = await db.registration.findUnique({
    where: { id: registrationId },
  });

  if (!registration) {
    throw registrationNotFound();
  }

  if (registration.status === RegistrationStatus.PAID) {
    throw alreadyPaid();
  }

  if (!registration.hdfcOrderId) {
    throw missingOrderId();
  }

  logPaymentEvent({
    event: "verify_start",
    registrationId,
    hdfcOrderId: registration.hdfcOrderId,
  });

  let statusResponse;
  try {
    statusResponse = await checkHdfcOrderStatus(registration.hdfcOrderId);
  } catch (error) {
    if (error instanceof APIError) {
      throw unauthorized(error.message);
    }
    throw error;
  }

  const hdfcStatus = statusResponse.status;

  logPaymentEvent({
    event: "verify_status_received",
    registrationId,
    hdfcOrderId: registration.hdfcOrderId,
    status: hdfcStatus,
  });

  if (statusResponse.order_id !== registration.hdfcOrderId) {
    throw orderMismatch();
  }

  if (!amountsMatch(registration.conferenceFee, statusResponse.amount)) {
    throw amountMismatch();
  }

  if (hdfcStatus === "CHARGED") {
    const updated = await db.registration.update({
      where: { id: registrationId },
      data: {
        status: RegistrationStatus.PAID,
        paidAt: new Date(),
        paymentId: statusResponse.txn_id ?? null,
      },
    });

    logPaymentEvent({
      event: "verify_success",
      registrationId,
      hdfcOrderId: registration.hdfcOrderId,
      status: hdfcStatus,
    });

    try {
      const conference = await ConferenceService.getConferenceById(updated.conferenceId);

      await sendRegistrationEmail({
        to: updated.email,
        studentName: updated.firstName,
        conferenceTitle: updated.conferenceTitle || conference?.title || "SMJ MUN Conference",
        venue: conference?.venue || "TBA",
        date: updated.conferenceDate ? new Date(updated.conferenceDate).toLocaleDateString() : (conference?.date || "TBA"),
        registrationId: updated.id,
      });
    } catch (emailError) {
      console.error("[EMAIL ERROR] Failed to send registration email:", emailError);
      // Email delivery is not part of the deterministic payment decision.
    }

    try {
      await sendPaidRegistrationWhatsAppConfirmation(updated.id);
    } catch (whatsAppError) {
      console.error("[WHATSAPP ERROR] Payment is still PAID; confirmation will need retry:", whatsAppError);
    }

    return {
      outcome: "paid",
      registration: updated,
      hdfcStatus,
    };
  }

  if (PENDING_STATUSES.has(hdfcStatus)) {
    return {
      outcome: "pending",
      registration,
      hdfcStatus,
    };
  }

  if (FAILED_STATUSES.has(hdfcStatus)) {
    const updated = await db.registration.update({
      where: { id: registrationId },
      data: { status: RegistrationStatus.PAYMENT_FAILED },
    });

    logPaymentEvent({
      event: "verify_failed",
      registrationId,
      hdfcOrderId: registration.hdfcOrderId,
      status: hdfcStatus,
    });

    return {
      outcome: "failed",
      registration: updated,
      hdfcStatus,
    };
  }

  logPaymentEvent({
    event: "verify_unknown_status",
    registrationId,
    hdfcOrderId: registration.hdfcOrderId,
    status: hdfcStatus,
  });

  return {
    outcome: "failed",
    registration,
    hdfcStatus,
  };
}

export { toPublicRegistration };
