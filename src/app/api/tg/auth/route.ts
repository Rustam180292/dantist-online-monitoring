import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { startSession } from "@/lib/auth";
import { verifyInitData } from "@/lib/telegram";

/**
 * Mini App ochilganda chaqiriladi: Telegram bergan initData imzosi tekshiriladi
 * va mos foydalanuvchi uchun sessiya cookie'si o'rnatiladi.
 */
export async function POST(request: Request) {
  let initData = "";
  try {
    const body = (await request.json()) as { initData?: string };
    initData = body.initData ?? "";
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }

  const result = verifyInitData(initData);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: "invalid_init_data", reason: result.reason },
      { status: 401 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { telegramId: String(result.user.id) },
    select: { id: true, fullName: true, role: true, isActive: true },
  });

  if (!user || !user.isActive) {
    return NextResponse.json(
      { ok: false, error: "not_linked" },
      { status: 403 },
    );
  }

  await startSession(user.id);

  return NextResponse.json({ ok: true, role: user.role, fullName: user.fullName });
}
