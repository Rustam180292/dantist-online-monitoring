"use client";

import { useEffect } from "react";

/**
 * Xizmat ishchisini ro'yxatdan o'tkazadi (ilovani telefonga o'rnatish uchun kerak).
 *
 * Ishlab chiqish rejimida u ataylab o'chiriladi: lokalda kod tez-tez
 * o'zgaradi, xizmat ishchisi esa eski fayllarni ushlab qolib
 * "o'zgartirdim, lekin ko'rinmayapti" degan chalkashlik tug'diradi.
 * Shuningdek server to'xtaganda "aloqa yo'q" sahifasini ko'rsatadi,
 * holbuki aslida shunchaki server ishlamayotgan bo'ladi.
 */
export function PwaRegister() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      // Avval o'rnatilgan bo'lsa — olib tashlaymiz va keshni tozalaymiz
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => {
          for (const registration of registrations) registration.unregister();
        })
        .catch(() => {});

      if (typeof caches !== "undefined") {
        caches
          .keys()
          .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
          .catch(() => {});
      }
      return;
    }

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Ro'yxatdan o'tmasa ham ilova oddiy sayt sifatida ishlayveradi
      });
    };

    if (document.readyState === "complete") {
      register();
      return;
    }
    window.addEventListener("load", register);
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
