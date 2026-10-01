import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_KEYS,
  SPECIALIZATIONS,
  type PaymentMethod,
  type Specialization,
} from "@/lib/constants";
import { getClientAlerts, monthRange } from "@/lib/stats";
import { dateTimeUz, money, monthYearUz } from "@/lib/format";
import {
  Badge,
  Card,
  Empty,
  PageHeader,
  StatCard,
  btn,
  btnPrimary,
  card,
  input,
  label,
  td,
  th,
} from "@/components/ui";

type Search = { m?: string; b?: string; pm?: string };

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const user = await requireRole("OWNER", "BRANCH_ADMIN");
  const sp = await searchParams;

  const offset = Number.parseInt(sp.m ?? "0", 10) || 0;
  const base = new Date();
  base.setDate(1);
  base.setMonth(base.getMonth() + offset);
  const { from, to } = monthRange(base);

  const branchId = user.role === "OWNER" ? (sp.b || null) : user.branchId;
  const methodFilter = PAYMENT_METHOD_KEYS.includes(sp.pm as PaymentMethod)
    ? (sp.pm as PaymentMethod)
    : null;

  const [payments, branches, alerts] = await Promise.all([
    prisma.payment.findMany({
      where: {
        paidAt: { gte: from, lt: to },
        ...(branchId ? { branchId } : {}),
        ...(methodFilter ? { method: methodFilter } : {}),
      },
      orderBy: { paidAt: "desc" },
      include: {
        client: { select: { id: true, fullName: true } },
        branch: { select: { name: true } },
        package: { select: { specialization: true } },
      },
    }),
    user.role === "OWNER" ? prisma.branch.findMany({ orderBy: { name: "asc" } }) : Promise.resolve([]),
    getClientAlerts({ branchId }),
  ]);

  const total = payments.reduce((s, p) => s + p.amount, 0);
  const byMethod = PAYMENT_METHOD_KEYS.map((m) => ({
    method: m,
    sum: payments.filter((p) => p.method === m).reduce((s, p) => s + p.amount, 0),
  }));
  const totalDebt = alerts.debtors.reduce((s, d) => s + d.debt, 0);

  const qs = (o: number) => {
    const p = new URLSearchParams();
    p.set("m", String(o));
    if (sp.b) p.set("b", sp.b);
    if (sp.pm) p.set("pm", sp.pm);
    return `/payments?${p.toString()}`;
  };

  return (
    <>
      <PageHeader
        title="To'lovlar"
        subtitle={`${monthYearUz(from)} · ${payments.length} ta to'lov`}
        action={
          <div className="flex gap-2">
            <Link href={qs(offset - 1)} className={btn}>
              ← O&apos;tgan oy
            </Link>
            {offset !== 0 ? (
              <Link href={qs(0)} className={btn}>
                Bu oy
              </Link>
            ) : null}
            {offset < 0 ? (
              <Link href={qs(offset + 1)} className={btn}>
                Keyingi oy →
              </Link>
            ) : null}
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Jami tushum" value={money(total)} tone="good" />
        {byMethod.map((m) => (
          <StatCard key={m.method} label={PAYMENT_METHODS[m.method]} value={money(m.sum)} />
        ))}
        <StatCard
          label="Qarzdorlik"
          value={money(totalDebt)}
          hint={`${alerts.debtors.length} ta abonement`}
          tone={totalDebt > 0 ? "bad" : "default"}
        />
      </div>

      <form method="get" className={`${card} my-5 flex flex-wrap items-end gap-3 p-4`}>
        <input type="hidden" name="m" value={offset} />
        {branches.length > 0 ? (
          <div className="min-w-[170px]">
            <label className={label} htmlFor="b">
              Filial
            </label>
            <select id="b" name="b" defaultValue={sp.b ?? ""} className={input}>
              <option value="">Barchasi</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="min-w-[150px]">
          <label className={label} htmlFor="pm">
            To&apos;lov usuli
          </label>
          <select id="pm" name="pm" defaultValue={sp.pm ?? ""} className={input}>
            <option value="">Barchasi</option>
            {PAYMENT_METHOD_KEYS.map((m) => (
              <option key={m} value={m}>
                {PAYMENT_METHODS[m]}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className={btnPrimary}>
          Filtrlash
        </button>
      </form>

      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2" title="To'lovlar ro'yxati">
          {payments.length === 0 ? (
            <Empty>Bu davrda to&apos;lov yo&apos;q.</Empty>
          ) : (
            <div className="scroll-x">
              <table className="w-full min-w-[720px]">
                <thead className="border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className={th}>Sana</th>
                    <th className={th}>Mijoz</th>
                    {!branchId ? <th className={th}>Filial</th> : null}
                    <th className={th}>Yo&apos;nalish</th>
                    <th className={th}>Usul</th>
                    <th className={th}>Summa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <td className={`${td} tabular-nums`}>{dateTimeUz(p.paidAt)}</td>
                      <td className={td}>
                        <Link
                          href={`/clients/${p.client.id}`}
                          className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                        >
                          {p.client.fullName}
                        </Link>
                      </td>
                      {!branchId ? <td className={td}>{p.branch.name}</td> : null}
                      <td className={td}>
                        {p.package
                          ? SPECIALIZATIONS[p.package.specialization as Specialization]
                          : "—"}
                      </td>
                      <td className={td}>
                        <Badge>{PAYMENT_METHODS[p.method as PaymentMethod]}</Badge>
                      </td>
                      <td className={`${td} font-semibold tabular-nums`}>{money(p.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Qarzdorlar" subtitle="to'liq to'lanmagan abonementlar">
          {alerts.debtors.length === 0 ? (
            <Empty>Qarzdor yo&apos;q.</Empty>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {alerts.debtors.map((d) => (
                <li
                  key={d.packageId}
                  className="flex items-center justify-between gap-2 px-4 py-2.5"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/clients/${d.clientId}`}
                      className="block truncate text-sm font-medium text-slate-800 hover:underline dark:text-slate-200"
                    >
                      {d.clientName}
                    </Link>
                    <p className="truncate text-xs text-slate-400">
                      {SPECIALIZATIONS[d.specialization as Specialization]} · {d.parentPhone}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-rose-600 dark:text-rose-400">
                    {money(d.debt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
