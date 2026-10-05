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
 * Amal bajarilmaganda chiqadigan xabar.
 *
 * Server action cookie qoldiradi, bu komponent uni ko'rib, ko'rsatadi va
 * darhol o'chiradi. Tekshirish qisqa oraliqda qilinadi, chunki server
 * action tugaganda brauzerga alohida xabar kelmaydi.
 */
export function Flash() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const check = () => {
      const found = readFlash();
      if (found) {
        clearFlash();
        setMessage(found);
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
      <div className="flex w-full max-w-md items-start gap-3 rounded-xl bg-rose-600 px-4 py-3 text-sm text-white shadow-lg">
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
