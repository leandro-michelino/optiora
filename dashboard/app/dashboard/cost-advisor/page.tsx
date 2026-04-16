'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Send, MessageCircle, Loader, Download, Share2 } from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface Suggestion {
  text: string;
  emoji: string;
}

export default function CostAdvisorPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content:
        "Hi! I'm your AI Cost Advisor. Ask me anything about optimizing your cloud costs, understanding spending patterns, or implementing cost-saving strategies. What would you like to know?",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const suggestions: Suggestion[] = [
    { emoji: '📊', text: 'Analyze my cost trends' },
    { emoji: '💰', text: 'How can I reduce my AWS spend?' },
    { emoji: '🎯', text: 'Reserved instances strategy' },
    { emoji: '⚡', text: 'Cost optimization quick wins' },
  ];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async () => {
    if (!input.trim()) return;

    // Add user message
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      // Call your backend API that uses OCI GenAI
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: input,
          conversationHistory: messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!response.ok) throw new Error('Failed to get response');

      const data = await response.json();

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.response,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Error:', error);
      // Fallback response
      const fallbackMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content:
          "I'm having trouble connecting to the AI service. Please try again in a moment.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, fallbackMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleSuggestion = (suggestion: string) => {
    setInput(suggestion);
  };

  return (
    <div className="space-y-6 h-full flex flex-col">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-3">
          <MessageCircle className="w-10 h-10 text-blue-600" />
          Cloud Cost Advisor
        </h1>
        <p className="text-slate-600 dark:text-slate-400">
          Ask anything about your cloud costs. Powered by OCI GenAI in London South.
        </p>
      </div>

      {/* Chat Container */}
      <div className="flex-1 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 flex flex-col">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {messages.length === 1 && (
            <div className="flex flex-col items-center justify-center h-full text-center py-12">
              <MessageCircle className="w-16 h-16 text-blue-200 dark:text-blue-900 mb-4" />
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Welcome!</h2>
              <p className="text-slate-600 dark:text-slate-400 max-w-md">
                I'm your AI Cost Advisor. Ask me questions about optimizing your cloud spending, understanding your costs,
                or implementing cost-saving strategies.
              </p>
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-md px-4 py-3 rounded-lg ${
                  message.role === 'user'
                    ? 'bg-blue-600 text-white rounded-br-none'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white rounded-bl-none'
                }`}
              >
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
                <p className="text-xs opacity-70 mt-2">
                  {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-slate-100 dark:bg-slate-700 px-4 py-3 rounded-lg rounded-bl-none">
                <div className="flex gap-2">
                  <Loader className="w-4 h-4 animate-spin text-slate-600 dark:text-slate-400" />
                  <span className="text-sm text-slate-600 dark:text-slate-400">Thinking...</span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Suggestions (shown only after first message) */}
        {messages.length === 1 && !loading && (
          <div className="px-6 pb-6">
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">Try asking about:</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {suggestions.map((suggestion, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSuggestion(suggestion.text)}
                  className="p-3 rounded-lg border border-slate-200 dark:border-slate-600 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-slate-50 dark:hover:bg-slate-700 transition text-left"
                >
                  <span className="text-xl mr-2">{suggestion.emoji}</span>
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{suggestion.text}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input Area */}
        <div className="border-t border-slate-200 dark:border-slate-700 p-6 bg-slate-50 dark:bg-slate-900">
          <div className="flex gap-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder="Ask about your cloud costs..."
              className="flex-1 px-4 py-3 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
              disabled={loading}
            />
            <button
              onClick={handleSendMessage}
              disabled={loading || !input.trim()}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition flex items-center gap-2 font-medium"
            >
              {loading ? <Loader className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Send
            </button>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
            💡 Tip: Be specific about which cloud providers or services you want to focus on
          </p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3 justify-end">
        <button className="px-4 py-2 flex items-center gap-2 border border-slate-300 dark:border-slate-600 rounded-lg font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition">
          <Download className="w-4 h-4" />
          Export Chat
        </button>
        <button className="px-4 py-2 flex items-center gap-2 border border-slate-300 dark:border-slate-600 rounded-lg font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition">
          <Share2 className="w-4 h-4" />
          Share
        </button>
      </div>
    </div>
  );
}
