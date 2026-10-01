import path from "node:path";
import "dotenv/config";
import { defineConfig } from "prisma/config";

// Ulanish manzili faqat CLI (db push / migrate) uchun.
// Ilova ichida ulanish src/lib/prisma.ts dagi driver-adapter orqali ochiladi.
const url = process.env.DATABASE_URL ?? "file:./prisma/dev.db";

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: { path: path.join("prisma", "migrations") },
  datasource: { url },
});
