import React from "react";
import { cn } from "@/lib/utils";

export function Card({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "bg-white border border-slate-200 rounded-xl shadow-[0_1px_2px_rgba(15,23,42,0.04)]",
        className
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: React.ReactNode;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-4", className)}>
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-slate-900 truncate">{title}</h2>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function CardContent({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("p-5", className)}>{children}</div>;
}

type StatTone = "neutral" | "success" | "danger" | "warning" | "info";

const statToneIconBg: Record<StatTone, string> = {
  neutral: "bg-slate-100 text-slate-600",
  success: "bg-emerald-50 text-emerald-600",
  danger: "bg-red-50 text-red-600",
  warning: "bg-amber-50 text-amber-600",
  info: "bg-blue-50 text-blue-600",
};

const statToneValue: Record<StatTone, string> = {
  neutral: "text-slate-900",
  success: "text-emerald-700",
  danger: "text-red-700",
  warning: "text-amber-700",
  info: "text-blue-700",
};

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "neutral",
  onClick,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon: React.ReactNode;
  tone?: StatTone;
  onClick?: () => void;
  className?: string;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "bg-white border border-slate-200 rounded-xl p-4 text-left shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all w-full",
        onClick && "hover:border-slate-300 hover:shadow-sm cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
        className
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium text-slate-500">{label}</span>
        <span className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", statToneIconBg[tone])}>
          {icon}
        </span>
      </div>
      <div className={cn("text-2xl font-semibold tracking-tight mt-2 tabular-nums", statToneValue[tone])}>
        {value}
      </div>
      {hint && <div className="text-xs text-slate-500 mt-1 truncate">{hint}</div>}
    </Tag>
  );
}

