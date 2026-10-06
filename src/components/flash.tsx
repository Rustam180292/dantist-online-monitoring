"use client";

import { useEffect, useState } from "react";

const COOKIE = "logoped_flash";

function readFlash(): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE}=([^;]*)`));
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

function clearFlash() {
  document.cookie = `${COOKIE}=; Max-Age=0; path=/`;
}

/**
 * Amal natijasi haqida qisqa xabar: yashil — bajarildi, qizil — xato.
 *
 * Server action cookie qoldiradi, bu komponent uni ko'rib, ko'rsatadi va
 * darhol o'chiradi. Tekshirish qisqa oraliqda qilinadi, chunki server
 * action tugaganda brauzerga alohida xabar kelmaydi.
 */
export function Flash() {
  const [message, setMessage] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    const check = () => {
      const found = readFlash();
      if (found) {
        clearFlash();
        const good = found.startsWith("ok:");
        setOk(good);
        setMessage(found.replace(/^(ok|err):/, ""));
      }
    };
    check();
    const timer = setInterval(check, 500);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 8000);
    return () => clearTimeout(timer);
  }, [message]);

  if (!message) return null;

  return (
    <div
      role="alert"
      className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-4"
    >
      <div
        className={`flex w-full max-w-md items-start gap-3 rounded-xl px-4 py-3 text-sm text-white shadow-lg ${
          ok ? "bg-emerald-600" : "bg-rose-600"
        }`}
      >
        <span className="flex-1">{message}</span>
        <button
          type="button"
          onClick={() => setMessage(null)}
          aria-label="Yopish"
          className="shrink-0 text-white/80 hover:text-white"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
