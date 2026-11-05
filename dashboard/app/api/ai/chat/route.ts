import { NextRequest, NextResponse } from "next/server";
import { askCostQuestion, runWithBackendAuthHeaders } from "@/lib/ai-service";
import { z } from "zod";
import { backendUrl } from "@/lib/backend-url";

const CHAT_ROUTE_TIMEOUT_MS = 45_000;
const chatRequest = z.object({
  message: z.string().trim().min(1).max(20_000),
  conversationHistory: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().max(20_000),
  })).max(50).default([]),
});

export async function POST(request: NextRequest) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const parsed = chatRequest.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Provide a non-empty message and a valid conversation history (up to 50 messages)." },
        { status: 400 }
      );
    }
    const { message, conversationHistory } = parsed.data;

    const backendHeaders = new Headers();
    const cookie = request.headers.get("cookie");
    const authorization = request.headers.get("authorization");
    if (cookie) backendHeaders.set("cookie", cookie);
    if (authorization) backendHeaders.set("authorization", authorization);
    const authEnabled = ["true", "1", "yes"].includes(
      (process.env.ENABLE_AUTH ?? process.env.NEXT_PUBLIC_ENABLE_AUTH ?? "false").trim().toLowerCase(),
    );
    if (authEnabled) {
      const session = await fetch(backendUrl("/auth/organization"), {
        headers: backendHeaders,
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });
      if (!session.ok) {
        const status = session.status === 401 || session.status === 403 ? session.status : 503;
        return NextResponse.json({ success: false, error: "An active organization session is required." }, { status });
      }
    }

    const response = await Promise.race([
      runWithBackendAuthHeaders(backendHeaders, () => askCostQuestion(message, conversationHistory)),
      new Promise<string>((resolve) => {
        timeout = setTimeout(() => resolve(
          "The advisor is still collecting provider context. Please try again shortly, or review the latest evidence in Optimization Advisor and Operations.",
        ), CHAT_ROUTE_TIMEOUT_MS);
      }),
    ]);

    return NextResponse.json({
      success: true,
      response,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Chat API Error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to process your question. Please try again.",
        message:
          "The AI service encountered an error. This could be due to API limits or a temporary outage.",
      },
      { status: 500 }
    );
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}
