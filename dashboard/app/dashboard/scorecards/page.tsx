'use client'

import { useEffect, useState } from 'react'
import { Award, Loader, RefreshCw, TrendingUp } from 'lucide-react'
import { fetchScorecards } from '@/lib/api'
import { ScorecardsResponse, ScorecardEntry } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Expander } from '@/components/ui/expander'

function gradeColor(grade: string): string {
  if (grade === 'A+' || grade === 'A') return 'text-emerald-600 dark:text-emerald-400'
  if (grade === 'B') return 'text-blue-600 dark:text-blue-400'
  if (grade === 'C') return 'text-amber-600 dark:text-amber-400'
  return 'text-rose-600 dark:text-rose-400'
}

function gradeBg(grade: string): string {
  if (grade === 'A+' || grade === 'A') return 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200'
  if (grade === 'B') return 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-200'
  if (grade === 'C') return 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200'
  return 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-200'
}

function DimensionBar({ score, maxScore, label }: { score: number; maxScore: number; label: string }) {
  const pct = Math.min((score / maxScore) * 100, 100)
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
        <span>{label}</span>
        <span>{score.toFixed(0)}/{maxScore}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div
          className="h-1.5 rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function ScorecardCard({ team }: { team: ScorecardEntry }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <Card className="rounded-xl">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <p className="font-semibold capitalize text-slate-900 dark:text-white">{team.team}</p>
              <Badge className={`rounded-md border text-xs font-bold ${gradeBg(team.grade)}`}>
                {team.grade}
              </Badge>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {team.cost_usd > 0 ? `$${team.cost_usd.toLocaleString()} · ${team.share_percent.toFixed(1)}% of org` : 'Configure business mapping rules to see cost attribution'}
            </p>
          </div>
          <div className="text-center shrink-0">
            <p className={`text-3xl font-bold ${gradeColor(team.grade)}`}>{team.total_score.toFixed(0)}</p>
            <p className="text-xs text-slate-400">/100</p>
          </div>
        </div>

        {/* Score bar */}
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div
            className="h-2 rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all"
            style={{ width: `${Math.min(team.total_score, 100)}%` }}
          />
        </div>

        {/* Expand / collapse */}
        <button
          onClick={() => setExpanded(e => !e)}
          className="mt-3 text-xs text-blue-600 hover:underline dark:text-blue-400"
        >
          {expanded ? 'Hide dimensions ▲' : 'Show dimensions ▼'}
        </button>

        {expanded && (
          <div className="mt-3 space-y-2">
            {team.dimensions.map(d => (
              <div key={d.name}>
                <DimensionBar score={d.score} maxScore={d.max_score} label={d.name} />
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 pl-0.5">{d.description}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default function ScorecardsPage() {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<ScorecardsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      setData(await fetchScorecards())
    } catch (err) {
      setData(null)
      setError(err instanceof Error ? err.message : 'Could not load scorecard data.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="mb-2 flex flex-wrap gap-2">
            <Badge variant="outline" className="rounded-md">FinOps Foundation — Scorecards</Badge>
            <Badge variant="outline" className="rounded-md">Per-Team Accountability</Badge>
          </div>
          <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-2">FinOps Scorecards</h1>
          <p className="text-slate-600 dark:text-slate-400 max-w-3xl">
            Per-team FinOps maturity scores across allocation coverage, waste reduction, tagging hygiene, and commitment coverage. Configure business mapping rules to enable team-level attribution.
          </p>
        </div>
        <Button variant="outline" onClick={() => void load()} className="rounded-lg">
          <RefreshCw className="mr-2 h-4 w-4" />Refresh
        </Button>
      </div>

      {loading ? (
        <div className="flex min-h-[300px] items-center justify-center text-slate-500">
          <Loader className="h-6 w-6 animate-spin mr-2" /> Computing scorecards...
        </div>
      ) : data ? (
        <>
          {/* Organization header */}
          <Card className="rounded-xl border-2 border-blue-200 dark:border-blue-800">
            <CardContent className="p-6">
              <div className="flex items-center gap-6">
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shrink-0">
                  <Award className="h-10 w-10 text-white" />
                </div>
                <div>
                  <p className="text-sm text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Organization Score</p>
                  <div className="flex items-baseline gap-3">
                    <span className={`text-5xl font-bold ${gradeColor(data.organization_grade)}`}>
                      {data.organization_score.toFixed(0)}
                    </span>
                    <span className="text-2xl text-slate-400">/100</span>
                    <Badge className={`rounded-lg border text-lg font-bold px-3 py-1 ${gradeBg(data.organization_grade)}`}>
                      {data.organization_grade}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    Across {data.teams.length} team{data.teams.length !== 1 ? 's' : ''} · {new Date(data.generated_at).toLocaleString()}
                  </p>
                </div>
                <div className="ml-auto hidden xl:flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-emerald-500" />
                  <span className="text-sm text-slate-600 dark:text-slate-400">Improve scores by adding business mapping rules and running scans</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Dimension legend */}
          <Expander
            title="Score Dimensions"
            description="Point weighting for allocation, waste, tagging, and commitment coverage."
            icon={<Award className="h-5 w-5" />}
          >
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {[
              { name: 'Allocation Coverage', max: 40, description: 'Cost mapped to a business dimension' },
              { name: 'Waste Reduction', max: 30, description: 'Estimated waste share of spend' },
              { name: 'Tagging Hygiene', max: 20, description: 'Resources with complete cost tags' },
              { name: 'Commitment Coverage', max: 10, description: 'RI/SP coverage for workloads' },
            ].map(d => (
              <div key={d.name} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium text-slate-700 dark:text-slate-200">{d.name}</span>
                  <span className="text-slate-400">{d.max}pts</span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">{d.description}</p>
              </div>
            ))}
          </div>
          </Expander>

          {/* Team scorecards */}
          <Expander
            title="Team Scorecards"
            description="Per-team maturity cards with optional dimension detail on each card."
            icon={<TrendingUp className="h-5 w-5" />}
            defaultOpen
          >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.teams.map(team => (
              <ScorecardCard key={team.team} team={team} />
            ))}
          </div>
          </Expander>

          {/* Call to action */}
          <Expander
            title="Improve Scores"
            description="Next step for better allocation and FinOps maturity scores."
            icon={<TrendingUp className="h-5 w-5" />}
          >
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-200">
            <strong>Improve your scores:</strong> Add business mapping rules under Cloud Costs → Business Mapping, then run a scan. Scores are calculated from real allocation coverage, waste signals, tagging, and commitment data.
          </div>
          </Expander>
        </>
      ) : (
        <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">
          {error || 'Could not load scorecard data. Check backend connectivity.'}
        </div>
      )}
    </div>
  )
}
