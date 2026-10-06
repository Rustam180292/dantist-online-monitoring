import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { money, num } from "@/lib/format";
import { monthRange } from "@/lib/stats";
import {
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
import { createBranch, deleteBranch, updateBranch } from "./actions";

export default async function BranchesPage() {
  await requireRole("OWNER");
  const { from, to } = monthRange();

  const branches = await prisma.branch.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: { select: { clients: true, specialists: true, intakes: true } },
    },
  });

  // Shu oydagi tushum — qaysi filial qancha ishlayotganini ko'rsatadi
  const income = await Promise.all(
    branches.map(async (b) => {
      const [pay, intake] = await Promise.all([
        prisma.payment.aggregate({
          where: { branchId: b.id, paidAt: { gte: from, lt: to } },
          _sum: { amount: true },
        }),
        prisma.intake.aggregate({
          where: { branchId: b.id, paidAt: { gte: from, lt: to } },
          _sum: { price: true },
        }),
      ]);
      return (pay._sum.amount ?? 0) + (intake._sum.price ?? 0);
    }),
  );

  return (
    <>
      <PageHeader
        title="Filiallar"
        subtitle={`${branches.length} ta filial`}
      />

      <details className={`${card} mb-5 p-4`} open={branches.length === 0}>
        <summary className="cursor-pointer text-sm font-semibold text-slate-800 dark:text-slate-200">
          + Yangi filial qo&apos;shish
        </summary>
        <form action={createBranch} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className={label} htmlFor="name">
              Filial nomi *
            </label>
            <input
              id="name"
              name="name"
              placeholder="Chilonzor filiali"
              className={input}
              required
            />
          </div>
          <div className="lg:col-span-2">
            <label className={label} htmlFor="address">
              Manzil
            </label>
            <input id="address" name="address" className={input} />
          </div>
          <div>
            <label className={label} htmlFor="phone">
              Telefon
            </label>
            <input id="phone" name="phone" type="tel" className={input} />
          </div>
          <div className="flex items-end">
            <button type="submit" className={`${btnPrimary} w-full`}>
              Qo&apos;shish
            </button>
          </div>
        </form>
      </details>

      <Card>
        {branches.length === 0 ? (
          <Empty>Hali filial qo&apos;shilmagan.</Empty>
        ) : (
          <div className="scroll-x">
            <table className="w-full min-w-[820px]">
              <thead className="border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className={th}>Filial</th>
                  <th className={th}>Mijoz</th>
                  <th className={th}>Mutaxassis</th>
                  <th className={th}>Qabul</th>
                  <th className={th}>Shu oy tushum</th>
                  <th className={th} />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {branches.map((b, i) => (
                  <tr key={b.id} className="align-top">
                    <td className={td}>
                      <span className="font-medium text-slate-800 dark:text-slate-200">
                        {b.name}
                      </span>
                      {b.address ? (
                        <span className="block text-xs text-slate-400">{b.address}</span>
                      ) : null}
                      {b.phone ? (
                        <span className="block text-xs text-slate-400">{b.phone}</span>
                      ) : null}

                      <details className="mt-1">
                        <summary className="cursor-pointer text-xs text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400">
                          tahrirlash
                        </summary>
                        <form
                          action={updateBranch}
                          className="mt-2 grid gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-2 dark:bg-slate-900/60"
                        >
                          <input type="hidden" name="branchId" value={b.id} />
                          <div>
                            <label className={label}>Nomi</label>
                            <input name="name" defaultValue={b.name} className={input} required />
                          </div>
                          <div>
                            <label className={label}>Manzil</label>
                            <input name="address" defaultValue={b.address ?? ""} className={input} />
                          </div>
                          <div>
                            <label className={label}>Telefon</label>
                            <input name="phone" defaultValue={b.phone ?? ""} className={input} />
                          </div>
                          <div className="flex items-end">
                            <button type="submit" className={`${btnPrimary} w-full`}>
                              Saqlash
                            </button>
                          </div>
                        </form>
                      </details>
                    </td>
                    <td className={`${td} tabular-nums`}>{num(b._count.clients)}</td>
                    <td className={`${td} tabular-nums`}>{num(b._count.specialists)}</td>
                    <td className={`${td} tabular-nums`}>{num(b._count.intakes)}</td>
                    <td className={`${td} font-semibold tabular-nums`}>{money(income[i])}</td>
                    <td className={td}>
                      <form action={deleteBranch}>
                        <input type="hidden" name="branchId" value={b.id} />
                        <button
                          type="submit"
                          className="text-xs text-slate-400 hover:text-rose-600"
                        >
                          o&apos;chirish
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

      <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
        Filialni faqat bo&apos;sh bo&apos;lsa o&apos;chirish mumkin. Ichida mijoz, mutaxassis
        yoki to&apos;lov bo&apos;lsa, o&apos;chirish o&apos;rniga nomini o&apos;zgartiring.
      </p>
    </>
  );
}
