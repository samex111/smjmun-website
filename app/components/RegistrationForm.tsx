"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Conference } from "@/lib/sanity/conference/types";
import { registrationSchema } from "@/lib/validations/registration";
import { verifyOtpSchema } from "@/lib/validations/verify-otp";

interface RegistrationFormProps {
  conference: Conference;
}

type FieldErrors = Partial<Record<keyof FormFields, string>>;

interface FormFields {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  whatsappUpdatesConsent: boolean;
  institution: string;
  city: string;
  committeePreference: string;
  dietaryRequirements: string;
}

const INITIAL_FIELDS: FormFields = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  whatsappUpdatesConsent: false,
  institution: "",
  city: "",
  committeePreference: "",
  dietaryRequirements: "",
};

const labelClass = "block text-[12px] font-medium tracking-[0.15em] uppercase text-gold mb-2 font-body transition-colors group-focus-within:text-white";
const inputClass = "w-full py-[14px] px-[16px] font-body text-[15px] text-white bg-[#111111] border border-white/10 rounded-md outline-none focus:border-gold hover:border-white/30 focus:bg-[#151515] hover:bg-[#131313] transition-all duration-300 placeholder:text-white/30";
const errorClass = "font-body text-[13px] text-red-400 mt-1.5 flex items-center gap-1.5";

export default function RegistrationForm({ conference }: RegistrationFormProps) {
  const router = useRouter();
  const [fields, setFields] = useState<FormFields>(INITIAL_FIELDS);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showOtpStep, setShowOtpStep] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [otpError, setOtpError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [registrationId, setRegistrationId] = useState<string | null>(null);
  const [verifiedMessage, setVerifiedMessage] = useState<string | null>(null);

  function updateField<K extends keyof FormFields>(name: K, value: FormFields[K]) {
    setFields((prev) => ({ ...prev, [name]: value }));
    setFieldErrors((prev) => ({ ...prev, [name]: undefined }));
    setFormError(null);
    if (!showOtpStep) {
      setSuccessMessage(null);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setSuccessMessage(null);
    setVerifiedMessage(null);
    setRegistrationId(null);

    const payload = {
      ...fields,
      conferenceSlug: conference.slug.current,
    };

    const parsed = registrationSchema.safeParse(payload);
    if (!parsed.success) {
      const errors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (typeof field === "string" && !errors[field as keyof FormFields]) {
          errors[field as keyof FormFields] = issue.message;
        }
      }
      setFieldErrors(errors);
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });

      const result = (await response.json()) as {
        success: boolean;
        message?: string;
      };

      if (!response.ok || !result.success) {
        setFormError(result.message ?? "Registration failed. Please try again.");
        return;
      }

      setSubmittedEmail(parsed.data.email.trim().toLowerCase());
      setShowOtpStep(true);
      setOtp("");
      setOtpError(null);
      setSuccessMessage("Verification code generated successfully.");
    } catch {
      setFormError("Unable to submit registration. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleVerifyOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setOtpError(null);
    setVerifiedMessage(null);

    const parsed = verifyOtpSchema.safeParse({
      email: submittedEmail,
      otp,
      conferenceSlug: conference.slug.current,
    });

    if (!parsed.success) {
      setOtpError(parsed.error.issues[0]?.message ?? "Invalid verification code.");
      return;
    }

    setIsVerifying(true);

    try {
      const response = await fetch("/api/register/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });

      const result = (await response.json()) as {
        success: boolean;
        message?: string;
        registrationId?: string;
      };

      if (!response.ok || !result.success) {
        setOtpError(result.message ?? "Verification failed. Please try again.");
        return;
      }

      const id = result.registrationId ?? null;
      setRegistrationId(id);
      setVerifiedMessage("Registration verified successfully. Redirecting to payment...");
      setSuccessMessage(null);
      setOtp("");

      if (id) {
        router.push(`/payment/${id}`);
      }
    } catch {
      setOtpError("Unable to verify code. Please try again.");
    } finally {
      setIsVerifying(false);
    }
  }

  const formDisabled = isSubmitting || showOtpStep || !!registrationId;

  return (
    <>
      <form onSubmit={handleSubmit} noValidate>


     
        {verifiedMessage && (
          <div
            role="status"
            className="font-body text-[15px] text-green-400 p-4 mb-8 bg-green-500/10 border border-green-500/20 rounded-md"
          >
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-green-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {verifiedMessage}
            </div>
            {registrationId && (
              <span className="block mt-2 ml-7 text-[13px] text-green-400/70">
                Registration ID: {registrationId}
              </span>
            )}
          </div>
        )}

        <fieldset
          disabled={formDisabled}
          className={`border-none p-0 m-0 ${formDisabled ? "opacity-60" : "opacity-100"}`}
        >
          <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-6 mb-6">
            <div className="group">
              <label htmlFor="firstName" className={labelClass}>
                First Name *
              </label>
              <input
                id="firstName"
                name="firstName"
                type="text"
                autoComplete="given-name"
                value={fields.firstName}
                onChange={(e) => updateField("firstName", e.target.value)}
                className={inputClass}
                placeholder="Sameer"
              />
              {fieldErrors.firstName && (
                <p className={errorClass}>{fieldErrors.firstName}</p>
              )}
            </div>

            <div className="group">
              <label htmlFor="lastName" className={labelClass}>
                Last Name *
              </label>
              <input
                id="lastName"
                name="lastName"
                type="text"
                autoComplete="family-name"
                value={fields.lastName}
                onChange={(e) => updateField("lastName", e.target.value)}
                className={inputClass}
                placeholder="Patel"
              />
              {fieldErrors.lastName && (
                <p className={errorClass}>{fieldErrors.lastName}</p>
              )}
            </div>
          </div>

          <div className="mb-6 group">
            <label htmlFor="email" className={labelClass}>
              Email *
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              value={fields.email}
              onChange={(e) => updateField("email", e.target.value)}
              className={inputClass}
              placeholder="sameer@example.com"
            />
            {fieldErrors.email && <p className={errorClass}>{fieldErrors.email}</p>}
          </div>

          <div className="mb-6 group">
            <label htmlFor="phone" className={labelClass}>
              Phone *
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              autoComplete="tel"
              placeholder="10-digit mobile number"
              value={fields.phone}
              onChange={(e) => updateField("phone", e.target.value)}
              className={inputClass}
            />
            {fieldErrors.phone && <p className={errorClass}>{fieldErrors.phone}</p>}
          </div>

          <label className="mb-6 flex items-start gap-3 text-[13px] leading-6 text-white/70">
            <input
              type="checkbox"
              name="whatsappUpdatesConsent"
              checked={fields.whatsappUpdatesConsent}
              onChange={(event) => updateField("whatsappUpdatesConsent", event.target.checked)}
              className="mt-1 h-4 w-4 accent-[#bb8b57]"
            />
            <span>
              I agree to receive transactional registration, payment and conference updates from SMJMUN on WhatsApp. I can opt out at any time.
            </span>
          </label>

          <div className="mb-6 group">
            <label htmlFor="institution" className={labelClass}>
              Institution *
            </label>
            <input
              id="institution"
              name="institution"
              type="text"
              autoComplete="organization"
              value={fields.institution}
              onChange={(e) => updateField("institution", e.target.value)}
              className={inputClass}
              placeholder="University or High School Name"
            />
            {fieldErrors.institution && (
              <p className={errorClass}>{fieldErrors.institution}</p>
            )}
          </div>

          <div className="mb-6 group">
            <label htmlFor="city" className={labelClass}>
              City
            </label>
            <input
              id="city"
              name="city"
              type="text"
              autoComplete="address-level2"
              value={fields.city}
              onChange={(e) => updateField("city", e.target.value)}
              className={inputClass}
              placeholder="New Delhi"
            />
            {fieldErrors.city && <p className={errorClass}>{fieldErrors.city}</p>}
          </div>

          {conference.committees && conference.committees.length > 0 && (
            <div className="mb-6 group">
              <label htmlFor="committeePreference" className={labelClass}>
                Committee Preference
              </label>
              <select
                id="committeePreference"
                name="committeePreference"
                value={fields.committeePreference}
                onChange={(e) =>
                  updateField("committeePreference", e.target.value)
                }
                className={`${inputClass} appearance-none bg-no-repeat pr-10`}
                style={{
                  backgroundImage:
                    "linear-gradient(45deg, transparent 50%, rgba(255,255,255,0.7) 50%), linear-gradient(135deg, rgba(255,255,255,0.7) 50%, transparent 50%)",
                  backgroundPosition:
                    "calc(100% - 20px) calc(50% - 3px), calc(100% - 14px) calc(50% - 3px)",
                  backgroundSize: "6px 6px, 6px 6px",
                }}
              >
                <option value="" className="bg-[#111111]">Select a committee (optional)</option>
                {conference.committees.map((committee) => (
                  <option key={committee.name} value={committee.name} className="bg-[#111111]">
                    {committee.name}
                  </option>
                ))}
              </select>
              {fieldErrors.committeePreference && (
                <p className={errorClass}>{fieldErrors.committeePreference}</p>
              )}
            </div>
          )}

          <div className="mb-10 group">
            <label htmlFor="dietaryRequirements" className={labelClass}>
              Dietary Requirements
            </label>
            <textarea
              id="dietaryRequirements"
              name="dietaryRequirements"
              rows={4}
              value={fields.dietaryRequirements}
              onChange={(e) =>
                updateField("dietaryRequirements", e.target.value)
              }
              placeholder="Any allergies or dietary restrictions? (Optional)"
              className={`${inputClass} resize-y min-h-[120px]`}
            />
            {fieldErrors.dietaryRequirements && (
              <p className={errorClass}>{fieldErrors.dietaryRequirements}</p>
            )}
          </div>

        {formError && (
          <div
            role="alert"
            className={`${errorClass} p-4 mb-8 bg-red-500/10 border border-red-500/20 rounded-md !text-red-400`}
          >
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            {formError}
          </div>
        )}
             {successMessage && (
          <div
            role="status"
            className="font-body text-[15px] text-white p-4 mb-8 bg-gold/10 border border-gold/30 rounded-md flex items-center gap-2"
          >
            <svg className="w-5 h-5 text-gold shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {successMessage}
          </div>
        )}


          {!showOtpStep && !registrationId && (
            <button
              type="submit"
              className="btn-ds-primary w-full disabled:opacity-50 disabled:cursor-not-allowed group relative overflow-hidden"
              disabled={isSubmitting}
            >
              <span className="relative z-10 flex items-center justify-center gap-2">
                {isSubmitting ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Submitting...
                  </>
                ) : (
                  "Continue Registration"
                )}
              </span>
            </button>
          )}
        </fieldset>
      </form>

      {showOtpStep && !registrationId && (
        <form
          onSubmit={handleVerifyOtp}
          noValidate
          className={`pt-12 border-t border-white/10 ${showOtpStep ? "mt-12" : "mt-0"}`}
        >
          <span className="section-label mb-4 block text-gold">
            Verify Your Email
          </span>
          <h3 className="text-subheading text-white mb-6 text-[24px]">
            Enter Verification Code
          </h3>

          {otpError && (
            <div
              role="alert"
              className={`${errorClass} p-4 mb-6 bg-red-500/10 border border-red-500/20 rounded-md !text-red-400`}
            >
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              {otpError}
            </div>
          )}

          <div className="mb-8 group">
            <label htmlFor="otp" className={labelClass}>
              Verification Code *
            </label>
            <input
              id="otp"
              name="otp"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="6-digit code"
              value={otp}
              onChange={(e) => {
                setOtp(e.target.value.replace(/\D/g, "").slice(0, 6));
                setOtpError(null);
              }}
              className={`${inputClass} tracking-[0.3em] text-[20px] text-center`}
              disabled={isVerifying}
            />
          </div>

          <button
            type="submit"
            className="btn-ds-primary w-full disabled:opacity-50 disabled:cursor-not-allowed group relative overflow-hidden"
            disabled={isVerifying}
          >
            <span className="relative z-10 flex items-center justify-center gap-2">
              {isVerifying ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Verifying...
                </>
              ) : (
                "Verify OTP"
              )}
            </span>
          </button>
        </form>
      )}
    </>
  );
}
