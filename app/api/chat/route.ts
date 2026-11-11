import { NextResponse } from "next/server";
import { z } from "zod";
import { TejasAssistantService } from "@/lib/chatbot/tejas-assistant";
import { rateLimit } from "@/lib/security/rate-limit";

export const maxDuration = 60;

const chatSchema = z.object({
  question: z.string().trim().min(1).max(4000),
  sessionId: z.string().trim().min(8).max(100).optional(),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) })).max(12).optional(),
});

function sessionFromRequest(request: Request, provided?: string) {
  const cookie = request.headers.get("cookie") || "";
  const existing = cookie.match(/(?:^|;\s*)tejas_session=([^;]+)/)?.[1];
  return existing || provided || `web-${crypto.randomUUID()}`;
}

export async function POST(request: Request) {
  try {
    let body: unknown;
    try { body = await request.json(); }
    catch { return NextResponse.json({ success: false, error: "Invalid request body." }, { status: 400 }); }

    const parsed = chatSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Please send a valid message." }, { status: 400 });
    }

    const forwardedFor = request.headers.get("x-forwarded-for");
    const ip = forwardedFor?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
    const limited = await rateLimit(`website-chat:${ip}`);
    if (!limited.success) {
      return NextResponse.json(
        { success: false, error: "You're sending messages too quickly. Please try again shortly." },
        { status: 429, headers: { "Retry-After": String(limited.retryAfter || 60) } },
      );
    }

    const sessionId = sessionFromRequest(request, parsed.data.sessionId);
    const answer = await TejasAssistantService.reply({
      message: parsed.data.question,
      actor: { channel: "website", sessionId },
      history: parsed.data.history,
    });

    const response = NextResponse.json({
      success: true,
      answer: answer.text,
      timestamp: new Date().toISOString(),
    });
    response.cookies.set("tejas_session", sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return response;
  } catch (error) {
    console.error("[POST /api/chat]", error);
    return NextResponse.json(
      { success: false, error: "Tejas AI could not process that message. Please try again." },
      { status: 500 },
    );
  }
}
