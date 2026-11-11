import React from "react";
import { BadgeTone, cn, getStatusMeta } from "@/lib/utils";

const toneClasses: Record<BadgeTone, string> = {
  success: "bg-emerald-50 text-emerald-700 border-emerald-200",
  danger: "bg-red-50 text-red-700 border-red-200",
  warning: "bg-amber-50 text-amber-700 border-amber-200",
  info: "bg-blue-50 text-blue-700 border-blue-200",
  neutral: "bg-slate-100 text-slate-700 border-slate-200",
};

const dotClasses: Record<BadgeTone, string> = {
  success: "bg-emerald-500",
  danger: "bg-red-500",
  warning: "bg-amber-500",
  info: "bg-blue-500",
  neutral: "bg-slate-400",
};

export function Badge({
  children,
  tone = "neutral",
  dot = false,
  className,
}: {
  children: React.ReactNode;
  tone?: BadgeTone;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-xs font-medium whitespace-nowrap",
        toneClasses[tone],
        className
      )}
    >
      {dot && <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", dotClasses[tone])} />}
      {children}
    </span>
  );
}

export function StatusBadge({
  status,
  dot = true,
  labelOverride,
  className,
}: {
  status?: string | null;
  dot?: boolean;
  labelOverride?: string;
  className?: string;
}) {
  const meta = getStatusMeta(status);
  return (
    <Badge tone={meta.tone} dot={dot} className={className}>
      {labelOverride || meta.label}
    </Badge>
  );
}

