import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RegistrationStatus } from "@prisma/client";
import PaymentLayout from "@/app/payment/components/PaymentLayout";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

function formatDate(date: Date | null) {
  if (!date) return null;
  return date.toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

export const metadata: Metadata = {
  title: "Payment Successful — SMJ MUN",
};

export default async function PaymentSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ registrationId?: string }>;
}) {
  const { registrationId } = await searchParams;

  if (!registrationId) {
    notFound();
  }

  const registration = await db.registration.findUnique({
    where: { id: registrationId },
  });

  if (!registration || registration.status !== RegistrationStatus.PAID) {
    notFound();
  }

  const conferenceDate = formatDate(registration.conferenceDate);

  return (
    <PaymentLayout>
      <section
        style={{
          backgroundColor: "#f8f6f2",
          padding: "120px 0 80px",
        }}
      >
        <div
          style={{
            maxWidth: "720px",
            margin: "0 auto",
            padding: "0 8vw",
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: "64px",
              height: "64px",
              borderRadius: "50%",
              backgroundColor: "rgba(22,163,74,0.12)",
              color: "#16a34a",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 24px",
              fontSize: "28px",
            }}
          >
            ✓
          </div>

          <h1
            style={{
              fontFamily: "var(--font-heading), Georgia, serif",
              fontSize: "clamp(32px, 5vw, 48px)",
              fontWeight: 700,
              color: "#042147",
              marginBottom: "16px",
            }}
          >
            Payment Successful
          </h1>
          <p
            style={{
              fontFamily: "var(--font-body), system-ui, sans-serif",
              fontSize: "16px",
              color: "rgba(4,33,71,0.7)",
              lineHeight: 1.6,
              marginBottom: "40px",
            }}
          >
            Your registration and payment for {registration.conferenceTitle} are
            confirmed.
          </p>

          <div
            style={{
              backgroundColor: "#ffffff",
              border: "1px solid rgba(4,33,71,0.08)",
              padding: "32px",
              textAlign: "left",
            }}
          >
            <h2
              style={{
                fontFamily: "var(--font-heading), Georgia, serif",
                fontSize: "22px",
                fontWeight: 700,
                color: "#042147",
                marginBottom: "20px",
              }}
            >
              Registration Details
            </h2>
            <dl style={{ display: "grid", gap: "12px", margin: 0 }}>
              <div>
                <dt style={{ fontSize: "12px", color: "#bb8b57", textTransform: "uppercase", letterSpacing: "0.12em" }}>
                  Participant
                </dt>
                <dd style={{ margin: "4px 0 0", color: "#042147" }}>
                  {registration.firstName} {registration.lastName}
                </dd>
              </div>
              <div>
                <dt style={{ fontSize: "12px", color: "#bb8b57", textTransform: "uppercase", letterSpacing: "0.12em" }}>
                  Conference
                </dt>
                <dd style={{ margin: "4px 0 0", color: "#042147" }}>
                  {registration.conferenceTitle}
                </dd>
              </div>
              {conferenceDate && (
                <div>
                  <dt style={{ fontSize: "12px", color: "#bb8b57", textTransform: "uppercase", letterSpacing: "0.12em" }}>
                    Date
                  </dt>
                  <dd style={{ margin: "4px 0 0", color: "#042147" }}>
                    {conferenceDate}
                  </dd>
                </div>
              )}
              <div>
                <dt style={{ fontSize: "12px", color: "#bb8b57", textTransform: "uppercase", letterSpacing: "0.12em" }}>
                  Amount Paid
                </dt>
                <dd style={{ margin: "4px 0 0", color: "#042147" }}>
                  {formatCurrency(registration.conferenceFee, registration.currency)}
                </dd>
              </div>
              {registration.paymentId && (
                <div>
                  <dt style={{ fontSize: "12px", color: "#bb8b57", textTransform: "uppercase", letterSpacing: "0.12em" }}>
                    Payment Reference
                  </dt>
                  <dd style={{ margin: "4px 0 0", color: "#042147" }}>
                    {registration.paymentId}
                  </dd>
                </div>
              )}
            </dl>
          </div>

          <Link
            href={`/whatsapp/link?registrationId=${encodeURIComponent(registration.id)}`}
            className="btn-primary"
            style={{ display: "inline-block", marginTop: "32px", textDecoration: "none" }}
          >
            Connect WhatsApp Assistant
          </Link>

          <Link
            href="/conferences"
            className="btn-primary"
            style={{
              display: "inline-block",
              marginTop: "16px",
              textDecoration: "none",
            }}
          >
            View Conferences
          </Link>
        </div>
      </section>
    </PaymentLayout>
  );
}
