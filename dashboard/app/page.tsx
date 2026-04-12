import Link from 'next/link'
import { ArrowRight, Cloud, TrendingDown, Zap } from 'lucide-react'

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      {/* Header */}
      <header className="border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
        <div className="max-w-7xl mx-auto px-4 py-6 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Cloud className="w-8 h-8 text-blue-600" />
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">OptiOra</h1>
          </div>
          <Link href="/dashboard" className="btn-primary">
            Launch Dashboard
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-4 py-20 text-center">
        <h2 className="text-5xl font-bold text-slate-900 dark:text-white mb-4">
          Multi-Cloud Cost Optimization
        </h2>
        <p className="text-xl text-slate-600 dark:text-slate-300 mb-8 max-w-2xl mx-auto">
          Unified visibility and control over your AWS, Azure, GCP, and OCI cloud costs
        </p>

        <div className="grid md:grid-cols-3 gap-8 my-16">
          <div className="metric-card">
            <TrendingDown className="w-12 h-12 text-green-500 mb-4 mx-auto" />
            <h3 className="text-lg font-semibold mb-2">Anomaly Detection</h3>
            <p className="text-slate-600 dark:text-slate-400">
              Identify unusual spending patterns and cost spikes instantly
            </p>
          </div>

          <div className="metric-card">
            <Zap className="w-12 h-12 text-yellow-500 mb-4 mx-auto" />
            <h3 className="text-lg font-semibold mb-2">Smart Recommendations</h3>
            <p className="text-slate-600 dark:text-slate-400">
              Get AI-powered optimization suggestions ranked by ROI
            </p>
          </div>

          <div className="metric-card">
            <Cloud className="w-12 h-12 text-blue-500 mb-4 mx-auto" />
            <h3 className="text-lg font-semibold mb-2">Multi-Cloud Support</h3>
            <p className="text-slate-600 dark:text-slate-400">
              Manage all four clouds from a single unified dashboard
            </p>
          </div>
        </div>

        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 btn-primary text-lg"
        >
          Get Started <ArrowRight className="w-5 h-5" />
        </Link>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-700 py-8 mt-20">
        <div className="max-w-7xl mx-auto px-4 text-center text-slate-600 dark:text-slate-400">
          <p>OptiOra - Intelligent Cloud Cost Management</p>
        </div>
      </footer>
    </div>
  )
}
