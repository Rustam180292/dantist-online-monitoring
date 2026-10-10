"use client";

import { useState } from "react";
import { useT } from "@/components/i18n";

/** Matnni bir bosishda nusxalash — skriptni qo'lda belgilab olish telefonda noqulay */
export function CopyButton({ text, className = "" }: { text: string; className?: string }) {
  const t = useT();
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 2000);
        } catch {
          // Nusxalashga ruxsat bo'lmasa — matn ko'rinib turibdi, qo'lda olinadi
        }
      }}
    >
      {done ? t("Nusxalandi ✓") : t("Nusxalash")}
    </button>
  );
}
