import React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

export function PageHeader({
  title,
  subtitle,
  breadcrumbs,
  primaryAction,
  secondaryActions,
}: {
  title: string;
  subtitle?: string;
  breadcrumbs?: Array<{ label: string; href?: string }>;
  primaryAction?: React.ReactNode;
  secondaryActions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-5 border-b border-slate-200/80">
      <div className="space-y-1 min-w-0">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav className="flex items-center gap-1 text-xs text-slate-500 mb-1" aria-label="Breadcrumb">
            {breadcrumbs.map((bc, idx) => (
              <React.Fragment key={bc.label}>
                {idx > 0 && <ChevronRight className="w-3 h-3 text-slate-400" />}
                {bc.href ? (
                  <Link href={bc.href} className="hover:text-slate-900 transition-colors">
                    {bc.label}
                  </Link>
                ) : (
                  <span className="text-slate-700 font-medium">{bc.label}</span>
                )}
              </React.Fragment>
            ))}
          </nav>
        )}
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-900 truncate">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
      </div>

      {(secondaryActions || primaryAction) && (
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {secondaryActions}
          {primaryAction}
        </div>
      )}
    </div>
  );
}

