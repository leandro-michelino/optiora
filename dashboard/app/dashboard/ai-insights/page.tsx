'use client';

import React, { useState, useEffect } from 'react';
import { AlertCircle, Lightbulb, TrendingDown, Zap, ArrowRight, Brain } from 'lucide-react';

interface AIInsight {
  title: string;
  description: string;
  potentialSavings: string;
  impact: 'high' | 'medium' | 'low';
  actionable: boolean;
}

interface TopIssue {
  issue: string;
  severity: 'critical' | 'warning' | 'info';
  affectedResources: number;
  estimatedCost: number;
}

export default function AIInsightsPage() {
  const [insights, setInsights] = useState<AIInsight[]>([]);
  const [topIssues, setTopIssues] = useState<TopIssue[]>([]);
  const [forecastedSavings, setForecastedSavings] = useState('$0');
  const [loading, setLoading] = useState(true);
  const [selectedInsight, setSelectedInsight] = useState<AIInsight | null>(null);

  useEffect(() => {
    // Simulate loading AI insights
    setTimeout(() => {
      // Mock AI insights from Claude analysis
      setInsights([
        {
          title: 'Unused Compute Resources',
          description: 'Detected 15 EC2 instances running at <5% CPU utilization for over 30 days',
          potentialSavings: '$2,400/month',
          impact: 'high',
          actionable: true
        },
        {
          title: 'Inefficient Database Connections',
          description: 'RDS instances have connection pooling disabled, consuming excess memory',
          potentialSavings: '$840/month',
          impact: 'medium',
          actionable: true
        },
        {
          title: 'Data Transfer Costs Not Optimized',
          description: 'Cross-region data transfer can be reduced by implementing CloudFront distribution',
          potentialSavings: '$1,200/month',
          impact: 'high',
          actionable: true
        },
        {
          title: 'Reserved Instance Under-utilization',
          description: 'Your RIs are covering only 62% of your baseline compute - consider rightsizing',
          potentialSavings: '$650/month',
          impact: 'medium',
          actionable: true
        },
      ]);

      setTopIssues([
        { issue: 'Idle Compute Instances', severity: 'critical', affectedResources: 15, estimatedCost: 2400 },
        { issue: 'Unattached Volumes', severity: 'warning', affectedResources: 8, estimatedCost: 480 },
        { issue: 'NAT Gateway Overages', severity: 'warning', affectedResources: 1, estimatedCost: 360 },
      ]);

      setForecastedSavings('$18,500/month (45% reduction)');
      setLoading(false);
    }, 600);
  }, []);

  if (loading) {
    return (
      <div className="space-y-8">
        <div className="animate-pulse">
          <div className="h-10 bg-slate-200 dark:bg-slate-700 rounded w-1/3 mb-4"></div>
          <div className="h-6 bg-slate-200 dark:bg-slate-700 rounded w-2/3"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-3">
          <Brain className="w-10 h-10 text-purple-600" />
          AI Cost Intelligence
        </h1>
        <p className="text-slate-600 dark:text-slate-400">
          Powered by Claude - Real-time cost analysis and smart recommendations
        </p>
      </div>

      {/* Forecasted Savings Banner */}
      <div className="p-6 bg-gradient-to-r from-green-500 to-emerald-600 rounded-lg text-white shadow-lg">
        <div className="flex items-start gap-4">
          <TrendingDown className="w-8 h-8 flex-shrink-0 mt-1" />
          <div className="flex-1">
            <h3 className="text-xl font-bold mb-1">Potential Monthly Savings</h3>
            <p className="text-green-50 mb-3">If you implement our AI-recommended optimizations:</p>
            <div className="text-3xl font-bold">{forecastedSavings}</div>
          </div>
          <button className="px-6 py-3 bg-white text-green-600 rounded-lg font-semibold hover:bg-green-50 transition whitespace-nowrap">
            View Plan
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Top Issues */}
          <div className="card bg-white dark:bg-slate-800">
            <h2 className="text-2xl font-semibold mb-4 text-slate-900 dark:text-white flex items-center gap-2">
              <AlertCircle className="w-6 h-6 text-red-500" />
              Critical Issues (Top 3)
            </h2>
            <div className="space-y-3">
              {topIssues.map((issue, idx) => (
                <div
                  key={idx}
                  className="p-4 rounded-lg border-l-4 bg-slate-50 dark:bg-slate-700/50"
                  style={{
                    borderColor:
                      issue.severity === 'critical'
                        ? '#ef4444'
                        : issue.severity === 'warning'
                        ? '#f59e0b'
                        : '#06b6d4',
                  }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <h4 className="font-semibold text-slate-900 dark:text-white">{issue.issue}</h4>
                      <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                        {issue.affectedResources} resources • Costing ${issue.estimatedCost.toLocaleString()}/month
                      </p>
                    </div>
                    <span
                      className="px-3 py-1 rounded-full text-sm font-medium text-white whitespace-nowrap"
                      style={{
                        background:
                          issue.severity === 'critical'
                            ? '#ef4444'
                            : issue.severity === 'warning'
                            ? '#f59e0b'
                            : '#06b6d4',
                      }}
                    >
                      {issue.severity.replace(/^\w/, (c) => c.toUpperCase())}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* AI Insights */}
          <div className="card bg-white dark:bg-slate-800">
            <h2 className="text-2xl font-semibold mb-4 text-slate-900 dark:text-white flex items-center gap-2">
              <Lightbulb className="w-6 h-6 text-yellow-500" />
              AI Recommendations
            </h2>
            <div className="space-y-3">
              {insights.map((insight, idx) => (
                <div
                  key={idx}
                  className="p-4 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-purple-400 dark:hover:border-purple-500 cursor-pointer transition group"
                  onClick={() => setSelectedInsight(insight)}
                >
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <h4 className="font-semibold text-slate-900 dark:text-white group-hover:text-purple-600 dark:group-hover:text-purple-400">
                      {insight.title}
                    </h4>
                    <span
                      className="px-2 py-1 rounded text-xs font-medium text-white whitespace-nowrap"
                      style={{
                        background: insight.impact === 'high' ? '#ef4444' : insight.impact === 'medium' ? '#f59e0b' : '#06b6d4',
                      }}
                    >
                      {insight.impact.toUpperCase()} Impact
                    </span>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">{insight.description}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-bold text-green-600 dark:text-green-400">{insight.potentialSavings}</span>
                    <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-purple-600 dark:group-hover:text-purple-400" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="space-y-6">
          {/* Quick Stats */}
          <div className="card bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900">
            <h3 className="font-semibold text-slate-900 dark:text-white mb-4">Analysis Summary</h3>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-slate-600 dark:text-slate-400">Issues Found</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{topIssues.length}</p>
              </div>
              <div>
                <p className="text-sm text-slate-600 dark:text-slate-400">Recommendations</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{insights.length}</p>
              </div>
              <div>
                <p className="text-sm text-slate-600 dark:text-slate-400">Avg Implementation Time</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">2-3 days</p>
              </div>
            </div>
          </div>

          {/* Analysis Method */}
          <div className="card bg-white dark:bg-slate-800 border-l-4 border-purple-500">
            <h3 className="font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
              <Zap className="w-5 h-5 text-purple-500" />
              Powered by AI
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              OptiOra uses Claude AI to analyze 100+ cost patterns and deliver personalized recommendations.
            </p>
            <div className="space-y-2 text-xs text-slate-600 dark:text-slate-400">
              <div>✓ Real-time cost analysis</div>
              <div>✓ Historical trending</div>
              <div>✓ Predictive forecasting</div>
              <div>✓ Anomaly detection</div>
            </div>
          </div>

          {/* Call to Action */}
          <button className="w-full px-4 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg font-semibold hover:shadow-lg transition">
            Start Implementation
          </button>
        </div>
      </div>

      {/* Detailed View Modal */}
      {selectedInsight && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-800 rounded-lg max-w-2xl w-full p-8">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">{selectedInsight.title}</h2>
            <p className="text-slate-600 dark:text-slate-400 mb-6">{selectedInsight.description}</p>

            <div className="grid grid-cols-2 gap-6 mb-8">
              <div>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">Monthly Savings</p>
                <p className="text-3xl font-bold text-green-600">{selectedInsight.potentialSavings}</p>
              </div>
              <div>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">Annual Impact</p>
                <p className="text-3xl font-bold text-purple-600">
                  {selectedInsight.potentialSavings.replace(/\/month/, '/year')}
                </p>
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg mb-6">
              <h4 className="font-semibold text-slate-900 dark:text-white mb-3">Recommended Action</h4>
              <ol className="list-decimal list-inside space-y-2 text-slate-700 dark:text-slate-300">
                <li>Review resource utilization metrics</li>
                <li>Validate findings against your infrastructure</li>
                <li>Plan implementation with your team</li>
                <li>Execute changes during maintenance window</li>
                <li>Monitor metrics post-implementation</li>
              </ol>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setSelectedInsight(null)}
                className="flex-1 px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition"
              >
                Close
              </button>
              <button className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition">
                Implement This Optimization
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
