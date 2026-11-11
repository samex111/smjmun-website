"use client";

import { useState, type FormEvent } from "react";

type Props = { registrationId: string };

export function WhatsAppLinkForm({ registrationId }: Props) {
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"request" | "verify" | "complete">("request");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);

  async function requestCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/whatsapp/link/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationId, email, whatsappConsent: consent }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || "Unable to send verification code.");
      setStep("verify");
      setMessage(result.message || "Check your registration email for the verification code.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to send verification code.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/whatsapp/link/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationId, email, otp }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || "Unable to verify code.");
      setLink(result.link);
      setStep("complete");
      setMessage(result.message);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to verify code.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full max-w-xl rounded-2xl border border-[#042147]/10 bg-white p-6 text-left shadow-sm sm:p-8">
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#bb8b57]">Tejas AI · WhatsApp</p>
      <h1 className="mb-3 font-heading text-3xl text-[#042147]">Connect your WhatsApp</h1>
      <p className="mb-6 text-sm leading-6 text-[#042147]/70">
        Link the number you use on WhatsApp to this registration. We verify your registration email first, then ask you to send a one-time link from WhatsApp itself. Linking a new number replaces the previously linked number for this registration.
      </p>

      {message && <p role="status" className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
      {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {step === "request" && (
        <form onSubmit={requestCode} className="space-y-5">
          <div>
            <label htmlFor="link-email" className="mb-2 block text-sm font-medium text-[#042147]">Registration email</label>
            <input id="link-email" type="email" required maxLength={255} autoComplete="email" value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-lg border border-[#042147]/20 px-4 py-3 text-sm text-[#042147] outline-none focus:border-[#bb8b57]" />
          </div>
          <label className="flex items-start gap-3 text-sm leading-6 text-[#042147]/80">
            <input type="checkbox" required checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-1 h-4 w-4 accent-[#042147]" />
            <span>I agree to receive transactional registration, payment and conference support messages from SMJMUN on WhatsApp. I can opt out at any time.</span>
          </label>
          <button disabled={busy || !consent} className="w-full rounded-lg bg-[#042147] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">
            {busy ? "Sending code…" : "Send email verification code"}
          </button>
        </form>
      )}

      {step === "verify" && (
        <form onSubmit={verifyCode} className="space-y-5">
          <div>
            <label htmlFor="link-otp" className="mb-2 block text-sm font-medium text-[#042147]">Six-digit email code</label>
            <input id="link-otp" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" required value={otp}
              onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
              className="w-full rounded-lg border border-[#042147]/20 px-4 py-3 text-center text-lg tracking-[0.35em] text-[#042147] outline-none focus:border-[#bb8b57]" />
          </div>
          <button disabled={busy || otp.length !== 6} className="w-full rounded-lg bg-[#042147] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">
            {busy ? "Verifying…" : "Verify and create WhatsApp link"}
          </button>
          <button type="button" onClick={() => { setStep("request"); setOtp(""); setMessage(null); setError(null); }} className="w-full text-sm text-[#042147]/70 underline">
            Use a different email
          </button>
        </form>
      )}

      {step === "complete" && link && (
        <div className="space-y-4">
          <div className="rounded-lg bg-[#f7f5f0] p-4 text-sm leading-6 text-[#042147]">
            Your email is verified. Open WhatsApp using the button below and send the pre-filled one-time link message from the number you want to connect. The code expires in ten minutes.
          </div>
          <a href={link} target="_blank" rel="noreferrer" className="block w-full rounded-lg bg-[#042147] px-5 py-3 text-center text-sm font-semibold text-white">
            Open WhatsApp and send link
          </a>
          <p className="text-xs leading-5 text-[#042147]/60">Your number is linked only after our WhatsApp webhook receives the one-time code from that same number.</p>
        </div>
      )}
    </div>
  );
}
