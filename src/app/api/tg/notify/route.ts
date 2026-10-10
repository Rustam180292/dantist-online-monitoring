import { after, NextResponse } from "next/server";
import { runDailySheets } from "@/lib/sheets";
import { prisma } from "@/lib/prisma";
import { runNotifications } from "@/lib/notify";

/**
 * Eslatmalarni navbatga qo'yib, Telegram'ga yuboradi.
 * Tashqi cron xizmati (yoki serverdagi crontab) chaqiradi:
 *
 *   curl -X POST -H "x-cron-secret: <CRON_SECRET>" <APP_URL>/api/tg/notify
 *
 * Kuniga bir marta (masalan kechki 19:00 da) chaqirish yetarli.
 */

function authorize(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const header = request.headers.get("x-cron-secret");
  const query = new URL(request.url).searchParams.get("secret");
  return header === expected || query === expected;
}

async function handle(request: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET sozlanmagan" },
      { status: 503 },
    );
  }
  if (!authorize(request)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const result = await runNotifications();
  // Google Sheets zaxirasi ham shu kunlik cron'da — alohida cron sozlash
  // shart emas. Javobdan keyin bajariladi: eslatmalar kutib turmasin.
  after(() => runDailySheets().catch(() => 0));
  const pending = await prisma.notification.count({ where: { sentAt: null } });

  return NextResponse.json({ ok: true, ...result, pending });
}

export async function POST(request: Request) {
  return handle(request);
}

/** Ba'zi cron xizmatlari faqat GET yubora oladi */
export async function GET(request: Request) {
  return handle(request);
}
