import Link from "next/link";
import type { ReactNode } from "react";

/* ---------- Qayta ishlatiladigan klasslar ---------- */

export const card =
  "rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900";

export const input =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 " +
  "placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 " +
  "focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";

export const label = "mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400";

export const btn =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 " +
  "bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 " +
  "disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800";

export const btnPrimary =
  "inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 " +
  "text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50";

export const btnDanger =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-rose-200 " +
  "bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-100 " +
  "dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300";

export const th =
  "whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide " +
  "text-slate-500 dark:text-slate-400";

export const td = "px-4 py-3 text-sm text-slate-700 dark:text-slate-300";

/* ---------- Komponentlar ---------- */

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl dark:text-white">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function Card({
  title,
  subtitle,
  action,
  children,
  className = "",
}: {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`${card} ${className}`}>
      {title ? (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h2>
            {subtitle ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
            ) : null}
          </div>
          {action}
        </header>
      ) : null}
      {children}
    </section>
  );
}

export function StatCard({
  label: labelText,
  value,
  hint,
  tone = "default",
  href,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "good" | "warn" | "bad";
  href?: string;
}) {
  const tones = {
    default: "text-slate-900 dark:text-white",
    good: "text-emerald-600 dark:text-emerald-400",
    warn: "text-amber-600 dark:text-amber-400",
    bad: "text-rose-600 dark:text-rose-400",
  };
  const body = (
    <div className={`${card} p-4 ${href ? "transition hover:border-indigo-300" : ""}`}>
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{labelText}</p>
      <p className={`mt-1.5 text-2xl font-bold tabular-nums ${tones[tone]}`}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{hint}</p> : null}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export function Badge({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
        className || "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700"
      }`}
    >
      {children}
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
      {children}
    </p>
  );
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-300">
      {message}
    </p>
  );
}
