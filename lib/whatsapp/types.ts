export type Actor = {
  channel: "website" | "whatsapp";
  sessionId: string;
  phone?: string;
  verifiedRegistrationId?: string;
};

type WhatsAppRecord = Record<string, unknown>;

function asRecord(value: unknown): WhatsAppRecord | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as WhatsAppRecord
    : undefined;
}

function nestedText(value: unknown, key: string): string | undefined {
  const record = asRecord(value);
  const text = record?.[key];
  return typeof text === "string" ? text : undefined;
}

export function extractWhatsAppText(message: WhatsAppRecord): string {
  const type = typeof message.type === "string" ? message.type : "";
  if (type === "text") return nestedText(message.text, "body") || "";
  if (type === "button") return nestedText(message.button, "text") || "";
  if (type === "interactive") {
    const interactive = asRecord(message.interactive);
    return nestedText(interactive?.button_reply, "title")
      || nestedText(interactive?.list_reply, "title")
      || "";
  }
  return type ? `[The delegate sent a ${type} message]` : "";
}

export function isResumeRequest(message: string): boolean {
  return /^(tejas|ai)[, ]+(resume|continue|take over)|^(resume|continue)\s+(tejas|ai)$/i.test(message.trim());
}
