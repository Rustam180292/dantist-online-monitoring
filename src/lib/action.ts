import "server-only";
import { unstable_rethrow } from "next/navigation";
import { setFlash } from "@/lib/flash";

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
    try {
      await fn(...args);
    } catch (error) {
      unstable_rethrow(error);
      const message =
        error instanceof Error && error.message
          ? error.message
          : "Amal bajarilmadi. Qaytadan urinib ko'ring.";
      console.error("Amal bajarilmadi:", error);
      await setFlash(message);
    }
  };
}
