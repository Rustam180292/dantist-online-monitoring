import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SPECIALIZATIONS, SPECIALIZATION_KEYS, type Specialization } from "@/lib/constants";
import { getSpecialistBalances, getSpecialistRows, monthRange } from "@/lib/stats";
import { dateShort, money, monthYearUz, toDateInput } from "@/lib/format";
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
  createSpecialist,
  deletePayout,
  paySalary,
  toggleSpecialistActive,
  updateSalaryPercent,
} from "./actions";

export default async function SpecialistsPage() {
  const user = await requireRole("OWNER", "BRANCH_ADMIN");
  const branchId = user.role === "OWNER" ? null : user.branchId;
  const month = monthRange();

  const [rows, inactive, branches, balances, payouts] = await Promise.all([
    getSpecialistRows({ branchId, ...month }),
    prisma.specialist.findMany({
      where: { isActive: false, ...(branchId ? { branchId } : {}) },
      include: { user: { select: { fullName: true } }, branch: { select: { name: true } } },
    }),
    user.role === "OWNER" ? prisma.branch.findMany({ orderBy: { name: "asc" } }) : Promise.resolve([]),
    getSpecialistBalances({ branchId }),
    prisma.salaryPayout.findMany({
      where: { ...(branchId ? { branchId } : {}) },
      orderBy: { paidAt: "desc" },
      take: 15,
      include: { specialist: { include: { user: { select: { fullName: true } } } } },
    }),
  ]);

  const totalSalary = rows.reduce((s, r) => s + r.salary, 0);
  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);

  return (
    <>
      <PageHeader
        title="Mutaxassislar"
        subtitle={`${rows.length} ta faol mutaxassis · ${monthYearUz(new Date())}: xizmat ${money(
          totalRevenue,
        )}, ish haqi ${money(totalSalary)}`}
      />

      <details className={`${card} mb-5 p-4`}>
        <summary className="cursor-pointer text-sm font-semibold text-slate-800 dark:text-slate-200">
          + Yangi mutaxassis qo&apos;shish
        </summary>
        <form action={createSpecialist} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className={label} htmlFor="fullName">
              F.I.Sh. *
            </label>
            <input id="fullName" name="fullName" className={input} required />
          </div>
          <div>
            <label className={label} htmlFor="specialization">
              Mutaxassislik *
            </label>
            <select id="specialization" name="specialization" className={input} required>
              {SPECIALIZATION_KEYS.map((s) => (
                <option key={s} value={s}>
                  {SPECIALIZATIONS[s]}
                </option>
              ))}
            </select>
          </div>
          {branches.length > 0 ? (
            <div>
              <label className={label} htmlFor="branchId">
                Filial *
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
            <label className={label} htmlFor="phone">
              Telefon (login) *
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              placeholder="+998901234567"
              className={input}
              required
            />
          </div>
          <div>
            <label className={label} htmlFor="password">
              Parol *
            </label>
            <input id="password" name="password" type="text" className={input} required />
          </div>
          <div>
            <label className={label} htmlFor="salaryPercent">
              Ish haqi foizi (%)
            </label>
            <input
              id="salaryPercent"
              name="salaryPercent"
              type="number"
              min={0}
              max={100}
              defaultValue={40}
              className={input}
            />
          </div>
          <div className="flex items-end">
            <button type="submit" className={`${btnPrimary} w-full`}>
              Qo&apos;shish
            </button>
          </div>
        </form>
      </details>

      <Card title={`${monthYearUz(new Date())} natijalari`}>
        {rows.length === 0 ? (
          <Empty>Mutaxassis yo&apos;q.</Empty>
        ) : (
          <div className="scroll-x">
            <table className="w-full min-w-[900px]">
              <thead className="border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className={th}>Mutaxassis</th>
                  <th className={th}>Yo&apos;nalish</th>
                  {!branchId ? <th className={th}>Filial</th> : null}
                  <th className={th}>Mijoz</th>
                  <th className={th}>O&apos;tdi</th>
                  <th className={th}>Kelmadi</th>
                  <th className={th}>Rejada</th>
                  <th className={th}>Xizmat qiymati</th>
                  <th className={th}>Foiz</th>
                  <th className={th}>Ish haqi</th>
                  <th className={th} />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className={`${td} font-medium`}>{r.fullName}</td>
                    <td className={td}>
                      <Badge>{SPECIALIZATIONS[r.specialization as Specialization]}</Badge>
                    </td>
                    {!branchId ? <td className={td}>{r.branchName}</td> : null}
                    <td className={`${td} tabular-nums`}>{r.clients}</td>
                    <td className={`${td} font-semibold tabular-nums text-emerald-600 dark:text-emerald-400`}>
                      {r.done}
                    </td>
                    <td className={`${td} tabular-nums`}>{r.noShow}</td>
                    <td className={`${td} tabular-nums`}>{r.planned}</td>
                    <td className={`${td} tabular-nums`}>{money(r.revenue)}</td>
                    <td className={td}>
                      <form action={updateSalaryPercent} className="flex items-center gap-1">
                        <input type="hidden" name="specialistId" value={r.id} />
                        <input
                          name="salaryPercent"
                          type="number"
                          min={0}
                          max={100}
                          defaultValue={r.salaryPercent}
                          className="w-16 rounded-md border border-slate-300 px-2 py-1 text-sm tabular-nums dark:border-slate-700 dark:bg-slate-950"
                          aria-label="Ish haqi foizi"
                        />
                        <button type="submit" className="text-xs text-indigo-600 hover:underline">
                          saqlash
                        </button>
                      </form>
                    </td>
                    <td className={`${td} font-semibold tabular-nums`}>{money(r.salary)}</td>
                    <td className={td}>
                      <form action={toggleSpecialistActive}>
                        <input type="hidden" name="specialistId" value={r.id} />
                        <button type="submit" className="text-xs text-slate-400 hover:text-rose-600">
                          bo&apos;shatish
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card
        title="Ish haqi hisob-kitobi"
        subtitle="boshidan beri: hisoblangan − to'langan = qolgan"
        className="mt-5"
      >
        <div className="scroll-x">
          <table className="w-full min-w-[760px]">
            <thead className="border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className={th}>Mutaxassis</th>
                {!branchId ? <th className={th}>Filial</th> : null}
                <th className={th}>Hisoblangan</th>
                <th className={th}>To&apos;langan</th>
                <th className={th}>Qolgan</th>
                <th className={th}>To&apos;lab berish</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {balances.map((b) => (
                <tr key={b.specialistId}>
                  <td className={`${td} font-medium`}>
                    {b.fullName}
                    <span className="block text-xs text-slate-400">
                      {SPECIALIZATIONS[b.specialization as Specialization]}
                    </span>
                  </td>
                  {!branchId ? <td className={td}>{b.branchName}</td> : null}
                  <td className={`${td} tabular-nums`}>{money(b.accrued)}</td>
                  <td className={`${td} tabular-nums`}>{money(b.paid)}</td>
                  <td className={`${td} font-semibold tabular-nums`}>
                    <span
                      className={
                        b.balance > 0
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-emerald-600 dark:text-emerald-400"
                      }
                    >
                      {money(b.balance)}
                    </span>
                  </td>
                  <td className={td}>
                    <form action={paySalary} className="flex flex-wrap items-center gap-1.5">
                      <input type="hidden" name="specialistId" value={b.specialistId} />
                      <input type="hidden" name="paidAt" value={toDateInput(new Date())} />
                      <input
                        name="amount"
                        inputMode="numeric"
                        defaultValue={b.balance > 0 ? String(b.balance) : ""}
                        placeholder="summa"
                        className="w-28 rounded-md border border-slate-300 px-2 py-1 text-sm tabular-nums dark:border-slate-700 dark:bg-slate-950"
                        aria-label="To'lov summasi"
                        required
                      />
                      <select
                        name="method"
                        className="rounded-md border border-slate-300 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-950"
                        aria-label="To'lov usuli"
                      >
                        <option value="CASH">Naqd</option>
                        <option value="CARD">Karta</option>
                        <option value="TRANSFER">O&apos;tkazma</option>
                      </select>
                      <button type="submit" className="text-xs font-semibold text-indigo-600 hover:underline">
                        to&apos;lash
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {payouts.length > 0 ? (
          <div className="border-t border-slate-200 px-4 py-3 dark:border-slate-800">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Oxirgi to&apos;lovlar
            </p>
            <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
              {payouts.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 py-1.5">
                  <span className="text-slate-700 dark:text-slate-300">
                    {dateShort(p.paidAt)} · {p.specialist.user.fullName}
                    {p.note ? ` · ${p.note}` : ""}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="font-semibold tabular-nums text-slate-800 dark:text-slate-200">
                      {money(p.amount)}
                    </span>
                    <form action={deletePayout}>
                      <input type="hidden" name="payoutId" value={p.id} />
                      <button
                        type="submit"
                        className="text-xs text-slate-400 hover:text-rose-600"
                        title="O'chirish"
                      >
                        ✕
                      </button>
                    </form>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Card>

      {inactive.length > 0 ? (
        <Card title="Faol bo'lmaganlar" className="mt-5">
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {inactive.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                <div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    {s.user.fullName}
                  </p>
                  <p className="text-xs text-slate-400">
                    {SPECIALIZATIONS[s.specialization as Specialization]} · {s.branch.name}
                  </p>
                </div>
                <form action={toggleSpecialistActive}>
                  <input type="hidden" name="specialistId" value={s.id} />
                  <button type="submit" className={btn}>
                    Qaytarish
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </>
  );
}
