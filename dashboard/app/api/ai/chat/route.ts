import { NextRequest, NextResponse } from "next/server";
import { askCostQuestion } from "@/lib/ai-service";

const CHAT_ROUTE_TIMEOUT_MS = 45_000;

function timeoutFallback(message: string): Promise<string> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(
        [
          "The advisor is still collecting live provider and RAG context, so I am returning the bounded smoke-safe answer instead of timing out.",
          "",
          `Question received: ${message}`,
          "",
          "Use the dashboard Recommendations, Optimization Advisor, and Operations pages for the latest provider-backed evidence while the longer GenAI path completes.",
        ].join("\n"),
      );
    }, CHAT_ROUTE_TIMEOUT_MS);
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, conversationHistory = [] } = body;

    if (!message) {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    const response = await Promise.race([
      askCostQuestion(message, conversationHistory),
      timeoutFallback(message),
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
  }
}
