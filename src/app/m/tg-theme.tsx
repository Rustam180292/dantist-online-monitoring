"use client";

import { useEffect } from "react";

type TgWebApp = {
  initData?: string;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  setBottomBarColor?: (color: string) => void;
};

/**
 * Telegram oynasining sarlavhasi va orqa foni kabinet rejimiga moslanadi.
 *
 * Aks holda Telegram o'z mavzusida qoladi: kabinet tungi rejimda, tepasidagi
 * Telegram sarlavhasi esa oq — "rejim ishlamayapti" ko'rinadi. Tun/kun
 * tugmasi `<html>` ga `dark` klassini qo'yadi, shuni kuzatib turamiz.
 */
export function TelegramThemeSync() {
  useEffect(() => {
    const apply = () => {
      const tg = (window as unknown as { Telegram?: { WebApp?: TgWebApp } }).Telegram?.WebApp;
      if (!tg?.initData) return;
      const color = document.documentElement.classList.contains("dark") ? "#020617" : "#effbf6";
      try {
        tg.setHeaderColor?.(color);
        tg.setBackgroundColor?.(color);
        tg.setBottomBarColor?.(color);
      } catch {
        // Eski Telegram ilovasi bu usullarni bilmasligi mumkin — kabinet baribir ishlaydi
      }
    };

    apply();
    // Telegram skripti kechroq yuklanishi mumkin — bir oz kutib yana qo'yamiz
    const late = window.setTimeout(apply, 800);
    const observer = new MutationObserver(apply);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => {
      window.clearTimeout(late);
      observer.disconnect();
    };
  }, []);

  return null;
}
