'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import ProtectedRoute from '@/components/ProtectedRoute'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Cloud, BarChart3, AlertTriangle, Lightbulb, Settings, Brain, MessageCircle, TrendingUp, Zap, Grid, LogOut, Activity } from 'lucide-react'

function DashboardLayoutContent({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const { authEnabled, user, organization, logout } = useAuth()

  const mainNavItems = [
    { href: '/dashboard', label: 'Overview', icon: BarChart3 },
    { href: '/dashboard/my-dashboards', label: 'My Dashboards', icon: Grid },
    { href: '/dashboard/costs', label: 'Cloud Costs', icon: Cloud },
  ]

  const aiNavItems = [
    { href: '/dashboard/ai-insights', label: 'AI Insights', icon: Brain },
    { href: '/dashboard/cost-advisor', label: 'Cost Advisor', icon: MessageCircle },
    { href: '/dashboard/forecasting', label: 'Forecasting', icon: TrendingUp },
  ]

  const otherNavItems = [
    { href: '/dashboard/operations', label: 'Operations', icon: Activity },
    { href: '/dashboard/anomalies', label: 'Anomalies', icon: AlertTriangle },
    { href: '/dashboard/recommendations', label: 'Recommendations', icon: Lightbulb },
    { href: '/dashboard/settings', label: 'Settings', icon: Settings },
  ]

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900">
      {/* Sidebar */}
      <aside className="w-72 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 flex flex-col shadow-sm">
        {/* Logo */}
        <div className="p-6 border-b border-slate-200 dark:border-slate-700">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg flex items-center justify-center group-hover:shadow-lg transition">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              OptiOra
            </h1>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-6 space-y-8 overflow-y-auto">
          
          {/* Main Section */}
          <div>
            <p className="px-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
              Dashboard
            </p>
            <div className="space-y-1">
              {mainNavItems.map((item) => {
                const Icon = item.icon
                const active = isActive(item.href)
                
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all ${
                      active
                        ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 font-medium'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50'
                    }`}
                  >
                    <Icon className={`w-5 h-5 flex-shrink-0 ${active ? 'text-blue-600 dark:text-blue-400' : ''}`} />
                    <span className="text-sm">{item.label}</span>
                    {active && (
                      <div className="ml-auto w-1.5 h-1.5 bg-blue-600 dark:bg-blue-400 rounded-full"></div>
                    )}
                  </Link>
                )
              })}
            </div>
          </div>

          {/* AI Section */}
          <div>
            <p className="px-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <span className="inline-block w-4 h-4 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full"></span>
              AI Features
            </p>
            <div className="space-y-1">
              {aiNavItems.map((item) => {
                const Icon = item.icon
                const active = isActive(item.href)
                
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all ${
                      active
                        ? 'bg-purple-50 dark:bg-purple-950/30 text-purple-600 dark:text-purple-400 font-medium'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50'
                    }`}
                  >
                    <Icon className={`w-5 h-5 flex-shrink-0 ${active ? 'text-purple-600 dark:text-purple-400' : ''}`} />
                    <span className="text-sm">{item.label}</span>
                    {active && (
                      <div className="ml-auto w-1.5 h-1.5 bg-purple-600 dark:bg-purple-400 rounded-full"></div>
                    )}
                  </Link>
                )
              })}
            </div>
          </div>

          {/* Other Section */}
          <div>
            <p className="px-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
              Management
            </p>
            <div className="space-y-1">
              {otherNavItems.map((item) => {
                const Icon = item.icon
                const active = isActive(item.href)
                
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all ${
                      active
                        ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 font-medium'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50'
                    }`}
                  >
                    <Icon className={`w-5 h-5 flex-shrink-0 ${active ? 'text-blue-600 dark:text-blue-400' : ''}`} />
                    <span className="text-sm">{item.label}</span>
                    {active && (
                      <div className="ml-auto w-1.5 h-1.5 bg-blue-600 dark:bg-blue-400 rounded-full"></div>
                    )}
                  </Link>
                )
              })}
            </div>
          </div>
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-700 space-y-3">
          <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900 rounded-lg">
            <div className="text-sm">
              <p className="font-medium text-slate-900 dark:text-white">{user?.full_name || user?.email}</p>
              <p className="text-xs text-slate-600 dark:text-slate-400">{user?.email}</p>
              {organization && (
                <p className="text-xs text-slate-500 dark:text-slate-500">
                  {organization.name} · {organization.role}
                </p>
              )}
            </div>
            {authEnabled && (
              <button
                onClick={logout}
                className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded transition"
                title="Logout"
              >
                <LogOut className="w-4 h-4 text-slate-600 dark:text-slate-400" />
              </button>
            )}
          </div>
          <ThemeToggle />
          <div className="text-xs text-slate-600 dark:text-slate-400 p-2 bg-slate-50 dark:bg-slate-900 rounded-lg">
            <p className="font-medium mb-1">💡 Tip</p>
            <p>Use the AI Insights page to discover hidden cost optimization opportunities.</p>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <div className="p-8">
          {children}
        </div>
      </main>
    </div>
  )
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ProtectedRoute>
      <DashboardLayoutContent>{children}</DashboardLayoutContent>
    </ProtectedRoute>
  )
}
