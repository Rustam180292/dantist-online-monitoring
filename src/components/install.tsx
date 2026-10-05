"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type TelegramWindow = Window & { Telegram?: { WebApp?: { initData?: string } } };
type IosNavigator = Navigator & { standalone?: boolean };

/**
 * Ilovani telefonga o'rnatish taklifi.
 *
 * Android/Chrome brauzeri `beforeinstallprompt` hodisasini bersa — bir bosishda
 * o'rnatadi. Aks holda (iPhone, Safari) qo'lda o'rnatish yo'riqnomasiga
 * — `/install` sahifasiga — olib boradi.
 *
 * Ilova allaqachon o'rnatilgan bo'lsa yoki Telegram ichida ochilgan bo'lsa
 * hech nima ko'rsatilmaydi: u yerda o'rnatishning ma'nosi yo'q.
 */
export function Install({
  variant = "link",
  className,
}: {
  variant?: "link" | "banner";
  className?: string;
}) {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    const inTelegram = Boolean((window as TelegramWindow).Telegram?.WebApp?.initData);
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as IosNavigator).standalone === true;
    if (inTelegram || standalone) return;

    setHidden(false);

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPrompt);
    };
    const onInstalled = () => setHidden(true);

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (hidden) return null;

  const install = async () => {
    if (!prompt) return;
    await prompt.prompt();
    const choice = await prompt.userChoice;
    setPrompt(null);
    if (choice.outcome === "accepted") setHidden(true);
  };

  if (variant === "banner") {
    return (
      <div
        className={`flex items-center gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 dark:border-indigo-900 dark:bg-indigo-950 ${className ?? ""}`}
      >
        <Icon name="phone" className="h-5 w-5 shrink-0 text-indigo-600 dark:text-indigo-400" />
        <p className="flex-1 text-sm leading-snug text-indigo-900 dark:text-indigo-200">
          Kabinetni telefon ekraniga ilova qilib qo&apos;yish mumkin.
        </p>
        {prompt ? (
          <button
            type="button"
            onClick={install}
            className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white"
          >
            O&apos;rnatish
          </button>
        ) : (
          <a
            href="/install"
            className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white"
          >
            O&apos;rnatish
          </a>
        )}
        <button
          type="button"
          onClick={() => setHidden(true)}
          aria-label="Yopish"
          className="shrink-0 text-indigo-400 dark:text-indigo-500"
        >
          ✕
        </button>
      </div>
    );
  }

  if (prompt) {
    return (
      <button type="button" onClick={install} className={className}>
        <Icon name="phone" className="h-4 w-4" />
        Telefonga o&apos;rnatish
      </button>
    );
  }

  return (
    <a href="/install" className={className}>
      <Icon name="phone" className="h-4 w-4" />
      Telefonga o&apos;rnatish
    </a>
  );
}
