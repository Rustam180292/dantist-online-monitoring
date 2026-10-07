"use server";

import { revalidatePath } from "next/cache";
import { ActionError, withFlash } from "@/lib/action";
import { setFlash } from "@/lib/flash";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

/** Filiallar bilan faqat markaz egasi ishlaydi */
async function requireOwner() {
  const user = await requireUser();
  if (user.role !== "OWNER") throw new Error("Bu amalni faqat markaz egasi bajara oladi.");
  return user;
}

function refresh() {
  revalidatePath("/branches");
  revalidatePath("/");
  revalidatePath("/specialists");
  revalidatePath("/clients");
  revalidatePath("/schedule");
  revalidatePath("/intakes");
  revalidatePath("/reports");
}

async function createBranchImpl(formData: FormData) {
  await requireOwner();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Filial nomi majburiy.");

  const exists = await prisma.branch.findUnique({ where: { name } });
  if (exists) throw new Error("Bunday nomli filial allaqachon bor.");

  await prisma.branch.create({
    data: {
      name,
      address: String(formData.get("address") ?? "").trim() || null,
      phone: String(formData.get("phone") ?? "").trim() || null,
    },
  });

  refresh();
  await setFlash('"{name}" filiali qo\'shildi.', "ok", { name });
}

async function updateBranchImpl(formData: FormData) {
  await requireOwner();

  const id = String(formData.get("branchId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Filial nomi majburiy.");

  const branch = await prisma.branch.findUnique({ where: { id } });
  if (!branch) throw new Error("Filial topilmadi.");

  const sameName = await prisma.branch.findUnique({ where: { name } });
  if (sameName && sameName.id !== id) throw new Error("Bunday nomli filial allaqachon bor.");

  await prisma.branch.update({
    where: { id },
    data: {
      name,
      address: String(formData.get("address") ?? "").trim() || null,
      phone: String(formData.get("phone") ?? "").trim() || null,
    },
  });

  refresh();
  await setFlash('"{name}" saqlandi.', "ok", { name });
}

/**
 * Filialni o'chirish.
 *
 * Faqat bo'sh filial o'chiriladi: ichida mijoz, mutaxassis yoki to'lov bo'lsa,
 * ularni ham yo'qotib yuborish xavfli. Bunday holda filial nomini o'zgartirib,
 * yoki xodimlarini boshqa filialga o'tkazib ishlatish to'g'riroq.
 */
async function deleteBranchImpl(formData: FormData) {
  await requireOwner();
  const id = String(formData.get("branchId") ?? "");

  const branch = await prisma.branch.findUnique({ where: { id }, select: { name: true } });
  if (!branch) throw new Error("Filial topilmadi.");

  const [clients, specialists, users, sessions, payments, intakes] = await Promise.all([
    prisma.client.count({ where: { branchId: id } }),
    prisma.specialist.count({ where: { branchId: id } }),
    prisma.user.count({ where: { branchId: id } }),
    prisma.session.count({ where: { branchId: id } }),
    prisma.payment.count({ where: { branchId: id } }),
    prisma.intake.count({ where: { branchId: id } }),
  ]);
  const busy = clients + specialists + users + sessions + payments + intakes;
  if (busy > 0) {
    throw new ActionError(
      "\"{name}\" bo'sh emas: {clients} mijoz, {specialists} mutaxassis, {sessions} seans, " +
        "{payments} to'lov, {intakes} qabul. O'chirish o'rniga nomini o'zgartiring yoki " +
        "xodimlarni boshqa filialga o'tkazing.",
      { name: branch.name, clients, specialists, sessions, payments, intakes },
    );
  }

  const total = await prisma.branch.count();
  if (total <= 1) throw new Error("Oxirgi filialni o'chirib bo'lmaydi.");

  await prisma.branch.delete({ where: { id } });
  refresh();
  await setFlash('"{name}" o\'chirildi.', "ok", { name: branch.name });
}

export const createBranch = withFlash(createBranchImpl);
export const updateBranch = withFlash(updateBranchImpl);
export const deleteBranch = withFlash(deleteBranchImpl);
