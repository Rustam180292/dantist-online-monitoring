import "server-only";
import { cookies } from "next/headers";
import { getT } from "@/lib/i18n/server";
import type { Vars } from "@/lib/i18n";

/**
 * Amal bajarilmaganda foydalanuvchiga ko'rsatiladigan qisqa xabar.
 *
 * Nega cookie orqali: Next.js ishlab chiqarish rejimida server tomonidagi
 * xato matnini brauzerga bermaydi (xavfsizlik uchun) — natijada foydalanuvchi
 * "nimadir xato bo'ldi" degan foydasiz ekranni ko'rardi. Shuning uchun
 * kutilgan tekshiruv xabarlari alohida, ataylab yuboriladi.
 */
export const FLASH_COOKIE = "logoped_flash";

/**
 * Xabar turi xabarning oldiga qo'shiladi: "ok:" yoki "err:".
 *
 * Nega kerak: amal muvaffaqiyatli tugaganda ham foydalanuvchi buni bilishi
 * kerak. Masalan tahrirlash formasi yopiladi va qator joyiga qaytadi — tashqi
 * ko'rinishda hech narsa o'zgarmagandek tuyuladi, holbuki saqlangan.
 */
export async function setFlash(
  message: string,
  kind: "ok" | "err" = "err",
  vars?: Vars,
): Promise<void> {
  const jar = await cookies();
  // Amallardagi xabarlar o'zbekcha yozilgan ("Parol o'zgartirildi.") — ularni
  // shu yerda, bitta joyda, tanlangan tilga o'giramiz. Shunda har bir action
  // faylida tarjimani alohida chaqirish shart emas.
  const t = await getT();
  // Qiymatni Next'ning o'zi kodlaydi — bu yerda qayta kodlash kerak emas,
  // aks holda brauzerda %20 lar ko'rinib qoladi.
  jar.set(FLASH_COOKIE, `${kind}:${t(message, vars)}`, {
    httpOnly: false, // brauzerdagi komponent o'qib, keyin o'chiradi
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 30,
  });
}
