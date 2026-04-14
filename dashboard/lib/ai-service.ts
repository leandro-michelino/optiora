import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

export async function askCostQuestion(
  message: string,
  conversationHistory: any[] = []
): Promise<string> {
  try {
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
      model: 'claude-3-sonnet-20240229',
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