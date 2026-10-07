import { btn, card } from "@/components/ui";
import { getT } from "@/lib/i18n/server";

export default async function NotFound() {
  const t = await getT();
  return (
    <div className={`${card} mx-auto max-w-lg p-6 text-center`}>
      <h1 className="text-lg font-bold text-slate-900 dark:text-white">{t("Topilmadi")}</h1>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
        {t("Siz izlagan sahifa yoki yozuv mavjud emas, yoki sizda unga ruxsat yo'q.")}
      </p>
      <div className="mt-5 flex justify-center">
        <a href="/" className={btn}>
          {t("Bosh sahifa")}
        </a>
      </div>
    </div>
  );
}
