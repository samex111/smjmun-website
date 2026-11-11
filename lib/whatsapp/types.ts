export type Actor = {
  channel: "website" | "whatsapp";
  sessionId: string;
  phone?: string;
  verifiedRegistrationId?: string;
};

export function extractWhatsAppText(message: Record<string, any>): string {
  if (message.type === "text") return message.text?.body || "";
  if (message.type === "button") return message.button?.text || "";
  if (message.type === "interactive") {
    return message.interactive?.button_reply?.title || message.interactive?.list_reply?.title || "";
  }
  return message.type ? `[The delegate sent a ${message.type} message]` : "";
}

export function isResumeRequest(message: string): boolean {
  return /^(tejas|ai)[, ]+(resume|continue|take over)|^(resume|continue)\s+(tejas|ai)$/i.test(message.trim());
}
