const GRAPH_VERSION = process.env.META_GRAPH_API_VERSION || "v25.0";

function getConfig() {
  const token = process.env.META_WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) throw new Error("WhatsApp Cloud API credentials are not configured.");
  return { token, phoneNumberId };
}

async function postMessage(payload: Record<string, unknown>) {
  const { token, phoneNumberId } = getConfig();
  const response = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", ...payload }),
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(`WhatsApp Cloud API rejected the message: ${JSON.stringify(result)}`);
  }
  return result as { messages?: Array<{ id?: string }> };
}

export async function sendWhatsAppText(to: string, body: string) {
  return postMessage({
    recipient_type: "individual",
    to,
    type: "text",
    text: { preview_url: false, body },
  });
}

/**
 * Requires a Meta-approved utility template. Keep the template body to one
 * {{1}} placeholder and pass the complete support/payment summary as it.
 */
export async function sendWhatsAppTemplate(
  to: string,
  name: string,
  languageCode: string,
  parameters: string[],
) {
  return postMessage({
    to,
    type: "template",
    template: {
      name,
      language: { code: languageCode },
      components: [{
        type: "body",
        parameters: parameters.map((text) => ({ type: "text", text })),
      }],
    },
  });
}
