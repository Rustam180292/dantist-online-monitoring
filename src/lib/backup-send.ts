import "server-only";
import { prisma } from "@/lib/prisma";
import { backupFileName, backupTotal, collectBackup } from "@/lib/backup";
import { sendDocument } from "@/lib/telegram";

export type BackupResult = {
  ok: boolean;
  sent: number;
  owners: number;
  records: number;
  error?: string;
};

/**
 * Zaxira nusxasini markaz egalariga Telegram orqali yuboradi.
 *
 * Nega Telegram: bot allaqachon ishlab turibdi, ya'ni yangi xizmat ochish,
 * yangi parol saqlash kerak emas. Fayl eganing o'z suhbatida qoladi — u
 * yerdan istalgan vaqtda yuklab olinadi va telefon ham, kompyuter ham ko'radi.
 *
 * Parol xeshlari yuborilmaydi: fayl suhbatda qolib ketadi.
 */
export async function sendBackupToOwners(): Promise<BackupResult> {
  const owners = await prisma.user.findMany({
    where: { role: "OWNER", isActive: true, telegramId: { not: null } },
    select: { telegramId: true },
  });

  if (owners.length === 0) {
    return {
      ok: false,
      sent: 0,
      owners: 0,
      records: 0,
      error:
        "Telegram'ga ulangan markaz egasi yo'q. Botga /start yuborib, raqamingizni ulashing.",
    };
  }

  const file = await collectBackup({ withPasswords: false });
  const content = JSON.stringify(file, null, 1);
  const records = backupTotal(file);
  const name = backupFileName();

  const sizeKb = Math.max(1, Math.round(content.length / 1024));
  const caption =
    `🗄 <b>Zaxira nusxa</b>\n` +
    `${records} ta yozuv · ${sizeKb} KB\n\n` +
    `Faylni saqlab qo'ying. Parollar bu nusxaga kiritilmagan.`;

  let sent = 0;
  for (const o of owners) {
    if (!o.telegramId) continue;
    if (await sendDocument(o.telegramId, name, content, caption)) sent++;
  }

  return { ok: sent > 0, sent, owners: owners.length, records };
}
