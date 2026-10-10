import { after, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ROLES, type Role } from "@/lib/constants";
import {
  contactKeyboard,
  miniAppButton,
  phoneVariants,
  sendMessage,
  setKabinetMenu,
} from "@/lib/telegram";

/**
 * Telegram bot webhook'i.
 *
 * Vazifasi bitta: Telegram akkauntini CRM foydalanuvchisiga bog'lash.
 *  /start        -> telefon raqam so'raydi
 *  contact       -> raqam bo'yicha foydalanuvchini topib, telegramId ni yozadi
 *
 * Webhook'ni o'rnatish:
 *   https://api.telegram.org/bot<TOKEN>/setWebhook
 *     ?url=<APP_URL>/api/tg/webhook&secret_token=<TELEGRAM_WEBHOOK_SECRET>
 */

type TgUpdate = {
  message?: {
    chat: { id: number };
    from?: { id: number; username?: string; first_name?: string };
    text?: string;
    contact?: { phone_number: string; user_id?: number; first_name?: string };
  };
};

const HELP =
  "Bu — markaz xodimlari va ota-onalar uchun kabinet.\n\n" +
  "Boshlash uchun /start buyrug'ini yuboring va telefon raqamingizni ulashing. " +
  "Raqamingiz markaz bazasida bo'lsa, kabinetingiz ochiladi.";

/**
 * Ota-ona akkaunti yo'q, lekin raqami mijoz kartasida turibdi.
 *
 * Ilgari ota-ona akkaunti faqat "kabinet paroli" yozilganda ochilardi —
 * parolsiz qo'shilgan mijozlarning ota-onasi botga raqamini yuborsa ham
 * "topilmadi" degan javob olardi. Endi kirish faqat Telegram orqali, shuning
 * uchun raqam mijoz kartasida bo'lsa, akkaunt shu yerda ochiladi va o'sha
 * raqamdagi hamma farzand (aka-uka) unga ulanadi.
 */
async function parentFromClients(variants: string[]) {
  const clients = await prisma.client.findMany({
    where: { parentPhone: { in: variants }, parentUserId: null },
    select: { id: true, branchId: true, parentName: true, parentPhone: true },
    orderBy: { createdAt: "asc" },
  });
  if (clients.length === 0) return null;
  // O'chirib qo'yilgan akkaunt shu raqamda bo'lsa, uni qayta tiklamaymiz —
  // uni kimdir ataylab yopgan
  const blocked = await prisma.user.findFirst({ where: { phone: { in: variants } } });
  if (blocked) return null;

  const first = clients[0];
  const user = await prisma.user.create({
    data: {
      phone: first.parentPhone,
      fullName: first.parentName,
      // Parol yo'q: ota-ona faqat Telegram orqali kiradi
      passwordHash: "",
      role: "PARENT",
      branchId: first.branchId,
    },
  });
  await prisma.client.updateMany({
    where: { id: { in: clients.map((c) => c.id) } },
    data: { parentUserId: user.id },
  });
  return user;
}

export async function POST(request: Request) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (expected) {
    const got = request.headers.get("x-telegram-bot-api-secret-token");
    if (got !== expected) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }
  }

  let update: TgUpdate;
  try {
    update = (await request.json()) as TgUpdate;
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }

  const message = update.message;
  if (!message) return NextResponse.json({ ok: true });

  const chatId = message.chat.id;

  // 1) Telefon raqam yuborildi -> akkauntni bog'laymiz
  if (message.contact) {
    const contact = message.contact;

    // Boshqa odamning kontaktini yuborib qo'yishning oldini olamiz
    if (!contact.user_id || !message.from || contact.user_id !== message.from.id) {
      await sendMessage(chatId, "Iltimos, <b>o'zingizning</b> raqamingizni yuboring.");
      return NextResponse.json({ ok: true });
    }

    const variants = phoneVariants(contact.phone_number);
    const user =
      (await prisma.user.findFirst({
        where: { phone: { in: variants }, isActive: true },
      })) ?? (await parentFromClients(variants));

    if (!user) {
      await sendMessage(
        chatId,
        "Bu raqam markaz bazasida topilmadi.\n\n" +
          "Agar siz markaz xodimi yoki mijoz ota-onasi bo'lsangiz, " +
          "administratorga murojaat qiling — u raqamingizni tizimga kiritadi.",
      );
      return NextResponse.json({ ok: true });
    }

    const telegramId = String(contact.user_id);

    // Bu Telegram akkaunti boshqa birovga bog'langan bo'lsa, eski bog'lanishni uzamiz
    await prisma.user.updateMany({
      where: { telegramId, NOT: { id: user.id } },
      data: { telegramId: null, telegramUsername: null },
    });

    await prisma.user.update({
      where: { id: user.id },
      data: { telegramId, telegramUsername: message.from.username ?? null },
    });

    await sendMessage(
      chatId,
      `Xush kelibsiz, <b>${user.fullName}</b>!\n` +
        `Rolingiz: ${ROLES[user.role as Role]}\n\n` +
        "Kabinetni ochish uchun pastdagi tugmani bosing.",
      { replyMarkup: miniAppButton() },
    );

    return NextResponse.json({ ok: true });
  }

  // 2) /start -> raqam so'raymiz
  const text = (message.text ?? "").trim();
  if (text.startsWith("/start")) {
    // Javobdan keyin bajariladi: tugma qo'yilmasa ham /start ishlayveradi
    after(() => setKabinetMenu(chatId));
    const from = message.from;
    const linked = from
      ? await prisma.user.findUnique({ where: { telegramId: String(from.id) } })
      : null;

    if (linked?.isActive) {
      await sendMessage(
        chatId,
        `Assalomu alaykum, <b>${linked.fullName}</b>!\nKabinetingiz tayyor.`,
        { replyMarkup: miniAppButton() },
      );
    } else {
      await sendMessage(
        chatId,
        "Assalomu alaykum! Kabinetga kirish uchun telefon raqamingizni ulashing — " +
          "tizim sizni shu raqam bo'yicha taniydi.",
        { replyMarkup: contactKeyboard() },
      );
    }
    return NextResponse.json({ ok: true });
  }

  await sendMessage(chatId, HELP);
  return NextResponse.json({ ok: true });
}

/** Webhook tirikligini tekshirish uchun */
export async function GET() {
  return NextResponse.json({ ok: true, service: "telegram-webhook" });
}
