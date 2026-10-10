"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { Install } from "@/components/install";
import { useT } from "@/components/i18n";
import { LanguageSwitcher, ThemeToggle } from "@/components/prefs";

/** Ismdan ikki bosh harf: "Rustam Abulqosimov" -> "RA" */
function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

const iconBtn =
  "flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white";

const menuItem =
  "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800";

/**
 * Foydalanuvchi menyusi: ism, rol, telefonga o'rnatish, sozlamalar, chiqish.
 *
 * Kam ishlatiladigan narsalar shu yerga yig'ilgan — tepa panelda doim
 * ko'rinib turadigani faqat til va rejim, chunki ularni sahifaga kirgan
 * odam birinchi qidiradi.
 */
function UserMenu({
  fullName,
  roleLine,
  logout,
  compact,
}: {
  fullName: string;
  roleLine: string;
  logout: () => Promise<void>;
  compact?: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // Tashqariga bosilsa yoki Esc — yopiladi
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="user-menu"
        className={`flex items-center gap-2 rounded-full transition ${
          compact ? "" : "py-1 pl-1 pr-3 hover:bg-slate-100 dark:hover:bg-slate-800"
        }`}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">
          {initials(fullName)}
        </span>
        {compact ? null : (
          <>
            <span className="hidden text-left leading-tight xl:block">
              <span className="block max-w-[160px] truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                {fullName}
              </span>
              <span className="block max-w-[160px] truncate text-[11px] text-slate-500 dark:text-slate-400">
                {roleLine}
              </span>
            </span>
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-slate-400" aria-hidden>
              <path d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z" />
            </svg>
          </>
        )}
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-60 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          <div className="px-3 py-2">
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{fullName}</p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">{roleLine}</p>
          </div>
          <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
          <Install className={menuItem} />
          <Link href="/settings" className={menuItem} onClick={() => setOpen(false)}>
            <Icon name="gear" className="h-4 w-4" />
            {t("Sozlamalar")}
          </Link>
          <form action={logout}>
            <button type="submit" className={`${menuItem} text-rose-600 dark:text-rose-400`}>
              <Icon name="logout" className="h-4 w-4" />
              {t("Chiqish")}
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Tepa o'ng burchakdagi boshqaruv: til, rejim va foydalanuvchi menyusi.
 * Kompyuterda to'liq, telefonda ixcham (sarlavha qatoriga sig'ishi uchun).
 */
export function TopControls({
  fullName,
  roleLine,
  logout,
  compact = false,
}: {
  fullName: string;
  roleLine: string;
  logout: () => Promise<void>;
  compact?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 sm:gap-3">
      <LanguageSwitcher variant="pill" />
      <ThemeToggle iconOnly className={iconBtn} />
      {compact ? null : <span className="h-6 w-px bg-slate-200 dark:bg-slate-700" aria-hidden />}
      <UserMenu fullName={fullName} roleLine={roleLine} logout={logout} compact={compact} />
    </div>
  );
}
