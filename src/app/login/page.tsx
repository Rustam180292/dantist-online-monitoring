import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { btnPrimary, card, input, label } from "@/components/ui";
import { login } from "./actions";

const ERRORS: Record<string, string> = {
  bosh: "Telefon raqam va parolni kiriting.",
  notogri: "Telefon raqam yoki parol noto'g'ri.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) {
    redirect(
      user.role === "SPECIALIST" || user.role === "PARENT"
        ? "/m"
        : user.role === "RECEPTION"
          ? "/schedule"
          : "/",
    );
  }

  const { error } = await searchParams;
  const message = error ? ERRORS[error] ?? "Kirishda xatolik." : null;

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-lg font-bold text-white">
            L
          </div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white">
            Logopedik markaz CRM
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Tizimga kirish uchun ma&apos;lumotlaringizni kiriting
          </p>
        </div>

        <form action={login} className={`${card} space-y-4 p-5`}>
          {message ? (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-300">
              {message}
            </p>
          ) : null}

          <div>
            <label className={label} htmlFor="phone">
              Telefon raqam
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              autoComplete="username"
              placeholder="+998901234567"
              className={input}
              required
            />
          </div>

          <div>
            <label className={label} htmlFor="password">
              Parol
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              className={input}
              required
            />
          </div>

          <button type="submit" className={`${btnPrimary} w-full`}>
            Kirish
          </button>
        </form>

        <div className={`${card} mt-4 p-4 text-xs leading-relaxed text-slate-600 dark:text-slate-400`}>
          <p className="mb-2 font-semibold text-slate-700 dark:text-slate-300">
            Demo kirish (parol: <code className="font-mono">parol123</code>)
          </p>
          <ul className="space-y-1">
            <li>
              Markaz egasi — <code className="font-mono">+998901234567</code>
            </li>
            <li>
              Filial admini — <code className="font-mono">+998901110011</code>
            </li>
            <li>
              Mutaxassis — <code className="font-mono">+998901110101</code>
            </li>
          </ul>
        </div>
      </div>
    </main>
  );
}
