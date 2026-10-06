import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  PAYMENT_METHODS,
  SESSION_STATUSES,
  SESSION_STATUS_STYLE,
  type PaymentMethod,
  type SessionStatus,
} from "@/lib/constants";
import { getSpecialistEarnings, monthRange } from "@/lib/stats";
import { dateShort, money, monthYearUz, timeUz } from "@/lib/format";
import { Badge, Card, Empty, PageHeader, StatCard, td, th } from "@/components/ui";

export default async function EarningsPage() {
  const user = await requireRole("SPECIALIST");
  const specialistId = user.specialistId!;
  const month = monthRange();

  const [earnings, sessions, payouts, specialist] = await Promise.all([
    getSpecialistEarnings(specialistId),
    prisma.session.findMany({
      where: {
        specialistId,
        startsAt: { gte: month.from, lt: month.to },
        status: { in: ["DONE", "NO_SHOW"] },
      },
      orderBy: { startsAt: "desc" },
      include: { client: { select: { fullName: true } } },
    }),
    prisma.salaryPayout.findMany({
      where: { specialistId },
      orderBy: { paidAt: "desc" },
      take: 20,
    }),
    prisma.specialist.findUnique({
      where: { id: specialistId },
      select: { salaryPercent: true },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Pulim"
        subtitle={`Ish haqi ulushim: ${specialist?.salaryPercent ?? 0}% · ${monthYearUz(new Date())}`}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Qolgan (olishim kerak)"
          value={money(earnings.balance)}
          hint="hisoblangan − to'langan"
          tone={earnings.balance > 0 ? "warn" : "good"}
        />
        <StatCard
          label="Shu oyda hisoblangan"
          value={money(earnings.accruedMonth)}
          hint={`${earnings.doneMonth} seans o'tdi`}
          tone="good"
        />
        <StatCard label="Jami hisoblangan" value={money(earnings.accruedTotal)} hint="boshidan beri" />
        <StatCard label="Jami to'langan" value={money(earnings.paidTotal)} hint="qo'lga tekkan" />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Card
          title={`${monthYearUz(new Date())} seanslari`}
          subtitle={`${sessions.length} ta hisobga kirgan seans`}
        >
          {sessions.length === 0 ? (
            <Empty>Bu oyda hisobga kirgan seans yo&apos;q.</Empty>
          ) : (
            <div className="scroll-x">
              <table className="w-full min-w-[560px]">
                <thead className="border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className={th}>Sana</th>
                    <th className={th}>Mijoz</th>
                    <th className={th}>Holat</th>
                    <th className={th}>Seans narxi</th>
                    <th className={th}>Menga</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {sessions.map((s) => {
                    const percent = s.salaryPercent ?? specialist?.salaryPercent ?? 0;
                    return (
                      <tr key={s.id}>
                        <td className={`${td} tabular-nums`}>
                          {dateShort(s.startsAt)}
                          <span className="block text-xs text-slate-400">{timeUz(s.startsAt)}</span>
                        </td>
                        <td className={td}>{s.client.fullName}</td>
                        <td className={td}>
                          <Badge className={SESSION_STATUS_STYLE[s.status as SessionStatus]}>
                            {SESSION_STATUSES[s.status as SessionStatus]}
                          </Badge>
                        </td>
                        <td className={`${td} tabular-nums`}>
                          {s.price > 0 ? (
                            money(s.price)
                          ) : (
                            // Narx abonementdan olinadi — faol abonement bo'lmasa
                            // 0 bo'lib qoladi va ulush ham 0 chiqadi
                            <span className="text-amber-600 dark:text-amber-400">
                              belgilanmagan
                            </span>
                          )}
                        </td>
                        <td className={`${td} font-semibold tabular-nums`}>
                          {money(Math.round((s.price * percent) / 100))}
                          <span className="block text-xs font-normal text-slate-400">{percent}%</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Qo'lga tekkan to'lovlar" subtitle="markaz menga to'lab bergan summalar">
          {payouts.length === 0 ? (
            <Empty>Hali to&apos;lov yozilmagan.</Empty>
          ) : (
            <div className="scroll-x">
              <table className="w-full min-w-[420px]">
                <thead className="border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className={th}>Sana</th>
                    <th className={th}>Summa</th>
                    <th className={th}>Usul</th>
                    <th className={th}>Izoh</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {payouts.map((p) => (
                    <tr key={p.id}>
                      <td className={`${td} tabular-nums`}>{dateShort(p.paidAt)}</td>
                      <td className={`${td} font-semibold tabular-nums`}>{money(p.amount)}</td>
                      <td className={td}>
                        <Badge>{PAYMENT_METHODS[p.method as PaymentMethod]}</Badge>
                      </td>
                      <td className={td}>{p.note ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
