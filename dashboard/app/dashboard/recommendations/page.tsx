'use client'

import { Lightbulb, DollarSign, TrendingDown } from 'lucide-react'

interface Recommendation {
  id: string
  service: string
  cloud: string
  title: string
  description: string
  savings: number
  roi: number
  difficulty: 'easy' | 'medium' | 'hard'
}

export default function RecommendationsPage() {
  const recommendations: Recommendation[] = [
    {
      id: '1',
      service: 'EC2',
      cloud: 'AWS',
      title: 'Purchase Reserved Instances',
      description:
        'Converting on-demand instances to reserved instances for 12-month commitment',
      savings: 1200,
      roi: 85,
      difficulty: 'easy',
    },
    {
      id: '2',
      service: 'S3',
      cloud: 'AWS',
      title: 'Implement S3 Lifecycle Policies',
      description:
        'Move old data to cheaper storage classes like Glacier and Deep Archive',
      savings: 340,
      roi: 72,
      difficulty: 'medium',
    },
    {
      id: '3',
      service: 'Virtual Machines',
      cloud: 'Azure',
      title: 'Right-Size VM Instances',
      description:
        '3 VMs are over-sized for current workload. Downsize to appropriate tier.',
      savings: 480,
      roi: 65,
      difficulty: 'medium',
    },
    {
      id: '4',
      service: 'Compute Engine',
      cloud: 'GCP',
      title: 'Use Committed Use Discounts',
      description:
        'Commit to 3-year terms for committed compute resources',
      savings: 320,
      roi: 58,
      difficulty: 'easy',
    },
  ]

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'easy':
        return 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200'
      case 'medium':
        return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200'
      case 'hard':
        return 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200'
      default:
        return ''
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-2">
          Optimization Recommendations
        </h1>
        <p className="text-slate-600 dark:text-slate-400">
          AI-powered suggestions ranked by ROI and implementation difficulty
        </p>
      </div>

      <div className="space-y-4">
        {recommendations.map((rec) => (
          <div key={rec.id} className="card border border-slate-200 dark:border-slate-700">
            <div className="flex items-start gap-4">
              <Lightbulb className="w-6 h-6 text-yellow-500 flex-shrink-0 mt-1" />
              <div className="flex-1">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                      {rec.title}
                    </h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-sm px-2 py-1 bg-slate-200 dark:bg-slate-700 rounded">
                        {rec.service}
                      </span>
                      <span className="text-sm px-2 py-1 bg-slate-200 dark:bg-slate-700 rounded">
                        {rec.cloud}
                      </span>
                      <span className={`text-sm px-2 py-1 rounded font-medium ${getDifficultyColor(rec.difficulty)}`}>
                        {rec.difficulty.charAt(0).toUpperCase() + rec.difficulty.slice(1)}
                      </span>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="flex items-center gap-1 justify-end text-green-600 dark:text-green-400">
                      <DollarSign className="w-5 h-5" />
                      <span className="text-2xl font-bold">
                        {rec.savings.toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      /month potential
                    </p>
                  </div>
                </div>

                <p className="text-slate-600 dark:text-slate-300 mb-3">
                  {rec.description}
                </p>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                    <TrendingDown className="w-4 h-4" />
                    <span className="text-sm font-semibold">ROI: {rec.roi}%</span>
                  </div>
                  <button className="btn-primary">
                    View Details
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
        <p className="text-blue-900 dark:text-blue-100">
          💡 <strong>Tip:</strong> Start with "easy" difficulty recommendations to see quick wins, then work
          towards medium and hard ones for longer-term optimization.
        </p>
      </div>
    </div>
  )
}
