"use client";
import type { ButtonHTMLAttributes, ReactNode } from "react";

const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(" ");

export function Button({ variant = "secondary", className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" }) {
  const v = {
    primary: "bg-brand text-white hover:bg-brand-dark border-brand",
    secondary: "bg-white text-ink hover:bg-mist border-line",
    ghost: "bg-transparent text-brand hover:bg-brand-soft border-transparent",
    danger: "bg-white text-crit hover:bg-crit-soft border-line",
  }[variant];
  return <button {...p} className={cx("inline-flex items-center justify-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50", v, className)} />;
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cx("rounded-lg border border-line bg-white", className)}>{children}</section>;
}

const TONES: Record<string, string> = {
  critical: "bg-crit-soft text-crit",
  major: "bg-major-soft text-major",
  minor: "bg-minor-soft text-minor",
  green: "bg-brand-soft text-brand-dark",
  grey: "bg-mist text-muted border border-line",
  ink: "bg-ink text-white",
};
export function Badge({ tone = "grey", children }: { tone?: string; children: ReactNode }) {
  return <span className={cx("inline-flex items-center whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-medium", TONES[tone] ?? TONES.grey)}>{children}</span>;
}

export const STATUS: Record<string, { label: string; tone: string }> = {
  draft: { label: "With creator", tone: "grey" },
  changes_requested: { label: "Changes requested", tone: "major" },
  brand_review: { label: "With brand reviewer", tone: "minor" },
  compliance_review: { label: "With compliance", tone: "critical" },
  approved: { label: "Approved", tone: "green" },
};

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="font-medium">{label}</span>
      {hint && <span className="ml-1 text-muted">{hint}</span>}
      <div className="mt-1">{children}</div>
    </label>
  );
}

export const inputCls = "w-full rounded-md border border-line bg-white px-2.5 py-1.5 text-sm placeholder:text-muted/70";

export function Notice({ tone = "info", children }: { tone?: "info" | "error" | "ok"; children: ReactNode }) {
  const c = { info: "border-line bg-mist text-ink", error: "border-crit/30 bg-crit-soft text-crit", ok: "border-brand/30 bg-brand-soft text-brand-dark" }[tone];
  return <div role={tone === "error" ? "alert" : "status"} className={cx("rounded-md border px-3 py-2 text-sm", c)}>{children}</div>;
}

export function PageHead({ title, sub, action }: { title: string; sub?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {sub && <p className="mt-1 max-w-3xl text-sm text-muted">{sub}</p>}
      </div>
      {action}
    </div>
  );
}
