import "server-only";
import { cookies } from "next/headers";

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
export async function setFlash(message: string, kind: "ok" | "err" = "err"): Promise<void> {
  const jar = await cookies();
  // Qiymatni Next'ning o'zi kodlaydi — bu yerda qayta kodlash kerak emas,
  // aks holda brauzerda %20 lar ko'rinib qoladi.
  jar.set(FLASH_COOKIE, `${kind}:${message}`, {
    httpOnly: false, // brauzerdagi komponent o'qib, keyin o'chiradi
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 30,
  });
}
