import path from "node:path";
import "dotenv/config";
import { defineConfig } from "prisma/config";

// Ulanish manzili CLI (db push / migrate) uchun.
// Ilova ichida ulanish src/lib/prisma.ts dagi driver-adapter orqali ochiladi.
// Bo'sh bo'lsa, Prisma buyruqlarining o'zi tushunarli xato beradi.
const url = process.env.DATABASE_URL ?? "";

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: { path: path.join("prisma", "migrations") },
  datasource: { url },
});
