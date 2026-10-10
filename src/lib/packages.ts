import { SPECIALIZATIONS, type Specialization } from "@/lib/constants";

type Named = {
  specialization: string | null;
  sessionType?: { name: string } | null;
  serviceName?: string | null;
};

/**
 * Abonement nomi: yangilari xizmatga bog'langan ("Massaj"), eskilari
 * yo'nalishga ("Massajchi"). Ikkalasi ham bazada qoladi — eski abonementda
 * qolgan seanslar yo'qolmasin — shuning uchun nom bitta joyda tanlanadi.
 *
 * `tr` — tarjima (interfeysda `t`); Telegram xabarlari o'zbekcha, ularga
 * berilmaydi.
 */
export function packageName(p: Named, tr: (s: string) => string = (s) => s): string {
  const service = p.serviceName ?? p.sessionType?.name;
  if (service) return service;
  if (!p.specialization) return tr("Abonement");
  const label = SPECIALIZATIONS[p.specialization as Specialization];
  return label ? tr(label) : p.specialization;
}
