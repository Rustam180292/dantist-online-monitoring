import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

const API = "https://api.telegram.org";

export function botToken(): string | null {
  return process.env.TELEGRAM_BOT_TOKEN || null;
}

/** Mini App ochiladigan manzil (bot tugmasi uchun) */
export function appUrl(): string {
  return (process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");
}

export type TelegramUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
};

function hmacHex(key: Buffer | string, data: string): string {
  return createHmac("sha256", key).update(data).digest("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

/**
 * Telegram Mini App'dan kelgan initData'ni tekshiradi.
 *
 * Telegram hujjatiga ko'ra: `hash` dan boshqa barcha maydonlar alifbo tartibida
 * "key=value" ko'rinishida \n bilan birlashtiriladi, kalit esa
 * HMAC_SHA256("WebAppData", bot_token) bo'ladi.
 *
 * Yangi mijozlar `signature` maydonini ham yuboradi va ba'zi rasmiy SDK'lar uni
 * hisobdan chiqaradi — shuning uchun ikkala variantni ham sinaymiz.
 */
export function verifyInitData(
  initData: string,
  opts: { maxAgeSec?: number } = {},
): { ok: true; user: TelegramUser; authDate: Date } | { ok: false; reason: string } {
  const token = botToken();
  if (!token) return { ok: false, reason: "TELEGRAM_BOT_TOKEN sozlanmagan" };
  if (!initData) return { ok: false, reason: "initData bo'sh" };

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return { ok: false, reason: "hash yo'q" };

  const buildCheckString = (skip: string[]) =>
    [...params.entries()]
      .filter(([k]) => !skip.includes(k))
      .map(([k, v]) => `${k}=${v}`)
      .sort()
      .join("\n");

  const secret = createHmac("sha256", "WebAppData").update(token).digest();

  const candidates = [buildCheckString(["hash"])];
  if (params.has("signature")) candidates.push(buildCheckString(["hash", "signature"]));

  const matched = candidates.some((check) => {
    try {
      return safeEqualHex(hmacHex(secret, check), hash);
    } catch {
      return false;
    }
  });
  if (!matched) return { ok: false, reason: "imzo mos kelmadi" };

  const authDateRaw = Number(params.get("auth_date") ?? 0);
  if (!authDateRaw) return { ok: false, reason: "auth_date yo'q" };

  const maxAge = opts.maxAgeSec ?? 24 * 60 * 60;
  const ageSec = Math.floor(Date.now() / 1000) - authDateRaw;
  if (ageSec > maxAge) return { ok: false, reason: "initData eskirgan" };

  let user: TelegramUser;
  try {
    user = JSON.parse(params.get("user") ?? "") as TelegramUser;
  } catch {
    return { ok: false, reason: "user maydoni o'qilmadi" };
  }
  if (!user?.id) return { ok: false, reason: "foydalanuvchi aniqlanmadi" };

  return { ok: true, user, authDate: new Date(authDateRaw * 1000) };
}

/** Telefon raqamni solishtirish uchun faqat raqamlarini qoldiradi */
export function phoneDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

/** Bitta raqamning mumkin bo'lgan yozilish variantlari */
export function phoneVariants(phone: string): string[] {
  const d = phoneDigits(phone);
  return [...new Set([`+${d}`, d, phone.trim()])];
}

type SendOptions = {
  replyMarkup?: unknown;
  parseMode?: "HTML" | "Markdown";
};

/**
 * Telegram'ga xabar yuboradi. Tarmoq yoki token muammosida yiqilmaydi —
 * false qaytaradi, chunki xabar yuborilmagani asosiy amalni buzmasligi kerak.
 */
export async function sendMessage(
  chatId: number | string,
  text: string,
  options: SendOptions = {},
): Promise<boolean> {
  const token = botToken();
  if (!token) return false;

  try {
    const res = await fetch(`${API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: options.parseMode ?? "HTML",
        ...(options.replyMarkup ? { reply_markup: options.replyMarkup } : {}),
      }),
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Mini App'ni ochadigan tugma */
export function miniAppButton(text = "Kabinetni ochish") {
  return {
    inline_keyboard: [[{ text, web_app: { url: `${appUrl()}/tg` } }]],
  };
}

/** Telefon raqam so'raydigan klaviatura */
export function contactKeyboard(text = "📱 Raqamimni yuborish") {
  return {
    keyboard: [[{ text, request_contact: true }]],
    resize_keyboard: true,
    one_time_keyboard: true,
  };
}
