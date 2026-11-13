"use client";
import type { ButtonHTMLAttributes, ReactNode } from "react";

const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(" ");

export function Button({ variant = "secondary", className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" }) {
  const v = {
    primary: "bg-ink text-paper hover:bg-brand-dark border-ink",
    secondary: "bg-white text-ink hover:border-ink/40 border-line",
    ghost: "bg-transparent text-ink underline decoration-line underline-offset-4 hover:decoration-ink border-transparent px-1.5",
    danger: "bg-white text-crit hover:border-crit/50 border-line",
  }[variant];
  return <button {...p} className={cx("inline-flex items-center justify-center gap-1.5 rounded-[5px] border px-3 py-1.5 text-[13px] font-medium disabled:cursor-not-allowed disabled:opacity-45", v, className)} />;
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cx("rounded-md border border-line bg-white shadow-[0_1px_0_rgba(28,27,24,0.03)]", className)}>{children}</section>;
}

const TONES: Record<string, string> = {
  critical: "border-crit/40 text-crit",
  major: "border-major/40 text-major",
  minor: "border-minor/40 text-minor",
  green: "border-brand/40 text-brand",
  grey: "border-line text-muted",
  ink: "border-ink bg-ink text-paper",
};
export function Badge({ tone = "grey", children }: { tone?: string; children: ReactNode }) {
  return <span className={cx("inline-flex items-center whitespace-nowrap rounded-[3px] border px-1.5 py-px font-sans text-[10.5px] font-medium uppercase tracking-[0.06em]", TONES[tone] ?? TONES.grey)}>{children}</span>;
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

export const inputCls = "w-full rounded-[5px] border border-line bg-white px-2.5 py-1.5 text-sm placeholder:text-muted/60 focus:border-ink/50 focus:outline-none focus-visible:outline-none";

export function Notice({ tone = "info", children }: { tone?: "info" | "error" | "ok"; children: ReactNode }) {
  const c = { info: "border-line bg-mist text-ink", error: "border-crit/30 bg-crit-soft text-crit", ok: "border-brand/30 bg-brand-soft text-brand-dark" }[tone];
  return <div role={tone === "error" ? "alert" : "status"} className={cx("rounded-md border px-3 py-2 text-sm", c)}>{children}</div>;
}

export function PageHead({ title, sub, action }: { title: string; sub?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="tracking-tight">{title}</h1>
        {sub && <p className="mt-1 max-w-3xl text-sm text-muted">{sub}</p>}
      </div>
      {action}
    </div>
  );
}
