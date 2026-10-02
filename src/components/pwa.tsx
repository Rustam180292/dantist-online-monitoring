"use client";

import { useEffect } from "react";

/** Xizmat ishchisini ro'yxatdan o'tkazadi (ilovani o'rnatish uchun kerak) */
export function PwaRegister() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

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
