"use client";

import { useState } from "react";
import { useT } from "@/components/i18n";
import { input } from "@/components/ui";

/**
 * Parol maydoni + "ko'z" tugmasi.
 *
 * Telefonda parol ko'pincha xato teriladi va nuqtalar ortida nima yozilgani
 * ko'rinmaydi — "parol noto'g'ri" chiqqanda odam o'zi tekshirib ko'ra olsin.
 * Forma yuborilganda maydon yana yashirin holatga qaytmaydi: xato bo'lsa
 * sahifa baribir qayta yuklanadi.
 */
export function PasswordInput({
  id,
  name,
  autoComplete,
  placeholder,
  required,
  minLength,
}: {
  id: string;
  name: string;
  autoComplete?: string;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
}) {
  const t = useT();
  const [shown, setShown] = useState(false);
  const label = shown ? t("Parolni yashirish") : t("Parolni ko'rsatish");

  return (
    <div className="relative">
      <input
        id={id}
        name={name}
        type={shown ? "text" : "password"}
        autoComplete={autoComplete}
        placeholder={placeholder}
        required={required}
        minLength={minLength}
        // Ko'rinib turgan parolni telefon "tuzatib" qo'ymasin
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className={`${input} pr-11`}
      />
      <button
        type="button"
        data-testid={`${id}-toggle`}
        aria-label={label}
        aria-pressed={shown}
        title={label}
        onClick={() => setShown((v) => !v)}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-slate-400 transition hover:text-slate-700 dark:hover:text-slate-200"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="h-5 w-5"
        >
          <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
          <circle cx="12" cy="12" r="3" />
          {shown ? null : <path d="M4 4l16 16" />}
        </svg>
      </button>
    </div>
  );
}
