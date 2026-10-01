"use client";

import { useEffect, useState } from "react";

type TelegramWebApp = {
  initData?: string;
  ready?: () => void;
  expand?: () => void;
};

type State =
  | { kind: "loading" }
  | { kind: "not_linked" }
  | { kind: "outside" }
  | { kind: "error"; message: string };

export default function TelegramEntryPage() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    const tg = (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;
    tg?.ready?.();
    tg?.expand?.();

    const initData = tg?.initData ?? "";
    if (!initData) {
      setState({ kind: "outside" });
      return;
    }

    fetch("/api/tg/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData }),
    })
      .then(async (res) => {
        if (res.ok) {
          window.location.replace("/tg/app");
          return;
        }
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        if (body.error === "not_linked") setState({ kind: "not_linked" });
        else setState({ kind: "outside" });
      })
      .catch((e: unknown) => {
        setState({ kind: "error", message: e instanceof Error ? e.message : "Nomalum xatolik" });
      });
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-10">
      <div className="tg-card w-full max-w-sm p-6 text-center">
        {state.kind === "loading" ? (
          <>
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600" />
            <p className="text-sm tg-muted">Kabinet ochilmoqda…</p>
          </>
        ) : null}

        {state.kind === "not_linked" ? (
          <>
            <p className="text-base font-bold">Kabinet topilmadi</p>
            <p className="mt-2 text-sm tg-muted">
              Telegram akkauntingiz markaz bazasiga bog&apos;lanmagan. Botga qaytib{" "}
              <b>/start</b> yuboring va telefon raqamingizni ulashing.
            </p>
            <p className="mt-2 text-sm tg-muted">
              Raqamingiz bazada bo&apos;lmasa, administratorga murojaat qiling.
            </p>
          </>
        ) : null}

        {state.kind === "outside" ? (
          <>
            <p className="text-base font-bold">Telegram orqali oching</p>
            <p className="mt-2 text-sm tg-muted">
              Bu sahifa Telegram ichida ochilishi kerak. Botdagi{" "}
              <b>&quot;Kabinetni ochish&quot;</b> tugmasini bosing.
            </p>
            <a href="/login" className="tg-link mt-4 inline-block text-sm font-semibold">
              Yoki brauzerdan kirish →
            </a>
          </>
        ) : null}

        {state.kind === "error" ? (
          <>
            <p className="text-base font-bold">Xatolik</p>
            <p className="mt-2 text-sm tg-muted">{state.message}</p>
          </>
        ) : null}
      </div>
    </main>
  );
}
