"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useT } from "@/components/i18n";
import { td, th } from "@/components/ui";

export type DataColumn = {
  label: string;
  /** Tartiblab bo'lmaydigan ustun (masalan tugmalar) */
  sortable?: boolean;
  className?: string;
};

export type DataRow = {
  key: string;
  /** Kataklar serverda chiziladi (havola, belgi va h.k.) — bu yerga tayyor holda keladi */
  cells: ReactNode[];
  /** Har bir ustun uchun tartiblash qiymati; null — oxirida turadi */
  sort: (string | number | null)[];
  /** Qidiruv shu matn bo'yicha (ism, telefon, filial...) */
  search: string;
};

type Sort = { col: number; dir: 1 | -1 } | null;

/**
 * Qidiruv va ustun bo'yicha tartiblash bilan jadval.
 *
 * Nega brauzerda: bu jadvallar kichik (bitta oy, bitta kun) va ma'lumot
 * allaqachon sahifada bor — har bosishda serverga borish sekin va ortiqcha
 * bo'lardi. Kataklar esa serverda tayyorlanadi, shuning uchun havola va
 * belgilar boshqa jadvallardagidek ko'rinadi.
 *
 * Tartiblash: birinchi bosish — o'sish, ikkinchi — kamayish, uchinchi —
 * asl tartib (masalan bugungi jadvalda vaqt bo'yicha).
 */
export function DataTable({
  columns,
  rows,
  footer,
  minWidth = "min-w-[620px]",
  empty,
  testId,
}: {
  columns: DataColumn[];
  rows: DataRow[];
  /** Jami qatori. Qidiruv paytida yashiriladi — u faqat to'liq ro'yxatga to'g'ri keladi */
  footer?: ReactNode[];
  minWidth?: string;
  empty?: string;
  testId?: string;
}) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>(null);

  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    let list = q ? rows.filter((r) => r.search.toLocaleLowerCase().includes(q)) : rows;
    if (sort) {
      const { col, dir } = sort;
      list = [...list].sort((a, b) => {
        const x = a.sort[col];
        const y = b.sort[col];
        if (x === y) return 0;
        if (x === null || x === undefined) return 1;
        if (y === null || y === undefined) return -1;
        if (typeof x === "number" && typeof y === "number") return (x - y) * dir;
        return String(x).localeCompare(String(y), t.locale, { numeric: true }) * dir;
      });
    }
    return list;
  }, [rows, query, sort, t.locale]);

  function toggle(col: number) {
    setSort((s) =>
      !s || s.col !== col ? { col, dir: 1 } : s.dir === 1 ? { col, dir: -1 } : null,
    );
  }

  return (
    <div data-testid={testId}>
      <div className="border-b border-slate-200 px-4 py-2 dark:border-slate-800">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("Qidirish…")}
          aria-label={t("Jadvaldan qidirish")}
          className="w-full max-w-xs rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
        />
      </div>
      <div className="scroll-x">
        <table className={`w-full ${minWidth}`}>
          <thead className="border-b border-slate-200 dark:border-slate-800">
            <tr>
              {columns.map((c, i) => {
                const active = sort?.col === i;
                const canSort = c.sortable !== false;
                return (
                  <th
                    key={c.label + i}
                    className={`${th} ${c.className ?? ""}`}
                    aria-sort={active ? (sort!.dir === 1 ? "ascending" : "descending") : undefined}
                  >
                    {canSort ? (
                      <button
                        type="button"
                        onClick={() => toggle(i)}
                        className="inline-flex items-center gap-1 uppercase tracking-wide hover:text-slate-800 dark:hover:text-slate-200"
                        title={t("Tartiblash")}
                      >
                        {c.label}
                        <span aria-hidden className={active ? "text-indigo-600 dark:text-indigo-400" : "opacity-30"}>
                          {active && sort!.dir === -1 ? "▼" : "▲"}
                        </span>
                      </button>
                    ) : (
                      c.label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {visible.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                  {query ? t("Hech narsa topilmadi.") : (empty ?? "—")}
                </td>
              </tr>
            ) : (
              visible.map((r) => (
                <tr key={r.key}>
                  {r.cells.map((cell, i) => (
                    <td key={i} className={`${td} ${columns[i]?.className ?? ""}`}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
          {footer && !query.trim() ? (
            <tfoot className="border-t border-slate-200 dark:border-slate-800">
              <tr className="font-semibold text-slate-800 dark:text-slate-200">
                {footer.map((cell, i) => (
                  <td key={i} className={`${td} ${columns[i]?.className ?? ""}`}>
                    {cell}
                  </td>
                ))}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </div>
  );
}
