"use client"

import * as React from "react"
import { ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"

interface ExpanderProps {
  title: React.ReactNode
  description?: React.ReactNode
  icon?: React.ReactNode
  actions?: React.ReactNode
  defaultOpen?: boolean
  children: React.ReactNode
  className?: string
  contentClassName?: string
}

function Expander({
  title,
  description,
  icon,
  actions,
  defaultOpen = false,
  children,
  className,
  contentClassName,
}: ExpanderProps) {
  const [open, setOpen] = React.useState(defaultOpen)

  return (
    <section
      className={cn(
        "overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900",
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="flex min-w-0 flex-1 items-start gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          {icon && <span className="mt-0.5 shrink-0 text-slate-500 dark:text-slate-400">{icon}</span>}
          <span className="min-w-0 flex-1">
            <span className="block text-base font-semibold text-slate-900 dark:text-white">{title}</span>
            {description && (
              <span className="mt-0.5 block text-sm leading-5 text-slate-500 dark:text-slate-400">
                {description}
              </span>
            )}
          </span>
          <ChevronDown
            className={cn(
              "mt-0.5 h-4 w-4 shrink-0 text-slate-500 transition-transform dark:text-slate-400",
              open && "rotate-180",
            )}
          />
        </button>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>
      {open && <div className={cn("p-4", contentClassName)}>{children}</div>}
    </section>
  )
}

export { Expander }
