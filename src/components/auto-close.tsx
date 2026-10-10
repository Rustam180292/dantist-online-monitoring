"use client";

import { useEffect } from "react";
import { FLASH_EVENT } from "@/components/flash";

/**
 * "Tahrirlash" bo'limlari saqlangach o'zi yopiladi.
 *
 * `<details data-autoclose>` ichidagi forma yuborilganda shu bo'lim eslab
 * qolinadi. Server amali tugab yashil xabar kelsa — yopiladi; qizil (xato)
 * kelsa ochiq qoladi, kiritilgan qiymatlar yo'qolmaydi va tuzatib qayta
 * saqlash mumkin. Sahifa serverdan qayta chizilsa ham <details> ochiqligi
 * brauzerda saqlanib qolardi — foydalanuvchi "saqlandimi?" deb ikkilanardi.
 */
export function AutoCloseEdits() {
  useEffect(() => {
    let pending: HTMLDetailsElement | null = null;

    const onSubmit = (e: Event) => {
      const form = e.target as HTMLElement | null;
      pending = (form?.closest?.("details[data-autoclose]") as HTMLDetailsElement | null) ?? null;
    };
    const onFlash = (e: Event) => {
      const ok = (e as CustomEvent<{ ok: boolean }>).detail?.ok;
      if (ok && pending) pending.open = false;
      pending = null;
    };

    document.addEventListener("submit", onSubmit, true);
    window.addEventListener(FLASH_EVENT, onFlash);
    return () => {
      document.removeEventListener("submit", onSubmit, true);
      window.removeEventListener(FLASH_EVENT, onFlash);
    };
  }, []);

  return null;
}
