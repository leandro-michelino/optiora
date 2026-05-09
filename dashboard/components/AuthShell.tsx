import Link from 'next/link'
import { ReactNode } from 'react'
import { Cloud, ShieldCheck, Sparkles, Zap } from 'lucide-react'

export function AuthRedirectState({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-200">
      <div className="screen-card max-w-md border-slate-800 bg-slate-900 p-6 text-center">
        <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600">
          <Zap className="h-5 w-5 text-white" />
        </div>
        {children}
      </div>
    </div>
  )
}

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(420px,0.82fr)]">
        <section className="relative hidden overflow-hidden border-r border-white/10 bg-slate-900 lg:flex">
          <div className="absolute inset-x-0 top-0 h-1 bg-blue-600" />
          <div className="relative flex w-full flex-col justify-between p-10">
            <Link href="/" className="flex w-fit items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 shadow-sm">
                <Cloud className="h-5 w-5 text-white" />
              </div>
              <span className="text-xl font-semibold tracking-tight">OptiOra</span>
            </Link>

            <div className="max-w-xl">
              <div className="mb-5 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200">
                <ShieldCheck className="h-4 w-4 text-emerald-300" />
                Secure workspace access
              </div>
              <h2 className="text-4xl font-semibold leading-tight tracking-tight">
                Cost operations need a calm control plane.
              </h2>
              <p className="mt-4 max-w-lg text-base leading-7 text-slate-300">
                Connect cloud billing, scan real provider signals, and keep every recommendation tied to auditable source data.
              </p>
            </div>

            <div className="grid max-w-xl grid-cols-3 gap-3">
              {[
                ['4', 'Providers'],
                ['0', 'Synthetic rows'],
                ['24/7', 'Ops view'],
              ].map(([value, label]) => (
                <div key={label} className="rounded-lg border border-white/10 bg-white/5 p-4">
                  <div className="text-2xl font-semibold">{value}</div>
                  <div className="mt-1 text-xs font-medium uppercase tracking-[0.14em] text-slate-400">
                    {label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <main className="flex min-h-screen items-center justify-center px-4 py-8 sm:px-6 lg:px-10">
          <div className="w-full max-w-md">
            <Link href="/" className="mb-8 flex items-center gap-3 lg:hidden">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 shadow-sm">
                <Cloud className="h-5 w-5 text-white" />
              </div>
              <span className="text-xl font-semibold tracking-tight">OptiOra</span>
            </Link>

            <div className="screen-card border-slate-800 bg-slate-900/95 p-6 shadow-2xl shadow-slate-950/40 sm:p-8">
              <div className="mb-7">
                <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600/15 text-blue-300 ring-1 ring-blue-400/20">
                  <Sparkles className="h-4 w-4" />
                </div>
                <h1 className="text-2xl font-semibold tracking-tight text-white">{title}</h1>
                <p className="mt-2 text-sm leading-6 text-slate-400">{subtitle}</p>
              </div>
              {children}
            </div>

            {footer && <div className="mt-5 text-center text-sm text-slate-400">{footer}</div>}
          </div>
        </main>
      </div>
    </div>
  )
}
