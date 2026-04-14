import Anthropic from '@anthropic-ai/sdk';

function getAnthropicClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }
  return new Anthropic({ apiKey });
}

export async function askCostQuestion(
  message: string,
  conversationHistory: any[] = []
): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return 'AI assistant is not configured yet. Set ANTHROPIC_API_KEY on the server to enable chat.';
  }

  try {
    const anthropic = getAnthropicClient();
    const messages = [
      ...conversationHistory.map(h => ({
        role: h.role as 'user' | 'assistant',
        content: h.content
      })),
      {
        role: 'user' as const,
        content: message
      }
    ];

    const response = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-latest',
      max_tokens: 1000,
      messages: messages,
      system: `You are an AI assistant specializing in cloud cost optimization and FinOps.
      Help users understand their cloud costs, identify savings opportunities, and make recommendations.
      Be helpful, accurate, and focus on practical advice for AWS, Azure, GCP, and OCI costs.`
    });

    return response.content[0].type === 'text' ? response.content[0].text : 'No response generated';
  } catch (error) {
    console.error('Claude API error:', error);
    throw new Error('Failed to get AI response');
  }
}
