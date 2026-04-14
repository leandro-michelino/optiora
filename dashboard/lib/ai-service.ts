/**
 * GenAI Service Integration for OptiOra
 * Uses Claude AI for intelligent cost analysis and recommendations
 */

import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export interface AIAnalysis {
  summary: string;
  topIssues: string[];
  recommendations: string[];
  costOptimizationOpportunities: {
    area: string;
    potentialSavings: string;
    action: string;
    urgency: "high" | "medium" | "low";
  }[];
  forecastedSavings: string;
  nextSteps: string[];
}

export interface CostTrendAnalysis {
  trend: "increasing" | "decreasing" | "stable";
  percentageChange: number;
  insight: string;
  driverAnalysis: string[];
}

export interface AnomalyExplanation {
  explanation: string;
  likelyRootCauses: string[];
  suggestedActions: string;
  estimatedImpact: string;
}

/**
 * Analyze multi-cloud cost data with GenAI
 * Provides intelligent insights and recommendations
 */
export async function analyzeCloudCosts(costData: {
  totalCost: number;
  monthlyBreakdown: Record<string, number>;
  byProvider: Record<string, number>;
  byService: Record<string, number>;
  anomalies: Array<{ service: string; change: number; severity: string }>;
  previousMonthCost: number;
}): Promise<AIAnalysis> {
  const prompt = `Analyze this multi-cloud cost data and provide strategic insights:

Total Monthly Cost: $${costData.totalCost.toFixed(2)}
Previous Month: $${costData.previousMonthCost.toFixed(2)}
Change: ${(((costData.totalCost - costData.previousMonthCost) / costData.previousMonthCost) * 100).toFixed(1)}%

Breakdown by Provider:
${Object.entries(costData.byProvider)
  .map(([provider, cost]) => `- ${provider}: $${cost.toFixed(2)}`)
  .join("\n")}

Top Services by Cost:
${Object.entries(costData.byService)
  .sort(([, a], [, b]) => b - a)
  .slice(0, 5)
  .map(([service, cost]) => `- ${service}: $${cost.toFixed(2)}`)
  .join("\n")}

Active Anomalies:
${costData.anomalies.map((a) => `- ${a.service}: ${a.change > 0 ? "+" : ""}${a.change}% [${a.severity}]`).join("\n")}

Please provide:
1. A 2-3 sentence executive summary of the cost situation
2. Top 3 burning issues to address immediately
3. Top 5 specific, actionable recommendations (each with estimated savings)
4. Cost optimization opportunities with:
   - Area of optimization
   - Potential monthly savings (dollar amount)
   - Specific action to take
   - Urgency level (high/medium/low)
5. Forecasted potential savings if recommendations are implemented
6. Next immediate steps (numbered list)

Format your response as valid JSON with these exact fields:
{
  "summary": "string",
  "topIssues": ["string", "string", "string"],
  "recommendations": ["string", "string", "string", "string", "string"],
  "costOptimizationOpportunities": [
    {
      "area": "string",
      "potentialSavings": "string (e.g. '$500-800/month')",
      "action": "string",
      "urgency": "high|medium|low"
    }
  ],
  "forecastedSavings": "string (e.g. '35-45% reduction')",
  "nextSteps": ["string", "string", "string"]
}`;

  try {
    const message = await client.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 1500,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const responseText =
      message.content[0].type === "text" ? message.content[0].text : "";

    // Extract JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Invalid response format from Claude");
    }

    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error("Error analyzing costs with GenAI:", error);
    throw error;
  }
}

/**
 * Analyze cost trends with GenAI
 */
export async function analyzeCostTrend(
  currentCost: number,
  previousCost: number,
  monthlyData: number[]
): Promise<CostTrendAnalysis> {
  const percentChange = ((currentCost - previousCost) / previousCost) * 100;

  const prompt = `Analyze this cloud cost trend data:
Current Month: $${currentCost.toFixed(2)}
Previous Month: $${previousCost.toFixed(2)}
Change: ${percentChange > 0 ? "+" : ""}${percentChange.toFixed(1)}%
Last 6 months: [${monthlyData.map((c) => `$${c.toFixed(0)}`).join(", ")}]

Provide brief analysis:
1. Trend direction (increasing/decreasing/stable)
2. Key driver of this change
3. 2-3 specific factors likely causing this trend

Format as JSON:
{
  "trend": "increasing|decreasing|stable",
  "insight": "string (1-2 sentences)",
  "driverAnalysis": ["string", "string", "string"]
}`;

  try {
    const message = await client.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const responseText =
      message.content[0].type === "text" ? message.content[0].text : "";
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Invalid response format");
    }

    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error("Error analyzing trend:", error);
    throw error;
  }
}

/**
 * Explain anomalies with GenAI
 */
export async function explainAnomaly(details: {
  service: string;
  change: number;
  baseline: number;
  current: number;
  historicalContext?: string;
}): Promise<AnomalyExplanation> {
  const prompt = `A cost anomaly was detected for: ${details.service}
Baseline cost: $${details.baseline.toFixed(2)}
Current cost: $${details.current.toFixed(2)}
Change: ${details.change > 0 ? "+" : ""}${details.change.toFixed(1)}%
${details.historicalContext ? `Context: ${details.historicalContext}` : ""}

Provide:
1. Short explanation of what likely happened
2. Top 3 possible root causes
3. Steps to investigate or fix
4. Estimated impact if left unaddressed

Format as JSON:
{
  "explanation": "string (2-3 sentences)",
  "likelyRootCauses": ["string", "string", "string"],
  "suggestedActions": "string (numbered list)",
  "estimatedImpact": "string"
}`;

  try {
    const message = await client.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 600,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const responseText =
      message.content[0].type === "text" ? message.content[0].text : "";
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Invalid response format");
    }

    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error("Error explaining anomaly:", error);
    throw error;
  }
}

/**
 * Generate personalized cost optimization strategy
 */
export async function generateOptimizationStrategy(context: {
  industry: string;
  teamSize: string;
  primaryUse: string;
  spendLevel: string;
  constraints: string[];
}): Promise<{
  strategy: string;
  prioritizedActions: Array<{
    rank: number;
    action: string;
    impact: string;
    timeline: string;
  }>;
  estimatedROI: string;
}> {
  const prompt = `Create a personalized cost optimization strategy:
Industry: ${context.industry}
Team Size: ${context.teamSize}
Primary Use: ${context.primaryUse}
Monthly Spend Level: ${context.spendLevel}
Constraints: ${context.constraints.join(", ")}

Provide:
1. Tailored optimization strategy (2-3 sentences)
2. Prioritized action items with:
   - Ranking (1-5, where 1 is highest priority)
   - Specific action
   - Estimated impact (% savings or $ amount)
   - Implementation timeline
3. Estimated ROI if implemented

Format as JSON:
{
  "strategy": "string",
  "prioritizedActions": [
    {
      "rank": 1,
      "action": "string",
      "impact": "string",
      "timeline": "string"
    }
  ],
  "estimatedROI": "string"
}`;

  try {
    const message = await client.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 800,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const responseText =
      message.content[0].type === "text" ? message.content[0].text : "";
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Invalid response format");
    }

    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error("Error generating strategy:", error);
    throw error;
  }
}

/**
 * Chat interface for cost questions (multi-turn conversation)
 */
export async function askCostQuestion(
  question: string,
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }> = []
): Promise<string> {
  const systemPrompt = `You are an expert Cloud FinOps consultant helping users optimize their multi-cloud costs.
You analyze cloud spending across AWS, Azure, GCP, and OCI.
Provide specific, actionable advice focused on cost reduction and efficiency.
Be concise but thorough. Always cite specific numbers when recommending actions.
Help users understand their cloud costs and make smart optimization decisions.`;

  try {
    // Format conversation history in Claude format
    const messages = [
      ...conversationHistory.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
      {
        role: "user" as const,
        content: question,
      },
    ];

    const response = await client.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 1000,
      system: systemPrompt,
      messages: messages,
    });

    return response.content[0].type === "text" ? response.content[0].text : "";
  } catch (error) {
    console.error("Error in chat:", error);
    throw error;
  }
}
