import { btn, card } from "@/components/ui";

export default function NotFound() {
  return (
    <div className={`${card} mx-auto max-w-lg p-6 text-center`}>
      <h1 className="text-lg font-bold text-slate-900 dark:text-white">Topilmadi</h1>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
        Siz izlagan sahifa yoki yozuv mavjud emas, yoki sizda unga ruxsat yo&apos;q.
      </p>
      <div className="mt-5 flex justify-center">
        <a href="/" className={btn}>
          Bosh sahifa
        </a>
      </div>
    </div>
  );
}
