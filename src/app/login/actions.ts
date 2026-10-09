"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/lib/constants";
import { startSession, verifyPassword, endSession, homePath } from "@/lib/auth";

export async function login(formData: FormData) {
  const phone = String(formData.get("phone") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!phone || !password) {
    redirect("/login?error=bosh");
  }

  const user = await prisma.user.findUnique({
    where: { phone },
    include: { branch: { select: { isSolo: true } } },
  });
  // Ota-ona parol bilan kirmaydi: uni markaz bazasidagi telefon raqami
  // bo'yicha Telegram bot taniydi. Parol tekshirilishidan oldin aytiladi —
  // aks holda u "parol noto'g'ri" deb, bilmagan parolini terib o'tirardi.
  if (user?.role === "PARENT") {
    redirect("/login?error=telegram");
  }
  if (!user || !user.isActive || !verifyPassword(password, user.passwordHash)) {
    redirect("/login?error=notogri");
  }

  await startSession(user.id);
  redirect(homePath({ role: user.role as Role, isSolo: user.branch?.isSolo ?? false }));
}

export async function logout() {
  await endSession();
  redirect("/login");
}
