import "server-only";
import { unstable_rethrow } from "next/navigation";
import { after } from "next/server";
import { setFlash } from "@/lib/flash";
import type { Vars } from "@/lib/i18n";

/**
 * Ichida o'zgaruvchi qismi bor tekshiruv xatosi.
 *
 * Oddiy `new Error(`... ${n} ...`)` tarjima qilinmaydi: lug'atda shu
 * raqamlar bilan birga kalit bo'lmaydi. Shuning uchun matn kalit holicha
 * ("{n} ta mijoz bor") tashlanadi, raqamlar esa alohida keladi va tarjimadan
 * keyin o'rniga qo'yiladi.
 */
export class ActionError extends Error {
  readonly vars?: Vars;
  constructor(message: string, vars?: Vars) {
    super(message);
    this.name = "ActionError";
    this.vars = vars;
  }
}

/**
 * Server action'ni o'rab oladi: ichkarida tashlangan tekshiruv xatosi
 * ("Bu telefon raqam allaqachon ro'yxatda" kabi) foydalanuvchiga tushunarli
 * xabar bo'lib ko'rinadi, butun sahifa xato ekraniga almashmaydi.
 *
 * Next.js'ning o'z ichki "xatolari" (redirect, notFound) ushlanmaydi —
 * ular unstable_rethrow orqali o'z yo'lida davom etadi.
 */
export function withFlash<T extends unknown[]>(
  fn: (...args: T) => Promise<void>,
): (...args: T) => Promise<void> {
  return async (...args: T) => {
    // Google jadval har o'zgarishdan keyin yangilansin. Javob ketgandan keyin
    // bajariladi — foydalanuvchi kutmaydi. Xato bo'lsa (masalan tekshiruv
    // o'tmasa) ham ishlaydi: o'zgarmagan ma'lumotni qayta yozish zararsiz,
    // redirect qiladigan amallarni esa boshqacha ushlab bo'lmaydi.
    after(async () => {
      try {
        const { syncAfterChange } = await import("@/lib/sheets");
        await syncAfterChange();
      } catch (e) {
        console.error("Google jadvalga yozilmadi:", e);
      }
    });
    try {
      await fn(...args);
    } catch (error) {
      unstable_rethrow(error);
      const message =
        error instanceof Error && error.message
          ? error.message
          : "Amal bajarilmadi. Qaytadan urinib ko'ring.";
      console.error("Amal bajarilmadi:", error);
      await setFlash(message, "err", error instanceof ActionError ? error.vars : undefined);
    }
  };
}
