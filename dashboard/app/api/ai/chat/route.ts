import { NextRequest, NextResponse } from "next/server";
import { askCostQuestion } from "@/lib/ai-service";

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

    // Call Claude AI service
    const response = await askCostQuestion(message, conversationHistory);

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
