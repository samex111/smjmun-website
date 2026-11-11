# Tejas AI + WhatsApp Secretariat handoff

This implementation uses **one shared Tejas tool-calling assistant**, two channel adapters (anonymous website chat and WhatsApp), and exactly three tools:

1. `search_smjmun_knowledge` — current public organization profile, programs, conferences, published FAQs and blog learning resources from Sanity/static program data.
2. `get_payment_details` — read-only, registration-linked payment and conference details. The caller must be a WhatsApp number linked through the email-verified one-time linking flow.
3. `escalate_to_human` — records the request and notifies the two Secretariat recipients. It never refunds money, changes a registration, or performs a payment operation.

The HDFC/Juspay verification service remains the sole authority for payment verification. AI does not call HDFC or change payment state.

## WhatsApp handoff (no support dashboard)

The WhatsApp conversation is stored in PostgreSQL. When escalation is needed:

- Tejas records the case, delegate summary, request and verified registration/payment context (when linked).
- The configured Secretariat WhatsApp numbers receive an approved template message with the issue and original sender number.
- The agent pauses the conversation only after WhatsApp accepts at least one staff notification.
- The founder or operator opens the delegate's existing chat in the WhatsApp Business App and replies there.
- With WhatsApp Business App Coexistence enabled, the `smb_message_echoes` webhook stores staff replies as `HUMAN` messages in the same conversation. Incoming delegate messages are also saved but do not trigger the AI while handoff is active.
- The delegate can send `Tejas resume` to resume the assistant. The previous AI + human conversation stays in the transcript supplied to Tejas. Sending `STOP` opts the linked registration(s) out of proactive WhatsApp updates; the delegate can opt in again by completing the website linking flow.

This deliberately does **not** add a separate staff dashboard or a second AI agent.

## Meta prerequisites

The same business number must be onboarded to Cloud API using **WhatsApp Business App Coexistence**. A standard Cloud API number without Coexistence cannot sync a staff member's WhatsApp Business App replies into the webhook. In the Meta App webhook configuration, subscribe the WhatsApp Business Account to:

- `messages`
- `smb_message_echoes`

The webhook URL is `https://YOUR_DOMAIN/api/whatsapp/webhook`. Configure the verify token and Meta App Secret. Verify that Coexistence is enabled for the number before enabling human takeover in production.

Business-initiated notifications use approved WhatsApp templates. Create two Utility templates, each with a single body placeholder `{{1}}`:

- Support alert: `META_SUPPORT_ALERT_TEMPLATE`
- Payment confirmation: `META_PAYMENT_CONFIRMATION_TEMPLATE`

Set the template language code for each. The business must maintain appropriate opt-in for delegate messaging and the two staff recipient numbers. Free-form messages are sent only in the customer-service window; approved templates are used for proactive confirmation/notifications.

## Registration linking and consent

The registration form now has a separate WhatsApp transactional-update opt-in. A phone typed into the registration form is **not** treated as proof of ownership.

After payment (or later from the link page), the delegate opens `/whatsapp/link?registrationId=...`, supplies their registration email and consents to WhatsApp messaging. The system sends an email OTP, then issues a short-lived token. The delegate opens the pre-filled WhatsApp link and sends `LINK_<token>` from the number they want to link. The webhook consumes the one-time token and associates that WhatsApp sender ID with the registration.

The same linking page is available after payment on the success screen. Each registration has one verified WhatsApp number at a time; linking a new number replaces the previous link and revokes its access. If the number was linked before payment, the paid notification is queued from the HDFC-confirmed payment flow. If linked after payment, the webhook sends the already-paid confirmation after linking.

## Environment variables

Keep all of these in Vercel Project Environment Variables (never commit secrets):

- `DATABASE_URL`
- `NEXT_PUBLIC_SANITY_PROJECT_ID`
- `NEXT_PUBLIC_SANITY_DATASET`
- `NEXT_PUBLIC_SANITY_API_VERSION`
- One model key: `GEMINI_API_KEY`, `GROQ_API_KEY`, or `NVIDIA_API_KEY`
- `META_APP_SECRET`
- `META_WEBHOOK_VERIFY_TOKEN`
- `META_WHATSAPP_ACCESS_TOKEN`
- `META_WHATSAPP_PHONE_NUMBER_ID`
- `META_WHATSAPP_DISPLAY_NUMBER` (international number; digits are used in the `wa.me` link)
- `META_GRAPH_API_VERSION` (defaults to `v25.0`)
- `META_SECRETARIAT_NUMBERS` (two comma-separated international numbers, digits only)
- `META_SUPPORT_ALERT_TEMPLATE`
- `META_SUPPORT_ALERT_LANGUAGE` (defaults to `en`)
- `META_PAYMENT_CONFIRMATION_TEMPLATE`
- `META_PAYMENT_CONFIRMATION_LANGUAGE` (defaults to `en`)
- `CRON_SECRET` (long random value for the reminder endpoint)

Tejas model overrides are optional: `TEJAS_GEMINI_MODEL`, `TEJAS_GROQ_MODEL`, `TEJAS_NVIDIA_MODEL`.

## Database rollout

The Prisma schema adds WhatsApp identity/link records, message/conversation history, support cases, notification idempotency records and persistent rate-limit counters.

Deploy the schema to a staging database first, verify it, then apply to production with the project's Prisma 7 config:

```bash
npx prisma validate
npx prisma db push
npx prisma generate
```

Take a database backup before production schema changes. Existing Registration records default to WhatsApp consent `false`; no existing delegate is automatically opted in or linked.

## Five-minute reminder

The endpoint `GET /api/whatsapp/reminders` sends a reminder to the Secretariat for a WhatsApp support case that has waited at least five minutes without a human reply. It requires:

```
Authorization: Bearer <CRON_SECRET>
```

Schedule it every five minutes using a scheduler that supports that frequency. Vercel Cron's Hobby plan historically limits Cron Jobs to daily execution; use Vercel Pro (minute-level Cron) or an external scheduler on Hobby. Do not add a sub-daily cron to a Hobby deployment, because it can prevent deployment.

The reminder is idempotent per support case through `reminderSentAt`. A human reply received through the Coexistence echo webhook sets `humanRepliedAt` and prevents the reminder. The same secured endpoint retries paid-registration confirmation records in `PENDING` or `FAILED` state, so temporary Meta API errors can recover on the next scheduled run.

## Website channel

The website route calls the same `TejasAssistantService` as WhatsApp. It is anonymous and has access only to public knowledge. It cannot disclose private payment data or claim that a human has joined the website widget. Website users who need a person are directed to the official Secretariat contact details.

## Verification

The CI workflow runs Prisma validation, TypeScript, linting of the changed assistant files, WhatsApp utility tests, and a production build. Production integrations still require live Meta templates, Coexistence onboarding, environment variables and a staging test with real test numbers.
