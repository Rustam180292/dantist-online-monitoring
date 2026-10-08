"use client";

import { useState } from "react";
import { useT } from "@/components/i18n";
import { input, label } from "@/components/ui";

/**
 * Qabul formasidagi "Filial" va "Kim ko'radi" maydonlari.
 *
 * Mutaxassis ro'yxati tanlangan filialga qarab qisqaradi: boshqa filial
 * mutaxassisini tanlab qo'yish mumkin bo'lmasin (server ham buni rad etadi,
 * lekin xatoni forma yuborilgandan keyin emas, tanlashning o'zida oldini
 * olgan yaxshi). Filial oldindan tanlanmaydi — birinchi turgan filialga
 * e'tiborsiz yozib yuborilmasin.
 *
 * Filial ro'yxati bo'sh bo'lsa (ega bo'lmagan xodim) — filial maydoni
 * ko'rinmaydi, mutaxassislar allaqachon uning filialidan.
 */
export function BranchSpecialistFields({
  branches,
  specialists,
}: {
  branches: { id: string; name: string }[];
  specialists: { id: string; label: string; branchId: string }[];
}) {
  const t = useT();
  const pickBranch = branches.length > 0;
  const [branchId, setBranchId] = useState("");
  const [specialistId, setSpecialistId] = useState("");

  const options = pickBranch ? specialists.filter((s) => s.branchId === branchId) : specialists;
  const waiting = pickBranch && !branchId;

  return (
    <>
      {pickBranch ? (
        <div>
          <label className={label} htmlFor="branchId">
            {t("Filial")} *
          </label>
          <select
            id="branchId"
            name="branchId"
            className={input}
            required
            value={branchId}
            onChange={(e) => {
              setBranchId(e.target.value);
              // Oldingi filial mutaxassisi yangisida yo'q — tanlov tozalanadi
              setSpecialistId("");
            }}
          >
            <option value="" disabled>
              {t("Filialni tanlang")}
            </option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div>
        <label className={label} htmlFor="specialistId">
          {t("Kim ko'radi")}
        </label>
        <select
          id="specialistId"
          name="specialistId"
          className={input}
          value={specialistId}
          onChange={(e) => setSpecialistId(e.target.value)}
          disabled={waiting}
        >
          <option value="">{waiting ? t("Avval filialni tanlang") : t("Hali aniq emas")}</option>
          {options.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        {!waiting && options.length === 0 ? (
          <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
            {t("Bu filialda mutaxassis yo'q — Xodimlar bo'limidan qo'shing.")}
          </p>
        ) : null}
      </div>
    </>
  );
}
