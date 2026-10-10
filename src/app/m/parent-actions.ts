"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { ActionError, withFlash } from "@/lib/action";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { setFlash } from "@/lib/flash";
import { PARENT_CANCEL_MIN_HOURS } from "@/lib/constants";
import { queueParentCancel, sendPending } from "@/lib/notify";

/**
 * Ota-ona farzandining mashg'ulotini o'zi bekor qiladi.
 *
 * Holat "Mijoz bekor qildi" bo'ladi — xodim tugmasi bilan bir xil, shuning
 * uchun abonementdan yechilmaydi va mutaxassisga haq yozilmaydi. Seans
 * o'chirilmaydi: jadvalda kim, qachon bekor qilgani ko'rinib tursin.
 */
async function cancelByParentImpl(formData: FormData) {
  const user = await requireUser();
  if (user.role !== "PARENT") throw new Error("Sizda bu amal uchun ruxsat yo'q.");

  const sessionId = String(formData.get("sessionId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 300);

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      status: true,
      startsAt: true,
      note: true,
      client: { select: { parentUserId: true } },
      branch: { select: { isSolo: true } },
    },
  });
  // Begona bolaning seansi "topilmadi" deb javob oladi — borligini ham bilmasin
  if (!session || session.client.parentUserId !== user.id) {
    throw new Error("Seans topilmadi.");
  }
  if (session.status !== "PLANNED") {
    throw new Error("Bu mashg'ulot allaqachon belgilangan.");
  }
  const hoursLeft = (session.startsAt.getTime() - Date.now()) / 3_600_000;
  if (hoursLeft < PARENT_CANCEL_MIN_HOURS) {
    // Yakka logopedning mijozi markazga emas, logopedning o'ziga qo'ng'iroq qiladi
    throw new ActionError(
      session.branch.isSolo
        ? "Mashg'ulotga {n} soatdan kam qoldi — bekor qilish uchun logopedga qo'ng'iroq qiling."
        : "Mashg'ulotga {n} soatdan kam qoldi — bekor qilish uchun markazga qo'ng'iroq qiling.",
      { n: PARENT_CANCEL_MIN_HOURS },
    );
  }

  // Sabab xodimlar ichki izohiga qo'shiladi: jadvalda shu yerda ko'rinadi
  const mark = reason ? `Ota-ona bekor qildi: ${reason}` : "Ota-ona bekor qildi";
  await prisma.session.update({
    where: { id: sessionId },
    data: {
      status: "CANCELLED_CLIENT",
      price: 0,
      salaryPercent: null,
      note: session.note ? `${session.note} · ${mark}` : mark,
    },
  });

  after(async () => {
    try {
      const queued = await queueParentCancel(sessionId, reason);
      if (queued > 0) await sendPending(10);
    } catch (e) {
      console.error("Xodimlarga bekor qilish xabari yuborilmadi:", e);
    }
  });

  await setFlash(
    session.branch.isSolo
      ? "Mashg'ulot bekor qilindi, logopedga xabar berildi."
      : "Mashg'ulot bekor qilindi, markazga xabar berildi.",
    "ok",
  );
  revalidatePath("/m");
  revalidatePath("/schedule");
}

export const cancelByParent = withFlash(cancelByParentImpl);
