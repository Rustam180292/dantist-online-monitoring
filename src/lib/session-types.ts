import "server-only";
import { prisma } from "@/lib/prisma";
import { isSolo, type CurrentUser } from "@/lib/auth";

/**
 * Qaysi seans turlari shu foydalanuvchiga tegishli.
 *
 * Markazning turlari bitta (branchId bo'sh) — hamma filial bir xil narx
 * ro'yxatidan foydalanadi. Yakka mutaxassisning turlari faqat o'ziniki:
 * markaz narxlari unga, uning narxlari markazga aralashmasligi kerak.
 */
export function sessionTypeScope(user: CurrentUser) {
  return isSolo(user) ? { branchId: user.branchId } : { branchId: null };
}

/** Seans yozish formasi uchun faol turlar */
export function getSessionTypes(user: CurrentUser) {
  return prisma.sessionType.findMany({
    where: { ...sessionTypeScope(user), isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, price: true },
  });
}

/** Mijozning filialiga qarab, shu tur unga ishlatilishi mumkinmi */
export async function assertTypeFitsBranch(sessionTypeId: string, branchId: string) {
  const [type, branch] = await Promise.all([
    prisma.sessionType.findUnique({
      where: { id: sessionTypeId },
      select: { branchId: true, isActive: true },
    }),
    prisma.branch.findUnique({ where: { id: branchId }, select: { isSolo: true } }),
  ]);
  if (!type || !type.isActive) throw new Error("Seans turi topilmadi.");
  const fits = branch?.isSolo ? type.branchId === branchId : type.branchId === null;
  if (!fits) throw new Error("Seans turi topilmadi.");
}
