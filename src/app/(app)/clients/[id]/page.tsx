import Link from "next/link";
import { packageName } from "@/lib/packages";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { clientScope, requireUser, NOT_SOLO, isFrontDesk, isSolo } from "@/lib/auth";
import { branchTypeScope } from "@/lib/session-types";
import {
  BILLING_TYPES,
  CLIENT_STATUSES,
  CLIENT_STATUS_KEYS,
  PAYMENT_METHODS,
  PAYMENT_METHOD_KEYS,
  SESSION_STATUSES,
  SESSION_STATUS_STYLE,
  SPECIALIZATIONS,
  SPECIALIZATION_KEYS,
  type BillingType,
  type ClientStatus,
  type PaymentMethod,
  type SessionStatus,
  type Specialization,
} from "@/lib/constants";
import { getClientPackages } from "@/lib/stats";
import { dateShort, dateTimeUz, timeUz, toDateInput } from "@/lib/format";
import {
  Badge,
  Card,
  Empty,
  PageHeader,
  btn,
  btnDanger,
  btnPrimary,
  card,
  input,
  label,
  td,
  th,
} from "@/components/ui";
import {
  addPackage,
  addPayment,
  anonymizeClient,
  assignService,
  assignSpecialist,
  unassignService,
  deleteClient,
  deletePayment,
  setClientStatus,
  unassignSpecialist,
} from "../actions";
import { ClientEditForm } from "../edit-form";
import { getT } from "@/lib/i18n/server";

const NOTIFICATION_KINDS: Record<string, string> = {
  SESSION_REMINDER: "Ertangi mashg'ulot eslatmasi",
  SESSION_DONE: "Mashg'ulot o'tdi",
  PACKAGE_LOW: "Abonement tugayapti",
  DEBT: "To'lov eslatmasi",
};

export default async function ClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ochiq?: string }>;
}) {
  const { id } = await params;
  // Mijozlar ro'yxatidagi tugma to'g'ri bo'limni ochib keladi — xodim sahifani
  // ochgach yana qidirib o'tirmasin
  const { ochiq } = await searchParams;
  const user = await requireUser();
  const t = await getT();
  // Qabulxona xodimi mijoz bilan ishlaydi, lekin yozuvni o'chira olmaydi
  const canManage =
    isFrontDesk(user);
  const canDelete = user.role === "OWNER" || user.role === "BRANCH_ADMIN";


  const client = await prisma.client.findFirst({
    where: { id, ...clientScope(user) },
    include: {
      branch: true,
      parent: { select: { id: true, phone: true, telegramId: true } },
      specialists: {
        include: {
          specialist: {
            include: { user: { select: { fullName: true } } },
          },
        },
      },
      sessions: {
        orderBy: { startsAt: "desc" },
        take: 30,
        include: {
          specialist: { include: { user: { select: { fullName: true } } } },
          sessionType: { select: { name: true } },
        },
      },
      services: {
        orderBy: { createdAt: "asc" },
        include: { sessionType: { select: { id: true, name: true, price: true, isActive: true } } },
      },
      payments: { orderBy: { paidAt: "desc" } },
    },
  });

  if (!client) notFound();

  // Kunlik to'laydigan mijozda abonement tushunchasi yo'q — ekranlar shunga qarab
  // o'zgaradi
  const daily = client.billingType !== "PACKAGE";

  const [packages, freeSpecialists, notifications, branches, sessionCount, branchServices] = await Promise.all([
    getClientPackages(client.id),
    canManage
      ? prisma.specialist.findMany({
          where: {
            branchId: client.branchId,
            isActive: true,
            clients: { none: { clientId: client.id } },
          },
          include: { user: { select: { fullName: true } } },
          orderBy: { specialization: "asc" },
        })
      : Promise.resolve([]),
    canManage
      ? prisma.notification.findMany({
          where: { clientId: client.id },
          orderBy: { createdAt: "desc" },
          take: 8,
        })
      : Promise.resolve([]),
    // Filialni faqat markaz egasi o'zgartira oladi
    user.role === "OWNER"
      ? prisma.branch.findMany({ where: NOT_SOLO, orderBy: { name: "asc" } })
      : Promise.resolve([]),
    // Ro'yxat 30 ta bilan cheklangan, o'chirishda esa aniq son kerak
    prisma.session.count({ where: { clientId: client.id } }),
    // Shu filialga mos xizmatlar: markaz mijoziga — markaz xizmatlari,
    // yakka logoped mijoziga — uning o'z xizmatlari
    prisma.sessionType.findMany({
      where: { ...branchTypeScope(client.branch), isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, price: true },
    }),
  ]);
  const myServiceIds = new Set(client.services.map((x) => x.sessionTypeId));
  const freeServices = branchServices.filter((x) => !myServiceIds.has(x.id));
  // Abonement formasida mijozning o'z xizmatlari birinchi turadi
  const packageServices = [
    ...branchServices.filter((x) => myServiceIds.has(x.id)),
    ...freeServices,
  ];

  const totalPaid = client.payments.reduce((s, p) => s + p.amount, 0);
  const totalDebt = packages.reduce((s, p) => s + p.debt, 0);
  const remaining = packages.reduce((s, p) => s + (p.isActive ? p.remaining : 0), 0);
  const doneCount = client.sessions.filter((s) => s.status === "DONE").length;

  return (
    <>
      <PageHeader
        title={client.fullName}
        subtitle={`${t.age(client.birthDate)} · ${client.branch.name} · ${
          t(CLIENT_STATUSES[client.status as ClientStatus])
        } · ${t(BILLING_TYPES[(client.billingType as BillingType) ?? "DAILY"])}`}
        action={
          <Link href="/clients" className={btn}>
            ← {t("Mijozlar")}
          </Link>
        }
      />

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          <Card
            title={daily ? t("To'lov turi") : t("Abonementlar")}
            subtitle={
              daily
                ? t("bu mijoz har kelganida to'laydi")
                : t("qolgan seanslar va to'lov holati")
            }
          >
            {/* Kunlik to'laydigan mijozga abonement ro'yxatini ko'rsatishning
                ma'nosi yo'q — ekranni bekorga to'ldiradi. Lekin baribir
                abonementga o'tkazish mumkin: turi mijoz kartasidan almashtiriladi. */}
            {daily ? (
              <div className="space-y-2 p-4 text-sm text-slate-600 dark:text-slate-400">
                <p>
                  {t("Seans narxi mijozga biriktirilgan xizmatdan olinadi. Qolgan seans va qarzdorlik hisoblanmaydi.")}
                </p>
                <p>
                  {t("Abonementga o'tkazmoqchi bo'lsangiz, pastdagi")}
                  <b> {t("Mijoz ma'lumoti")}</b>{" "}
                  {t("bo'limida to'lov turini «Abonement» qilib saqlang.")}
                </p>
              </div>
            ) : packages.length === 0 ? (
              <Empty>{t("Abonement sotilmagan.")}</Empty>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {packages.map((p) => {
                  const pct = Math.min(Math.round((p.used / p.totalSessions) * 100), 100);
                  return (
                    <li key={p.id} className="px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                          {packageName(p, t)}
                        </p>
                        <div className="flex items-center gap-2">
                          <Badge
                            className={
                              p.remaining === 0
                                ? "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:ring-rose-900"
                                : p.remaining <= 2
                                  ? "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-900"
                                  : "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-900"
                            }
                          >
                            {t("{n} seans qoldi", { n: p.remaining })}
                          </Badge>
                          {p.debt > 0 ? (
                            <Badge className="bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:ring-rose-900">
                              {t("qarz {sum}", { sum: t.money(p.debt) })}
                            </Badge>
                          ) : (
                            <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-900">
                              {t("to'langan")}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <div
                          className="h-full rounded-full bg-indigo-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                        {t("{used}/{total} seans ishlatilgan", { used: p.used, total: p.totalSessions })} ·{" "}
                        {t("seans narxi {sum}", { sum: t.money(p.pricePerSession) })} ·{" "}
                        {t("jami {sum}", { sum: t.money(p.cost) })} ·{" "}
                        {t("to'langan {sum}", { sum: t.money(p.paid) })}
                        {p.expiresAt ? ` · ${t("amal qiladi {date} gacha", { date: dateShort(p.expiresAt) })}` : ""}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}

            {canManage && !daily ? (
              <details
                id="abonement"
                open={ochiq === "abonement"}
                className="border-t border-slate-200 p-4 dark:border-slate-800"
              >
                <summary className="cursor-pointer text-sm font-semibold text-slate-800 dark:text-slate-200">
                  + {t("Abonement sotish")}
                </summary>
                <form action={addPackage} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <input type="hidden" name="clientId" value={client.id} />
                  <div>
                    <label className={label} htmlFor="packageService">
                      {t("Xizmat")}
                    </label>
                    {/* Narx so'ralmaydi — xizmat narxidan olinadi */}
                    <select id="packageService" name="sessionTypeId" className={input} required>
                      {packageServices.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name} · {t.money(x.price)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={label} htmlFor="totalSessions">
                      {t("Seans soni")}
                    </label>
                    <input
                      id="totalSessions"
                      name="totalSessions"
                      type="number"
                      min={1}
                      max={100}
                      defaultValue={12}
                      className={input}
                      required
                    />
                  </div>
                  <div>
                    <label className={label} htmlFor="prepaid">
                      {t("Darhol to'landi ({currency})", { currency: t.currency })}
                    </label>
                    <input id="prepaid" name="prepaid" inputMode="numeric" className={input} />
                  </div>
                  <div>
                    <label className={label} htmlFor="expiresAt">
                      {t("Amal qilish muddati")}
                    </label>
                    <input id="expiresAt" name="expiresAt" type="date" className={input} />
                  </div>
                  <div className="flex items-end">
                    <button type="submit" className={`${btnPrimary} w-full`}>
                      {t("Sotish")}
                    </button>
                  </div>
                </form>
              </details>
            ) : null}
          </Card>

          <Card
            title={t("Seanslar tarixi")}
            subtitle={t("oxirgi 30 ta")}
            action={
              // Mijozlar ro'yxatidagi "Seans" tugmasi olib tashlangani uchun
              // yangi seans yozish shu yerdan, mijoz tanlangan holda ochiladi
              canManage && client.status === "ACTIVE" ? (
                <Link
                  href={`/schedule?yangi=${client.id}#yangi`}
                  className="text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
                >
                  + {t("Seans yozish")}
                </Link>
              ) : undefined
            }
          >
            {client.sessions.length === 0 ? (
              <Empty>{t("Seans yo'q.")}</Empty>
            ) : (
              <div className="scroll-x">
                <table className="w-full min-w-[620px]">
                  <thead className="border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className={th}>{t("Sana")}</th>
                      <th className={th}>{t("Vaqt")}</th>
                      <th className={th}>{t("Mutaxassis")}</th>
                      <th className={th}>{t("Holat")}</th>
                      <th className={th}>{t("Narx")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {client.sessions.map((s) => (
                      <tr key={s.id}>
                        <td className={`${td} tabular-nums`}>{dateShort(s.startsAt)}</td>
                        <td className={`${td} tabular-nums`}>{timeUz(s.startsAt)}</td>
                        <td className={td}>
                          {s.specialist.user.fullName}
                          <span className="block text-xs text-slate-400">
                            {s.sessionType?.name ?? t(SPECIALIZATIONS[s.specialist.specialization as Specialization])}
                          </span>
                        </td>
                        <td className={td}>
                          <Badge className={SESSION_STATUS_STYLE[s.status as SessionStatus]}>
                            {t(SESSION_STATUSES[s.status as SessionStatus])}
                          </Badge>
                        </td>
                        <td className={`${td} tabular-nums`}>
                          {s.price > 0 ? t.money(s.price) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {canManage || user.role === "PARENT" ? (
            <Card title={t("To'lovlar")} subtitle={t("jami {sum}", { sum: t.money(totalPaid) })}>
              {client.payments.length === 0 ? (
                <Empty>{t("To'lov yo'q.")}</Empty>
              ) : (
                <div className="scroll-x">
                  <table className="w-full min-w-[560px]">
                    <thead className="border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className={th}>{t("Sana")}</th>
                        <th className={th}>{t("Summa")}</th>
                        <th className={th}>{t("Usul")}</th>
                        <th className={th}>{t("Izoh")}</th>
                        {canDelete ? <th className={th} /> : null}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {client.payments.map((p) => (
                        <tr key={p.id}>
                          <td className={`${td} tabular-nums`}>{dateTimeUz(p.paidAt)}</td>
                          <td className={`${td} font-semibold tabular-nums`}>{t.money(p.amount)}</td>
                          <td className={td}>{t(PAYMENT_METHODS[p.method as PaymentMethod])}</td>
                          <td className={td}>{p.note ?? "—"}</td>
                          {canDelete ? (
                            <td className={td}>
                              <form action={deletePayment}>
                                <input type="hidden" name="paymentId" value={p.id} />
                                <button
                                  type="submit"
                                  className="text-xs text-slate-400 hover:text-rose-600"
                                  title={t("O'chirish")}
                                >
                                  ✕
                                </button>
                              </form>
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {canManage ? (
                <details
                  id="tolov"
                  open={ochiq === "tolov"}
                  className="border-t border-slate-200 p-4 dark:border-slate-800"
                >
                  <summary className="cursor-pointer text-sm font-semibold text-slate-800 dark:text-slate-200">
                    + {t("To'lov qabul qilish")}
                  </summary>
                  <form action={addPayment} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <input type="hidden" name="clientId" value={client.id} />
                    <div>
                      <label className={label} htmlFor="amount">
                        {t("Summa ({currency})", { currency: t.currency })}
                      </label>
                      <input
                        id="amount"
                        name="amount"
                        inputMode="numeric"
                        placeholder="500000"
                        className={input}
                        required
                      />
                    </div>
                    <div>
                      <label className={label} htmlFor="method">
                        {t("Usul")}
                      </label>
                      <select id="method" name="method" className={input}>
                        {PAYMENT_METHOD_KEYS.map((m) => (
                          <option key={m} value={m}>
                            {t(PAYMENT_METHODS[m])}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={label} htmlFor="paidAt">
                        {t("Sana")}
                      </label>
                      <input
                        id="paidAt"
                        name="paidAt"
                        type="date"
                        defaultValue={toDateInput(new Date())}
                        className={input}
                      />
                    </div>
                    <div>
                      <label className={label} htmlFor="packageId">
                        {t("Abonement")}
                      </label>
                      <select id="packageId" name="packageId" className={input}>
                        <option value="">{t("Avtomatik — qarzi bor abonementga")}</option>
                        {packages.map((p) => (
                          <option key={p.id} value={p.id}>
                            {packageName(p, t)} ·{" "}
                            {t("{n} seans", { n: p.totalSessions })}
                            {p.debt > 0 ? ` (${t("qarz {sum}", { sum: t.money(p.debt) })})` : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className={label} htmlFor="paymentNote">
                        {t("Izoh")}
                      </label>
                      <input id="paymentNote" name="note" className={input} />
                    </div>
                    <div className="flex items-end">
                      <button type="submit" className={`${btnPrimary} w-full`}>
                        {t("Qabul qilish")}
                      </button>
                    </div>
                  </form>
                </details>
              ) : null}
            </Card>
          ) : null}
          {canManage ? (
            <Card title={t("Mijoz ma'lumoti")} subtitle={t("xato yozilgan bo'lsa shu yerdan tuzating")}>
              <div className="p-4">
                <ClientEditForm client={client} branches={branches} />
              </div>
            </Card>
          ) : null}
        </div>

        <div className="space-y-5">
          <Card title={t("Qisqa ma'lumot")}>
            <dl className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
              <Row k={t("Ota-ona")} v={client.parentName} />
              <Row k={t("Telefon")} v={client.parentPhone} />
              <Row k={t("Tug'ilgan sana")} v={dateShort(client.birthDate)} />
              <Row
                k={t("Jinsi")}
                v={client.gender === "M" ? t("O'g'il bola") : client.gender === "F" ? t("Qiz bola") : "—"}
              />
              <Row k={t("Tashxis")} v={client.diagnosis ?? "—"} />
              <Row k={t("Izoh")} v={client.note ?? "—"} />
              <Row k={t("Qolgan seans")} v={String(remaining)} />
              <Row k={t("Qarzdorlik")} v={totalDebt > 0 ? t.money(totalDebt) : t("yo'q")} />
              <Row k={t("O'tgan seans (oxirgi 30)")} v={String(doneCount)} />
              <Row
                k={t("Ota-ona kabineti")}
                v={client.parent ? `${t("ochilgan")} (${client.parent.phone})` : t("ochilmagan")}
              />
              <Row
                k="Telegram"
                v={client.parent?.telegramId ? t("ulangan") : t("ulanmagan")}
              />
            </dl>
          </Card>

          <Card title={t("Xizmatlar")} subtitle={t("seans va abonement shu xizmat narxida yoziladi")}>
            <div data-testid="client-services">
              {client.services.length === 0 ? (
                <Empty>{t("Xizmat biriktirilmagan — seans yozishdan oldin qo'shing.")}</Empty>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {client.services.map((x) => (
                    <li key={x.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">
                          {x.sessionType.name}
                        </p>
                        <p className="text-xs tabular-nums text-slate-400">
                          {t.money(x.sessionType.price)}
                          {x.sessionType.isActive ? "" : ` · ${t("ro'yxatdan olingan")}`}
                        </p>
                      </div>
                      {canManage ? (
                        <form action={unassignService}>
                          <input type="hidden" name="clientId" value={client.id} />
                          <input type="hidden" name="sessionTypeId" value={x.sessionTypeId} />
                          <button
                            type="submit"
                            className="text-xs text-slate-400 hover:text-rose-600"
                            title={t("Olib tashlash")}
                          >
                            ✕
                          </button>
                        </form>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {canManage && freeServices.length > 0 ? (
              <form
                action={assignService}
                className="flex items-end gap-2 border-t border-slate-200 p-4 dark:border-slate-800"
              >
                <input type="hidden" name="clientId" value={client.id} />
                <div className="flex-1">
                  <label className={label} htmlFor="assignService">
                    {t("Xizmat qo'shish")}
                  </label>
                  <select id="assignService" name="sessionTypeId" className={input} required>
                    {freeServices.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name} · {t.money(x.price)}
                      </option>
                    ))}
                  </select>
                </div>
                <button type="submit" className={btnPrimary}>
                  {t("Qo'shish")}
                </button>
              </form>
            ) : null}
          </Card>

          <Card title={t("Mutaxassislar")}>
            {client.specialists.length === 0 ? (
              <Empty>{t("Biriktirilmagan.")}</Empty>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {client.specialists.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">
                        {a.specialist.user.fullName}
                      </p>
                      <p className="truncate text-xs text-slate-400">
                        {t(SPECIALIZATIONS[a.specialist.specialization as Specialization])}
                      </p>
                    </div>
                    {canManage ? (
                      <form action={unassignSpecialist}>
                        <input type="hidden" name="clientId" value={client.id} />
                        <input type="hidden" name="specialistId" value={a.specialistId} />
                        <button
                          type="submit"
                          className="text-xs text-slate-400 hover:text-rose-600"
                          title={t("Olib tashlash")}
                        >
                          ✕
                        </button>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}

            {canManage && freeSpecialists.length > 0 ? (
              <form
                action={assignSpecialist}
                className="flex items-end gap-2 border-t border-slate-200 p-4 dark:border-slate-800"
              >
                <input type="hidden" name="clientId" value={client.id} />
                <div className="flex-1">
                  <label className={label} htmlFor="specialistId">
                    {t("Biriktirish")}
                  </label>
                  <select id="specialistId" name="specialistId" className={input} required>
                    {freeSpecialists.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.user.fullName} — {t(SPECIALIZATIONS[s.specialization as Specialization])}
                      </option>
                    ))}
                  </select>
                </div>
                <button type="submit" className={btnPrimary}>
                  {t("Qo'shish")}
                </button>
              </form>
            ) : null}
          </Card>

          {canManage ? (
            <Card title={t("Ota-onaga ketgan xabarlar")} subtitle={t("oxirgi 8 ta")}>
              {!client.parent?.telegramId ? (
                <Empty>
                  {t("Ota-ona Telegram botga ulanmagan — unga avtomatik xabar bormaydi.")}
                </Empty>
              ) : notifications.length === 0 ? (
                <Empty>{t("Hali xabar yuborilmagan.")}</Empty>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {notifications.map((n) => (
                    <li key={n.id} className="px-4 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                          {NOTIFICATION_KINDS[n.kind] ? t(NOTIFICATION_KINDS[n.kind]) : n.kind}
                        </span>
                        <Badge
                          className={
                            n.sentAt
                              ? "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-900"
                              : "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-900"
                          }
                        >
                          {n.sentAt ? t("yuborildi") : t("navbatda")}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-400">
                        {dateTimeUz(n.sentAt ?? n.createdAt)}
                        {n.error ? ` · ${n.error}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ) : null}

          {user.role === "OWNER" ? (
            <Card
              title={t("Xavfli amallar")}
              subtitle={t("qaytarib bo'lmaydi")}
              className="mt-5 border-rose-200 dark:border-rose-900"
            >
              <div className="space-y-4 p-4 text-sm">
                <div>
                  <p className="font-semibold text-slate-800 dark:text-slate-200">
                    {t("Shaxsiy ma'lumotni tozalash")}
                  </p>
                  <p className="mt-1 text-slate-600 dark:text-slate-400">
                    {t(
                      "Bolaning va ota-onasining ismi, telefoni, tashxisi o'chadi. Seans va to'lov yozuvlari raqam bo'lib qoladi — kassa va ish haqi hisobi o'zgarmaydi.",
                    )}
                  </p>
                  <form action={anonymizeClient} className="mt-2 flex flex-wrap items-end gap-2">
                    <input type="hidden" name="clientId" value={client.id} />
                    <div className="min-w-[200px] flex-1">
                      <label className={label} htmlFor="confirmAnon">
                        {t("Tasdiqlash uchun bolaning ismini yozing")}
                      </label>
                      <input
                        id="confirmAnon"
                        name="confirmName"
                        placeholder={client.fullName}
                        className={input}
                        required
                      />
                    </div>
                    <button type="submit" className={btnDanger}>
                      {t("Tozalash")}
                    </button>
                  </form>
                </div>

                <div className="border-t border-slate-200 pt-4 dark:border-slate-800">
                  <p className="font-semibold text-rose-700 dark:text-rose-400">
                    {t("Butunlay o'chirish")}
                  </p>
                  <p className="mt-1 text-slate-600 dark:text-slate-400">
                    {t(
                      "Mijoz bilan birga {sessions} ta seans, {payments} ta to'lov va {packages} ta abonement o'chadi. O'tgan oylardagi hisobot raqamlari ham o'zgaradi.",
                      {
                        sessions: sessionCount,
                        payments: client.payments.length,
                        packages: packages.length,
                      },
                    )}
                  </p>
                  <form action={deleteClient} className="mt-2 flex flex-wrap items-end gap-2">
                    <input type="hidden" name="clientId" value={client.id} />
                    <div className="min-w-[200px] flex-1">
                      <label className={label} htmlFor="confirmDel">
                        {t("Tasdiqlash uchun bolaning ismini yozing")}
                      </label>
                      <input
                        id="confirmDel"
                        name="confirmName"
                        placeholder={client.fullName}
                        className={input}
                        required
                      />
                    </div>
                    <button type="submit" className={btnDanger}>
                      {t("Butunlay o'chirish")}
                    </button>
                  </form>
                </div>
              </div>
            </Card>
          ) : null}

          {canManage ? (
            <Card title={t("Holat")}>
              <div className="flex flex-wrap gap-2 p-4">
                {CLIENT_STATUS_KEYS.map((s) => (
                  <form key={s} action={setClientStatus}>
                    <input type="hidden" name="clientId" value={client.id} />
                    <input type="hidden" name="status" value={s} />
                    <button
                      type="submit"
                      disabled={client.status === s}
                      className={`${btn} ${
                        client.status === s ? "border-indigo-300 text-indigo-700" : ""
                      }`}
                    >
                      {t(CLIENT_STATUSES[s])}
                    </button>
                  </form>
                ))}
              </div>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3 px-4 py-2.5">
      <dt className="shrink-0 text-slate-500 dark:text-slate-400">{k}</dt>
      <dd className="text-right font-medium text-slate-800 dark:text-slate-200">{v}</dd>
    </div>
  );
}
