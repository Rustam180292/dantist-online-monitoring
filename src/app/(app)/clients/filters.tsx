"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/components/i18n";

type Option = { id: string; name: string };

/**
 * Jadval ustunlari bo'yicha filtr qatori.
 *
 * Mijoz ko'payganda ro'yxatdan kerakligini topish qiyin bo'ladi. Filtr
 * manzilga (URL) yoziladi: shunda sahifani yangilasa ham, havolani birovga
 * yuborsa ham o'sha ko'rinish qoladi, va saralash serverda bajariladi.
 *
 * Matn kiritilganda har bosilgan harfga so'rov yubormaslik uchun yarim soniya
 * kutiladi.
 */
export function ClientFilters({
  branches,
  specialists,
  statuses,
  ages,
}: {
  branches: Option[];
  specialists: Option[];
  statuses: Option[];
  ages: number[];
}) {
  const t = useT();
  const router = useRouter();
  const params = useSearchParams();
  const [name, setName] = useState(params.get("n") ?? "");
  const [phone, setPhone] = useState(params.get("p") ?? "");
  const typed = useRef(false);

  const apply = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    router.replace(next.toString() ? `/clients?${next}` : "/clients");
  };

  // Matnli maydonlar: yozib bo'lgandan keyin yuboriladi
  useEffect(() => {
    if (!typed.current) return;
    const timer = setTimeout(() => apply({ n: name.trim(), p: phone.trim() }), 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, phone]);

  const cell =
    "w-full min-w-[104px] rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-800 " +
    "placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none " +
    "dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200";

  const active =
    name || phone || params.get("age") || params.get("sp") ||
    params.get("b") || params.get("st") || params.get("tg");

  return (
    <tr className="border-b border-slate-200 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-900/40">
      <td className="px-4 py-2">
        <input
          value={name}
          onChange={(e) => {
            typed.current = true;
            setName(e.target.value);
          }}
          placeholder={t("Ism")}
          aria-label={t("Ism bo'yicha filtr")}
          className={cell}
        />
      </td>
      <td className="px-4 py-2">
        <select
          value={params.get("age") ?? ""}
          onChange={(e) => apply({ age: e.target.value })}
          aria-label={t("Yosh bo'yicha filtr")}
          className={cell}
        >
          <option value="">{t("Hammasi")}</option>
          {ages.map((a) => (
            <option key={a} value={String(a)}>
              {t("{n} yosh", { n: a })}
            </option>
          ))}
        </select>
      </td>
      {branches.length > 0 ? (
        <td className="px-4 py-2">
          <select
            value={params.get("b") ?? ""}
            onChange={(e) => apply({ b: e.target.value })}
            aria-label={t("Filial bo'yicha filtr")}
            className={cell}
          >
            <option value="">{t("Hammasi")}</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </td>
      ) : null}
      <td className="px-4 py-2">
        <select
          value={params.get("sp") ?? ""}
          onChange={(e) => apply({ sp: e.target.value })}
          aria-label={t("Mutaxassis bo'yicha filtr")}
          className={cell}
        >
          <option value="">{t("Hammasi")}</option>
          {specialists.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </td>
      <td className="px-4 py-2">
        <input
          value={phone}
          onChange={(e) => {
            typed.current = true;
            setPhone(e.target.value);
          }}
          placeholder={t("Telefon")}
          aria-label={t("Telefon bo'yicha filtr")}
          className={cell}
        />
        {/* Telegram'ga ulanmagan ota-onaga eslatma bormaydi — ularni bir
            bosishda ajratib olish kerak */}
        <select
          value={params.get("tg") ?? ""}
          onChange={(e) => apply({ tg: e.target.value })}
          aria-label={t("Telegram bo'yicha filtr")}
          className={`${cell} mt-1`}
        >
          <option value="">{t("Telegram: hammasi")}</option>
          <option value="bor">{t("Ulangan")}</option>
          <option value="yoq">{t("Ulanmagan")}</option>
        </select>
      </td>
      <td className="px-4 py-2">
        <select
          value={params.get("st") ?? ""}
          onChange={(e) => apply({ st: e.target.value })}
          aria-label={t("Holat bo'yicha filtr")}
          className={cell}
        >
          <option value="">{t("Hammasi")}</option>
          {statuses.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        {active ? (
          <button
            type="button"
            onClick={() => {
              typed.current = false;
              setName("");
              setPhone("");
              router.replace("/clients");
            }}
            className="mt-1 text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
          >
            {t("Tozalash")}
          </button>
        ) : null}
      </td>
    </tr>
  );
}
