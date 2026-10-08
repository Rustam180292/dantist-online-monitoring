import { Fragment } from "react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { clientScope, requireUser } from "@/lib/auth";
import {
  BILLABLE_STATUSES,
  BILLING_TYPES,
  BILLING_TYPE_KEYS,
  CLIENT_STATUSES,
  CLIENT_STATUS_KEYS,
  SPECIALIZATIONS,
  type BillingType,
  type ClientStatus,
  type Specialization,
} from "@/lib/constants";
import {
  Badge,
  Card,
  Empty,
  PageHeader,
  btnPrimary,
  card,
  input,
  label,
  td,
  th,
} from "@/components/ui";
import { createClient } from "./actions";
import { ClientFilters } from "./filters";
import { ClientEditForm } from "./edit-form";
import { getT } from "@/lib/i18n/server";

type Search = {
  n?: string;
  p?: string;
  age?: string;
  sp?: string;
  rem?: string;
  b?: string;
  st?: string;
  tg?: string;
  bt?: string;
};

/**
 * Berilgan yoshdagi bolalarning tug'ilgan sana oralig'i.
 *
 * Yoshni bazada saqlamaymiz — u tug'ilgan sanadan hisoblanadi, aks holda har
 * yili eskirib qolardi. Shuning uchun filtr sanaga aylantiriladi.
 */
function birthRangeForAge(age: number): { gt: Date; lte: Date } {
  const now = new Date();
  const lte = new Date(now);
  lte.setFullYear(now.getFullYear() - age);
  const gt = new Date(now);
  gt.setFullYear(now.getFullYear() - age - 1);
  return { gt, lte };
}

/** Filtrda tanlanadigan yoshlar — logopedik markazga keladigan yosh oralig'i */
const AGE_OPTIONS = Array.from({ length: 16 }, (_, i) => i + 2);

const STATUS_STYLE: Record<ClientStatus, string> = {
  ACTIVE: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-900",
  PAUSED: "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-900",
  ARCHIVED: "bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700",
};

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const user = await requireUser();
  const t = await getT();
  const sp = await searchParams;
  const canManage =
    user.role === "OWNER" || user.role === "BRANCH_ADMIN" || user.role === "RECEPTION";

  const nameFilter = (sp.n ?? "").trim();
  const phoneFilter = (sp.p ?? "").trim();
  const ageFilter = /^\d{1,2}$/.test(sp.age ?? "") ? Number(sp.age) : null;
  const specialistFilter = (sp.sp ?? "").trim();
  const remainingFilter = sp.rem === "0" || sp.rem === "low" || sp.rem === "ok" ? sp.rem : null;
  const statusFilter = CLIENT_STATUS_KEYS.includes(sp.st as ClientStatus)
    ? (sp.st as ClientStatus)
    : null;
  // Telegram'ga ulanmagan ota-onaga eslatma bormaydi — ularni ajratib ko'rsatish kerak
  const telegramFilter = sp.tg === "bor" || sp.tg === "yoq" ? sp.tg : null;
  const billingFilter = BILLING_TYPE_KEYS.includes(sp.bt as BillingType)
    ? (sp.bt as BillingType)
    : null;
  const hasFilter = Boolean(
    nameFilter || phoneFilter || ageFilter !== null || specialistFilter || remainingFilter ||
      statusFilter || telegramFilter || billingFilter || sp.b,
  );

  const [clients, branches, specialists] = await Promise.all([
    prisma.client.findMany({
      where: {
        ...clientScope(user),
        ...(user.role === "OWNER" && sp.b ? { branchId: sp.b } : {}),
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(billingFilter ? { billingType: billingFilter } : {}),
        ...(ageFilter !== null ? { birthDate: birthRangeForAge(ageFilter) } : {}),
        ...(specialistFilter ? { specialists: { some: { specialistId: specialistFilter } } } : {}),
        ...(nameFilter
          ? {
              OR: [
                { fullName: { contains: nameFilter, mode: "insensitive" as const } },
                { parentName: { contains: nameFilter, mode: "insensitive" as const } },
              ],
            }
          : {}),
        ...(phoneFilter ? { parentPhone: { contains: phoneFilter } } : {}),
        // AND ichida, chunki ism filtri ham OR ishlatadi — ikkalasi bir obyektda
        // to'qnashib qolmasligi kerak
        ...(telegramFilter === "bor"
          ? { AND: [{ parent: { is: { telegramId: { not: null } } } }] }
          : telegramFilter === "yoq"
            ? {
                AND: [
                  {
                    OR: [
                      { parentUserId: null },
                      { parent: { is: { telegramId: null } } },
                    ],
                  },
                ],
              }
            : {}),
      },
      orderBy: [{ status: "asc" }, { fullName: "asc" }],
      include: {
        branch: { select: { name: true } },
        parent: { select: { telegramId: true } },
        specialists: {
          include: {
            specialist: {
              select: { specialization: true, user: { select: { fullName: true } } },
            },
          },
        },
        packages: {
          where: { isActive: true },
          select: {
            totalSessions: true,
            pricePerSession: true,
            sessions: { select: { status: true } },
            payments: { select: { amount: true } },
          },
        },
      },
    }),
    user.role === "OWNER" ? prisma.branch.findMany({ orderBy: { name: "asc" } }) : Promise.resolve([]),
    // Filtr ro'yxati uchun: mutaxassis o'ziniki bilan cheklanadi
    prisma.specialist.findMany({
      where: {
        isActive: true,
        ...(user.role === "SPECIALIST" ? { id: user.specialistId ?? "" } : {}),
        ...(user.role === "BRANCH_ADMIN" || user.role === "RECEPTION"
          ? { branchId: user.branchId ?? "" }
          : {}),
      },
      select: { id: true, user: { select: { fullName: true } } },
      orderBy: { user: { fullName: "asc" } },
    }),
  ]);

  const rows = clients.map((c) => {
    let remaining = 0;
    let debt = 0;
    for (const p of c.packages) {
      const used = p.sessions.filter((s) =>
        BILLABLE_STATUSES.includes(s.status as never),
      ).length;
      remaining += Math.max(p.totalSessions - used, 0);
      const paid = p.payments.reduce((sum, x) => sum + x.amount, 0);
      debt += Math.max(p.totalSessions * p.pricePerSession - paid, 0);
    }
    return { ...c, remaining, debt };
  });

  // Qolgan seans bazada saqlanmaydi (abonement va o'tgan seanslardan hisoblanadi),
  // shuning uchun bu filtr hisoblangandan keyin qo'llanadi.
  // Abonementi yo'q mijozning "qolgan seansi" 0 emas, shunaqa tushuncha unda
  // yo'q — shuning uchun bu filtr faqat abonementi borlarga tegishli.
  const visible = remainingFilter
    ? rows.filter((c) =>
        c.billingType !== "PACKAGE"
          ? false
          : remainingFilter === "0"
            ? c.remaining === 0
            : remainingFilter === "low"
              ? c.remaining > 0 && c.remaining <= 2
              : c.remaining > 2,
      )
    : rows;

  // Bola, yoshi, mutaxassis, ota-ona, qolgan seans, qarz, holat (+ filial egada)
  const colCount = user.role === "OWNER" ? 8 : 7;

  return (
    <>
      <PageHeader
        title={t("Mijozlar")}
        subtitle={`${t("{n} ta mijoz", { n: visible.length })}${
          rows.length !== visible.length ? ` (${t("jami {n}", { n: rows.length })})` : ""
        }${user.role === "SPECIALIST" ? ` · ${t("menga biriktirilgan")}` : ""}`}
      />

      {canManage ? (
        <details className={`${card} mb-5 p-4`}>
          <summary className="cursor-pointer text-sm font-semibold text-slate-800 dark:text-slate-200">
            + {t("Yangi mijoz qo'shish")}
          </summary>
          <form action={createClient} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className={label} htmlFor="fullName">
                {t("Bolaning F.I.Sh.")} *
              </label>
              <input id="fullName" name="fullName" className={input} required />
            </div>
            <div>
              <label className={label} htmlFor="birthDate">
                {t("Tug'ilgan sana")} *
              </label>
              <input id="birthDate" name="birthDate" type="date" className={input} required />
            </div>
            <div>
              <label className={label} htmlFor="gender">
                {t("Jinsi")}
              </label>
              <select id="gender" name="gender" className={input}>
                <option value="">—</option>
                <option value="M">{t("O'g'il bola")}</option>
                <option value="F">{t("Qiz bola")}</option>
              </select>
            </div>
            <div>
              <label className={label} htmlFor="billingType">
                {t("To'lov turi")}
              </label>
              <select id="billingType" name="billingType" className={input}>
                {BILLING_TYPE_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {t(BILLING_TYPES[k])}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {t("Kunlikda har kelganida to'laydi, abonementda oldindan.")}
              </p>
            </div>
            {user.role === "OWNER" ? (
              <div>
                <label className={label} htmlFor="branchId">
                  {t("Filial")} *
                </label>
                <select id="branchId" name="branchId" className={input} required>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div>
              <label className={label} htmlFor="parentName">
                {t("Ota-ona F.I.Sh.")} *
              </label>
              <input id="parentName" name="parentName" className={input} required />
            </div>
            <div>
              <label className={label} htmlFor="parentPhone">
                {t("Ota-ona telefoni")} *
              </label>
              <input
                id="parentPhone"
                name="parentPhone"
                type="tel"
                placeholder="+998901234567"
                className={input}
                required
              />
            </div>
            <div>
              <label className={label} htmlFor="parentPassword">
                {t("Ota-ona kabineti uchun parol")}
              </label>
              <input
                id="parentPassword"
                name="parentPassword"
                type="text"
                placeholder={t("bo'sh qoldirsangiz kabinet ochilmaydi")}
                className={input}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={label} htmlFor="diagnosis">
                {t("Tashxis / shikoyat")}
              </label>
              <input id="diagnosis" name="diagnosis" className={input} />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <label className={label} htmlFor="note">
                {t("Izoh")}
              </label>
              <input id="note" name="note" className={input} />
            </div>
            <div className="flex items-end">
              <button type="submit" className={`${btnPrimary} w-full`}>
                {t("Saqlash")}
              </button>
            </div>
          </form>
        </details>
      ) : null}

      <Card>
        {rows.length === 0 && !hasFilter ? (
          <Empty>{t("Hali mijoz qo'shilmagan.")}</Empty>
        ) : (
          <div className="scroll-x">
            <table className="w-full min-w-[1080px]">
              <thead className="border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className={th}>{t("Bola")}</th>
                  <th className={th}>{t("Yoshi")}</th>
                  {user.role === "OWNER" ? <th className={th}>{t("Filial")}</th> : null}
                  <th className={th}>{t("Mutaxassis")}</th>
                  <th className={th}>{t("Ota-ona")}</th>
                  <th className={th}>{t("Qolgan seans")}</th>
                  <th className={th}>{t("Qarz")}</th>
                  <th className={th}>{t("Holat")}</th>
                </tr>
                <ClientFilters
                  branches={user.role === "OWNER" ? branches.map((b) => ({ id: b.id, name: b.name })) : []}
                  specialists={specialists.map((x) => ({ id: x.id, name: x.user.fullName }))}
                  statuses={CLIENT_STATUS_KEYS.map((k) => ({ id: k, name: t(CLIENT_STATUSES[k]) }))}
                  ages={AGE_OPTIONS}
                />
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {visible.map((c) => (
                  <Fragment key={c.id}>
                  <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className={td}>
                      <Link
                        href={`/clients/${c.id}`}
                        className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                      >
                        {c.fullName}
                      </Link>
                      {c.diagnosis ? (
                        <span className="block max-w-[220px] truncate text-xs text-slate-400">
                          {c.diagnosis}
                        </span>
                      ) : null}
                    </td>
                    <td className={td}>{t.age(c.birthDate)}</td>
                    {user.role === "OWNER" ? <td className={td}>{c.branch.name}</td> : null}
                    <td className={td}>
                      <div className="flex flex-wrap gap-1">
                        {c.specialists.length === 0 ? (
                          <span className="text-xs text-slate-400">—</span>
                        ) : (
                          c.specialists.map((a) => (
                            <span key={a.id} className="block whitespace-nowrap">
                              <span className="text-sm text-slate-700 dark:text-slate-300">
                                {a.specialist.user.fullName}
                              </span>
                              <span className="ml-1.5 text-xs text-slate-400">
                                {t(SPECIALIZATIONS[a.specialist.specialization as Specialization])}
                              </span>
                            </span>
                          ))
                        )}
                      </div>
                    </td>
                    <td className={td}>
                      {c.parentName}
                      <span className="block text-xs text-slate-400">{c.parentPhone}</span>
                      {c.parent?.telegramId ? (
                        <span className="mt-0.5 block text-xs text-emerald-600 dark:text-emerald-400">
                          {t("Telegram ulangan")}
                        </span>
                      ) : (
                        <span
                          className="mt-0.5 block text-xs text-amber-600 dark:text-amber-400"
                          title={t("Eslatmalar bormaydi — mijoz kartasidan ulanish havolasini bering")}
                        >
                          {t("Telegram yo'q")}
                        </span>
                      )}
                    </td>
                    <td className={`${td} tabular-nums`}>
                      {/* Kunlik to'laydigan mijozning "qolgan seansi" 0 emas,
                          umuman yo'q. Qizil 0 yozib qo'yilsa bekorga qo'rqitadi. */}
                      {c.billingType !== "PACKAGE" ? (
                        <span className="text-slate-400" title={t("Har kelganida to'laydi")}>
                          {t("kunlik")}
                        </span>
                      ) : (
                        <span
                          className={
                            c.remaining === 0
                              ? "font-semibold text-rose-600 dark:text-rose-400"
                              : c.remaining <= 2
                                ? "font-semibold text-amber-600 dark:text-amber-400"
                                : ""
                          }
                        >
                          {c.remaining}
                        </span>
                      )}
                    </td>
                    <td className={`${td} tabular-nums`}>
                      {c.debt > 0 ? (
                        <span className="font-semibold text-rose-600 dark:text-rose-400">
                          {t.money(c.debt)}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className={td}>
                      <Badge className={STATUS_STYLE[c.status as ClientStatus]}>
                        {t(CLIENT_STATUSES[c.status as ClientStatus])}
                      </Badge>
                    </td>
                  </tr>
                  {/* Tahrirlash Xodimlar bo'limidagidek shu yerning o'zida ochiladi —
                      har safar mijoz kartasiga o'tib qaytish shart emas */}
                  {canManage ? (
                    <tr>
                      <td colSpan={colCount} className="px-4 pb-2">
                        <details>
                          <summary className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-slate-300 px-2 py-0.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                            ✎ {t("Tahrirlash")}
                          </summary>
                          {/* Jadval ekrandan keng — forma esa ko'rinib turgan qismga sig'sin
                              (chap tomonga yopishadi, kengligi cheklangan) */}
                          <div className="sticky left-4 mt-2 max-w-4xl rounded-lg bg-slate-50 p-3 dark:bg-slate-900/60">
                            <ClientEditForm
                              client={c}
                              branches={user.role === "OWNER" ? branches : []}
                              columns="sm:grid-cols-2 lg:grid-cols-3"
                            />
                          </div>
                        </details>
                      </td>
                    </tr>
                  ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

    </>
  );
}
