import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { clientScope, requireUser } from "@/lib/auth";
import {
  CLIENT_STATUSES,
  CLIENT_STATUS_KEYS,
  PAYMENT_METHODS,
  PAYMENT_METHOD_KEYS,
  SESSION_STATUSES,
  SESSION_STATUS_STYLE,
  SPECIALIZATIONS,
  SPECIALIZATION_KEYS,
  type ClientStatus,
  type PaymentMethod,
  type SessionStatus,
  type Specialization,
} from "@/lib/constants";
import { getClientPackages } from "@/lib/stats";
import { ageUz, dateShort, dateTimeUz, money, timeUz, toDateInput } from "@/lib/format";
import {
  Badge,
  Card,
  Empty,
  PageHeader,
  btn,
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
  assignSpecialist,
  deletePayment,
  setClientStatus,
  unassignSpecialist,
} from "../actions";

const NOTIFICATION_KINDS: Record<string, string> = {
  SESSION_REMINDER: "Ertangi mashg'ulot eslatmasi",
  SESSION_DONE: "Mashg'ulot o'tdi",
  PACKAGE_LOW: "Abonement tugayapti",
  DEBT: "To'lov eslatmasi",
};

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const isAdmin = user.role === "OWNER" || user.role === "BRANCH_ADMIN";

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
        include: { specialist: { include: { user: { select: { fullName: true } } } } },
      },
      payments: { orderBy: { paidAt: "desc" } },
    },
  });

  if (!client) notFound();

  const [packages, freeSpecialists, notifications] = await Promise.all([
    getClientPackages(client.id),
    isAdmin
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
    isAdmin
      ? prisma.notification.findMany({
          where: { clientId: client.id },
          orderBy: { createdAt: "desc" },
          take: 8,
        })
      : Promise.resolve([]),
  ]);

  const totalPaid = client.payments.reduce((s, p) => s + p.amount, 0);
  const totalDebt = packages.reduce((s, p) => s + p.debt, 0);
  const remaining = packages.reduce((s, p) => s + (p.isActive ? p.remaining : 0), 0);
  const doneCount = client.sessions.filter((s) => s.status === "DONE").length;

  return (
    <>
      <PageHeader
        title={client.fullName}
        subtitle={`${ageUz(client.birthDate)} · ${client.branch.name} · ${
          CLIENT_STATUSES[client.status as ClientStatus]
        }`}
        action={
          <Link href="/clients" className={btn}>
            ← Mijozlar
          </Link>
        }
      />

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          <Card title="Abonementlar" subtitle="qolgan seanslar va to'lov holati">
            {packages.length === 0 ? (
              <Empty>Abonement sotilmagan.</Empty>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {packages.map((p) => {
                  const pct = Math.min(Math.round((p.used / p.totalSessions) * 100), 100);
                  return (
                    <li key={p.id} className="px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                          {SPECIALIZATIONS[p.specialization as Specialization]}
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
                            {p.remaining} seans qoldi
                          </Badge>
                          {p.debt > 0 ? (
                            <Badge className="bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:ring-rose-900">
                              qarz {money(p.debt)}
                            </Badge>
                          ) : (
                            <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-900">
                              to&apos;langan
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
                        {p.used}/{p.totalSessions} seans ishlatilgan · seans narxi{" "}
                        {money(p.pricePerSession)} · jami {money(p.cost)} · to&apos;langan{" "}
                        {money(p.paid)}
                        {p.expiresAt ? ` · amal qiladi ${dateShort(p.expiresAt)} gacha` : ""}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}

            {isAdmin ? (
              <details className="border-t border-slate-200 p-4 dark:border-slate-800">
                <summary className="cursor-pointer text-sm font-semibold text-slate-800 dark:text-slate-200">
                  + Abonement sotish
                </summary>
                <form action={addPackage} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <input type="hidden" name="clientId" value={client.id} />
                  <div>
                    <label className={label} htmlFor="specialization">
                      Yo&apos;nalish
                    </label>
                    <select id="specialization" name="specialization" className={input} required>
                      {SPECIALIZATION_KEYS.map((s) => (
                        <option key={s} value={s}>
                          {SPECIALIZATIONS[s]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={label} htmlFor="totalSessions">
                      Seans soni
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
                    <label className={label} htmlFor="pricePerSession">
                      Bitta seans narxi (so&apos;m)
                    </label>
                    <input
                      id="pricePerSession"
                      name="pricePerSession"
                      inputMode="numeric"
                      placeholder="120000"
                      className={input}
                      required
                    />
                  </div>
                  <div>
                    <label className={label} htmlFor="prepaid">
                      Darhol to&apos;landi (so&apos;m)
                    </label>
                    <input id="prepaid" name="prepaid" inputMode="numeric" className={input} />
                  </div>
                  <div>
                    <label className={label} htmlFor="expiresAt">
                      Amal qilish muddati
                    </label>
                    <input id="expiresAt" name="expiresAt" type="date" className={input} />
                  </div>
                  <div className="flex items-end">
                    <button type="submit" className={`${btnPrimary} w-full`}>
                      Sotish
                    </button>
                  </div>
                </form>
              </details>
            ) : null}
          </Card>

          <Card title="Seanslar tarixi" subtitle="oxirgi 30 ta">
            {client.sessions.length === 0 ? (
              <Empty>Seans yo&apos;q.</Empty>
            ) : (
              <div className="scroll-x">
                <table className="w-full min-w-[620px]">
                  <thead className="border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className={th}>Sana</th>
                      <th className={th}>Vaqt</th>
                      <th className={th}>Mutaxassis</th>
                      <th className={th}>Holat</th>
                      <th className={th}>Narx</th>
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
                            {SPECIALIZATIONS[s.specialist.specialization as Specialization]}
                          </span>
                        </td>
                        <td className={td}>
                          <Badge className={SESSION_STATUS_STYLE[s.status as SessionStatus]}>
                            {SESSION_STATUSES[s.status as SessionStatus]}
                          </Badge>
                        </td>
                        <td className={`${td} tabular-nums`}>
                          {s.price > 0 ? money(s.price) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {isAdmin || user.role === "PARENT" ? (
            <Card title="To'lovlar" subtitle={`jami ${money(totalPaid)}`}>
              {client.payments.length === 0 ? (
                <Empty>To&apos;lov yo&apos;q.</Empty>
              ) : (
                <div className="scroll-x">
                  <table className="w-full min-w-[560px]">
                    <thead className="border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className={th}>Sana</th>
                        <th className={th}>Summa</th>
                        <th className={th}>Usul</th>
                        <th className={th}>Izoh</th>
                        {isAdmin ? <th className={th} /> : null}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {client.payments.map((p) => (
                        <tr key={p.id}>
                          <td className={`${td} tabular-nums`}>{dateTimeUz(p.paidAt)}</td>
                          <td className={`${td} font-semibold tabular-nums`}>{money(p.amount)}</td>
                          <td className={td}>{PAYMENT_METHODS[p.method as PaymentMethod]}</td>
                          <td className={td}>{p.note ?? "—"}</td>
                          {isAdmin ? (
                            <td className={td}>
                              <form action={deletePayment}>
                                <input type="hidden" name="paymentId" value={p.id} />
                                <button
                                  type="submit"
                                  className="text-xs text-slate-400 hover:text-rose-600"
                                  title="O'chirish"
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

              {isAdmin ? (
                <details className="border-t border-slate-200 p-4 dark:border-slate-800">
                  <summary className="cursor-pointer text-sm font-semibold text-slate-800 dark:text-slate-200">
                    + To&apos;lov qabul qilish
                  </summary>
                  <form action={addPayment} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <input type="hidden" name="clientId" value={client.id} />
                    <div>
                      <label className={label} htmlFor="amount">
                        Summa (so&apos;m)
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
                        Usul
                      </label>
                      <select id="method" name="method" className={input}>
                        {PAYMENT_METHOD_KEYS.map((m) => (
                          <option key={m} value={m}>
                            {PAYMENT_METHODS[m]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={label} htmlFor="paidAt">
                        Sana
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
                        Abonement
                      </label>
                      <select id="packageId" name="packageId" className={input}>
                        <option value="">Bog&apos;lanmagan</option>
                        {packages.map((p) => (
                          <option key={p.id} value={p.id}>
                            {SPECIALIZATIONS[p.specialization as Specialization]} ·{" "}
                            {p.totalSessions} seans
                            {p.debt > 0 ? ` (qarz ${money(p.debt)})` : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className={label} htmlFor="paymentNote">
                        Izoh
                      </label>
                      <input id="paymentNote" name="note" className={input} />
                    </div>
                    <div className="flex items-end">
                      <button type="submit" className={`${btnPrimary} w-full`}>
                        Qabul qilish
                      </button>
                    </div>
                  </form>
                </details>
              ) : null}
            </Card>
          ) : null}
        </div>

        <div className="space-y-5">
          <Card title="Qisqa ma'lumot">
            <dl className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
              <Row k="Ota-ona" v={client.parentName} />
              <Row k="Telefon" v={client.parentPhone} />
              <Row k="Tug'ilgan sana" v={dateShort(client.birthDate)} />
              <Row
                k="Jinsi"
                v={client.gender === "M" ? "O'g'il bola" : client.gender === "F" ? "Qiz bola" : "—"}
              />
              <Row k="Tashxis" v={client.diagnosis ?? "—"} />
              <Row k="Izoh" v={client.note ?? "—"} />
              <Row k="Qolgan seans" v={String(remaining)} />
              <Row k="Qarzdorlik" v={totalDebt > 0 ? money(totalDebt) : "yo'q"} />
              <Row k="O'tgan seans (oxirgi 30)" v={String(doneCount)} />
              <Row
                k="Ota-ona kabineti"
                v={client.parent ? `ochilgan (${client.parent.phone})` : "ochilmagan"}
              />
              <Row
                k="Telegram"
                v={client.parent?.telegramId ? "ulangan" : "ulanmagan"}
              />
            </dl>
          </Card>

          <Card title="Mutaxassislar">
            {client.specialists.length === 0 ? (
              <Empty>Biriktirilmagan.</Empty>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {client.specialists.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">
                        {a.specialist.user.fullName}
                      </p>
                      <p className="truncate text-xs text-slate-400">
                        {SPECIALIZATIONS[a.specialist.specialization as Specialization]}
                      </p>
                    </div>
                    {isAdmin ? (
                      <form action={unassignSpecialist}>
                        <input type="hidden" name="clientId" value={client.id} />
                        <input type="hidden" name="specialistId" value={a.specialistId} />
                        <button
                          type="submit"
                          className="text-xs text-slate-400 hover:text-rose-600"
                          title="Olib tashlash"
                        >
                          ✕
                        </button>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}

            {isAdmin && freeSpecialists.length > 0 ? (
              <form
                action={assignSpecialist}
                className="flex items-end gap-2 border-t border-slate-200 p-4 dark:border-slate-800"
              >
                <input type="hidden" name="clientId" value={client.id} />
                <div className="flex-1">
                  <label className={label} htmlFor="specialistId">
                    Biriktirish
                  </label>
                  <select id="specialistId" name="specialistId" className={input} required>
                    {freeSpecialists.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.user.fullName} — {SPECIALIZATIONS[s.specialization as Specialization]}
                      </option>
                    ))}
                  </select>
                </div>
                <button type="submit" className={btnPrimary}>
                  Qo&apos;shish
                </button>
              </form>
            ) : null}
          </Card>

          {isAdmin ? (
            <Card title="Ota-onaga ketgan xabarlar" subtitle="oxirgi 8 ta">
              {!client.parent?.telegramId ? (
                <Empty>
                  Ota-ona Telegram botga ulanmagan — unga avtomatik xabar bormaydi.
                </Empty>
              ) : notifications.length === 0 ? (
                <Empty>Hali xabar yuborilmagan.</Empty>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {notifications.map((n) => (
                    <li key={n.id} className="px-4 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                          {NOTIFICATION_KINDS[n.kind] ?? n.kind}
                        </span>
                        <Badge
                          className={
                            n.sentAt
                              ? "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-900"
                              : "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-900"
                          }
                        >
                          {n.sentAt ? "yuborildi" : "navbatda"}
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

          {isAdmin ? (
            <Card title="Holat">
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
                      {CLIENT_STATUSES[s]}
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
