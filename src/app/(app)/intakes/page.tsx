import { Fragment } from "react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import {
  INTAKE_RESULTS,
  INTAKE_RESULT_KEYS,
  INTAKE_RESULT_STYLE,
  INTAKE_STATUSES,
  INTAKE_STATUS_STYLE,
  PAYMENT_METHODS,
  PAYMENT_METHOD_KEYS,
  SPECIALIZATIONS,
  type IntakeResult,
  type IntakeStatus,
  type Specialization,
} from "@/lib/constants";
import { monthRange } from "@/lib/stats";
import {
  ageUz,
  dateShort,
  money,
  monthYearUz,
  num,
  timeUz,
  toDateInput,
  toDateTimeInput,
} from "@/lib/format";
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
import {
  convertIntake,
  createIntake,
  deleteIntake,
  payIntake,
  setIntakeResult,
  setIntakeStatus,
  updateIntake,
} from "./actions";

/** Jadvaldagi tugmalar uchun qisqa yozuv — to'liq nomi ustunga sig'maydi */
const SHORT_STATUS: Record<IntakeStatus, string> = {
  PLANNED: "rejada",
  DONE: "o'tdi",
  NO_SHOW: "kelmadi",
  CANCELLED: "bekor",
};

type Search = { m?: string; b?: string };

export default async function IntakesPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const user = await requireRole("OWNER", "BRANCH_ADMIN", "RECEPTION");
  const sp = await searchParams;

  const offset = Number.parseInt(sp.m ?? "0", 10) || 0;
  const base = new Date();
  base.setDate(1);
  base.setMonth(base.getMonth() + offset);
  const { from, to } = monthRange(base);

  const branchId = user.role === "OWNER" ? (sp.b || null) : user.branchId;

  const [intakes, branches, specialists] = await Promise.all([
    prisma.intake.findMany({
      where: {
        scheduledAt: { gte: from, lt: to },
        ...(branchId ? { branchId } : {}),
      },
      orderBy: { scheduledAt: "desc" },
      include: {
        branch: { select: { name: true } },
        specialist: {
          select: { specialization: true, user: { select: { fullName: true } } },
        },
        client: { select: { id: true, fullName: true } },
      },
    }),
    user.role === "OWNER"
      ? prisma.branch.findMany({ orderBy: { name: "asc" } })
      : Promise.resolve([]),
    prisma.specialist.findMany({
      where: { isActive: true, ...(user.role === "OWNER" ? {} : { branchId: user.branchId ?? "" }) },
      include: { user: { select: { fullName: true } }, branch: { select: { name: true } } },
      orderBy: [{ branch: { name: "asc" } }, { user: { fullName: "asc" } }],
    }),
  ]);

  const paidSum = intakes.reduce((s, i) => s + (i.paidAt ? i.price : 0), 0);
  const unpaid = intakes.filter((i) => !i.paidAt && i.status === "DONE");
  const converted = intakes.filter((i) => i.result === "CONVERTED").length;
  const held = intakes.filter((i) => i.status === "DONE").length;

  const qs = (o: number) => {
    const p = new URLSearchParams();
    if (o !== 0) p.set("m", String(o));
    if (sp.b) p.set("b", sp.b);
    const s = p.toString();
    return s ? `/intakes?${s}` : "/intakes";
  };

  return (
    <>
      <PageHeader
        title="Qabullar"
        subtitle={`${monthYearUz(from)} · ${intakes.length} ta qabul`}
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

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Qabullar" value={num(intakes.length)} hint={`${held} tasi bo'lib o'tdi`} />
        <StatCard
          label="Mijoz bo'ldi"
          value={num(converted)}
          hint={held > 0 ? `${Math.round((converted / held) * 100)}%` : "hali yo'q"}
          tone={converted > 0 ? "good" : "default"}
        />
        <StatCard label="Konsultatsiyadan tushgan" value={money(paidSum)} tone="good" />
        <StatCard
          label="To'lanmagan"
          value={num(unpaid.length)}
          hint="o'tgan, lekin puli olinmagan"
          tone={unpaid.length > 0 ? "bad" : "default"}
        />
      </div>

      <details className={`${card} mt-5 p-4`}>
        <summary className="cursor-pointer text-sm font-semibold text-slate-800 dark:text-slate-200">
          + Yangi qabul yozish
        </summary>
        <form action={createIntake} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className={label} htmlFor="childName">
              Bolaning F.I.Sh. *
            </label>
            <input id="childName" name="childName" className={input} required />
          </div>
          <div>
            <label className={label} htmlFor="birthDate">
              Tug&apos;ilgan sana *
            </label>
            <input id="birthDate" name="birthDate" type="date" className={input} required />
          </div>
          <div>
            <label className={label} htmlFor="parentName">
              Ota-ona F.I.Sh. *
            </label>
            <input id="parentName" name="parentName" className={input} required />
          </div>
          <div>
            <label className={label} htmlFor="parentPhone">
              Telefon *
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
            <label className={label} htmlFor="scheduledAt">
              Qabul vaqti *
            </label>
            <input
              id="scheduledAt"
              name="scheduledAt"
              type="datetime-local"
              defaultValue={toDateTimeInput(new Date())}
              className={input}
              required
            />
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
            <label className={label} htmlFor="specialistId">
              Kim ko&apos;radi
            </label>
            <select id="specialistId" name="specialistId" className={input}>
              <option value="">Hali aniq emas</option>
              {specialists.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.user.fullName} · {SPECIALIZATIONS[s.specialization as Specialization]}
                  {branches.length > 0 ? ` · ${s.branch.name}` : ""}
                </option>
              ))}
            </select>
            {specialists.length === 0 ? (
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                Mutaxassis ro&apos;yxati bo&apos;sh.{" "}
                <Link href="/specialists" className="font-semibold underline">
                  Xodimlar
                </Link>{" "}
                bo&apos;limidan qo&apos;shing.
              </p>
            ) : null}
          </div>
          <div>
            <label className={label} htmlFor="price">
              Konsultatsiya narxi
            </label>
            <input
              id="price"
              name="price"
              inputMode="numeric"
              placeholder="150000"
              className={input}
            />
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className={label} htmlFor="note">
              Izoh (shikoyat, kim tavsiya qilgan)
            </label>
            <input id="note" name="note" className={input} />
          </div>
          <div className="flex items-end">
            <button type="submit" className={`${btnPrimary} w-full`}>
              Saqlash
            </button>
          </div>
        </form>
      </details>

      <Card className="mt-5">
        {intakes.length === 0 ? (
          <Empty>Bu oyda qabul yozilmagan.</Empty>
        ) : (
          <div className="scroll-x">
            <table className="w-full min-w-[1080px]">
              <thead className="border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className={th}>Qachon</th>
                  <th className={th}>Bola</th>
                  <th className={th}>Ota-ona</th>
                  <th className={th}>Kim ko&apos;rdi</th>
                  {!branchId ? <th className={th}>Filial</th> : null}
                  <th className={`${th} w-[190px]`}>Konsultatsiya puli</th>
                  <th className={`${th} w-[150px]`}>Holat</th>
                  <th className={`${th} w-[160px]`}>Natija</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {intakes.map((i) => (
                  <Fragment key={i.id}>
                  <tr className="align-top">
                    <td className={`${td} whitespace-nowrap`}>
                      {dateShort(i.scheduledAt)}
                      <span className="block text-xs text-slate-400">{timeUz(i.scheduledAt)}</span>
                    </td>
                    <td className={td}>
                      <span className="font-medium text-slate-800 dark:text-slate-200">
                        {i.childName}
                      </span>
                      <span className="block text-xs text-slate-400">{ageUz(i.birthDate)}</span>
                      {i.note ? (
                        <span className="block max-w-[200px] truncate text-xs text-slate-400">
                          {i.note}
                        </span>
                      ) : null}
                    </td>
                    <td className={td}>
                      {i.parentName}
                      <span className="block text-xs text-slate-400">{i.parentPhone}</span>
                    </td>
                    <td className={td}>
                      {i.specialist ? (
                        <>
                          {i.specialist.user.fullName}
                          <span className="block text-xs text-slate-400">
                            {SPECIALIZATIONS[i.specialist.specialization as Specialization]}
                          </span>
                        </>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    {!branchId ? <td className={td}>{i.branch.name}</td> : null}
                    <td className={td}>
                      {i.paidAt ? (
                        <>
                          <span className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                            {money(i.price)}
                          </span>
                          <span className="block text-xs text-slate-400">
                            {PAYMENT_METHODS[i.method as keyof typeof PAYMENT_METHODS]} ·{" "}
                            to&apos;landi
                          </span>
                          <form action={payIntake}>
                            <input type="hidden" name="intakeId" value={i.id} />
                            <button
                              type="submit"
                              className="text-xs text-slate-400 hover:text-rose-600"
                            >
                              to&apos;lovni qaytarish
                            </button>
                          </form>
                        </>
                      ) : (
                        <form action={payIntake} className="flex flex-wrap items-center gap-1.5">
                          <input type="hidden" name="intakeId" value={i.id} />
                          <input
                            name="price"
                            inputMode="numeric"
                            defaultValue={i.price || ""}
                            placeholder="summa"
                            aria-label="Konsultatsiya summasi"
                            className="w-24 rounded-lg border border-slate-200 px-2 py-1 text-sm tabular-nums dark:border-slate-700 dark:bg-slate-900"
                          />
                          <select
                            name="method"
                            aria-label="To'lov usuli"
                            className="rounded-lg border border-slate-200 px-1.5 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
                          >
                            {PAYMENT_METHOD_KEYS.map((m) => (
                              <option key={m} value={m}>
                                {PAYMENT_METHODS[m]}
                              </option>
                            ))}
                          </select>
                          <button
                            type="submit"
                            className="rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-indigo-700"
                          >
                            To&apos;landi
                          </button>
                        </form>
                      )}
                    </td>
                    <td className={td}>
                      <Badge className={INTAKE_STATUS_STYLE[i.status as IntakeStatus]}>
                        {INTAKE_STATUSES[i.status as IntakeStatus]}
                      </Badge>
                      {i.status === "PLANNED" ? (
                        <div className="mt-1 flex items-center gap-2 whitespace-nowrap">
                          {(["DONE", "NO_SHOW", "CANCELLED"] as IntakeStatus[]).map((s) => (
                            <form key={s} action={setIntakeStatus}>
                              <input type="hidden" name="intakeId" value={i.id} />
                              <input type="hidden" name="status" value={s} />
                              <button
                                type="submit"
                                className="text-xs text-slate-500 hover:text-indigo-600 dark:text-slate-400"
                              >
                                {SHORT_STATUS[s]}
                              </button>
                            </form>
                          ))}
                        </div>
                      ) : null}
                    </td>
                    <td className={td}>
                      {i.client ? (
                        <Link
                          href={`/clients/${i.client.id}`}
                          className="text-sm font-semibold text-emerald-700 hover:underline dark:text-emerald-400"
                        >
                          Mijoz bo&apos;ldi →
                        </Link>
                      ) : (
                        <>
                          <Badge className={INTAKE_RESULT_STYLE[i.result as IntakeResult]}>
                            {INTAKE_RESULTS[i.result as IntakeResult]}
                          </Badge>
                          <div className="mt-1 flex flex-col items-start gap-0.5 whitespace-nowrap">
                            {i.status === "DONE" ? (
                              <form action={convertIntake}>
                                <input type="hidden" name="intakeId" value={i.id} />
                                <button
                                  type="submit"
                                  className="text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
                                >
                                  Mijozga o&apos;tkazish
                                </button>
                              </form>
                            ) : null}
                            {INTAKE_RESULT_KEYS.filter(
                              (r) => r !== "CONVERTED" && r !== i.result,
                            ).map((r) => (
                              <form key={r} action={setIntakeResult}>
                                <input type="hidden" name="intakeId" value={i.id} />
                                <input type="hidden" name="result" value={r} />
                                <button
                                  type="submit"
                                  className="text-xs text-slate-500 hover:text-indigo-600 dark:text-slate-400"
                                >
                                  {INTAKE_RESULTS[r]}
                                </button>
                              </form>
                            ))}
                            <form action={deleteIntake}>
                              <input type="hidden" name="intakeId" value={i.id} />
                              <button
                                type="submit"
                                className="text-xs text-slate-400 hover:text-rose-600"
                              >
                                o&apos;chirish
                              </button>
                            </form>
                          </div>
                        </>
                      )}
                    </td>
                  </tr>
                  <tr className="border-b border-slate-100 dark:border-slate-800">
                    <td colSpan={branchId ? 7 : 8} className="px-4 pb-2">
                      <details>
                        <summary className="cursor-pointer text-xs text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400">
                          tahrirlash
                        </summary>
                        <form
                          action={updateIntake}
                          className="mt-2 grid gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-2 lg:grid-cols-4 dark:bg-slate-900/60"
                        >
                          <input type="hidden" name="intakeId" value={i.id} />
                          <div>
                            <label className={label}>Bolaning F.I.Sh.</label>
                            <input name="childName" defaultValue={i.childName} className={input} required />
                          </div>
                          <div>
                            <label className={label}>Tug&apos;ilgan sana</label>
                            <input
                              name="birthDate"
                              type="date"
                              defaultValue={toDateInput(i.birthDate)}
                              className={input}
                              required
                            />
                          </div>
                          <div>
                            <label className={label}>Ota-ona F.I.Sh.</label>
                            <input name="parentName" defaultValue={i.parentName} className={input} required />
                          </div>
                          <div>
                            <label className={label}>Telefon</label>
                            <input name="parentPhone" defaultValue={i.parentPhone} className={input} required />
                          </div>
                          <div>
                            <label className={label}>Qabul vaqti</label>
                            <input
                              name="scheduledAt"
                              type="datetime-local"
                              defaultValue={toDateTimeInput(i.scheduledAt)}
                              className={input}
                              required
                            />
                          </div>
                          <div>
                            <label className={label}>Kim ko&apos;radi</label>
                            <select
                              name="specialistId"
                              defaultValue={i.specialistId ?? ""}
                              className={input}
                            >
                              <option value="">Hali aniq emas</option>
                              {specialists
                                .filter((x) => x.branchId === i.branchId)
                                .map((x) => (
                                  <option key={x.id} value={x.id}>
                                    {x.user.fullName} ·{" "}
                                    {SPECIALIZATIONS[x.specialization as Specialization]}
                                  </option>
                                ))}
                            </select>
                          </div>
                          <div>
                            <label className={label}>Konsultatsiya narxi</label>
                            <input
                              name="price"
                              inputMode="numeric"
                              defaultValue={i.price || ""}
                              className={input}
                              disabled={Boolean(i.paidAt)}
                            />
                            {i.paidAt ? (
                              <p className="mt-1 text-xs text-slate-400">
                                To&apos;langan — summani o&apos;zgartirish uchun avval
                                to&apos;lovni qaytaring.
                              </p>
                            ) : null}
                          </div>
                          <div>
                            <label className={label}>Izoh</label>
                            <input name="note" defaultValue={i.note ?? ""} className={input} />
                          </div>
                          <div className="flex items-end">
                            <button type="submit" className={`${btnPrimary} w-full`}>
                              Saqlash
                            </button>
                          </div>
                        </form>
                      </details>
                    </td>
                  </tr>
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
