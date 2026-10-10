import { after, NextResponse } from "next/server";
import { runDailySheets } from "@/lib/sheets";
import { sendBackupToOwners } from "@/lib/backup-send";

/**
 * Avtomatik zaxira: bazani Telegram orqali markaz egalariga yuboradi.
 *
 * Tashqi cron xizmati chaqiradi (eslatmalar cron'i kabi):
 *
 *   <APP_URL>/api/backup?secret=<CRON_SECRET>
 *
 * Kuniga bir marta yetarli — masalan kechki 22:00 da.
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
    return NextResponse.json({ ok: false, error: "CRON_SECRET sozlanmagan" }, { status: 503 });
  }
  if (!authorize(request)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const result = await sendBackupToOwners();
  // Zaxira cron'i sozlangan bo'lsa, Google Sheets ham shu yerda (kuniga bir marta)
  after(() => runDailySheets().catch(() => 0));
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
