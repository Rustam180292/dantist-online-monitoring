"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { startSession, verifyPassword, endSession } from "@/lib/auth";

export async function login(formData: FormData) {
  const phone = String(formData.get("phone") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!phone || !password) {
    redirect("/login?error=bosh");
  }

  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user || !user.isActive || !verifyPassword(password, user.passwordHash)) {
    redirect("/login?error=notogri");
  }

  await startSession(user.id);
  redirect(user.role === "SPECIALIST" || user.role === "PARENT" ? "/m" : "/");
}

export async function logout() {
  await endSession();
  redirect("/login");
}
