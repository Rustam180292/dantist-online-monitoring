/** Rollar va ularning o'zbekcha nomlari */
export const ROLES = {
  OWNER: "Markaz egasi",
  BRANCH_ADMIN: "Filial admini",
  SPECIALIST: "Mutaxassis",
  PARENT: "Ota-ona",
} as const;

export type Role = keyof typeof ROLES;
export const ROLE_KEYS = Object.keys(ROLES) as Role[];

/** Mutaxassislik turlari */
export const SPECIALIZATIONS = {
  ABA: "ABA terapevt",
  LOGOPED: "Logoped-defektolog",
  AFK: "AFK (adaptiv jismoniy tarbiya)",
  MASSAGE: "Massajchi",
  PSYCHOLOGIST: "Psixolog",
  SENSORY: "Sensor integratsiya",
} as const;

export type Specialization = keyof typeof SPECIALIZATIONS;
export const SPECIALIZATION_KEYS = Object.keys(SPECIALIZATIONS) as Specialization[];

/** Seans holatlari */
export const SESSION_STATUSES = {
  PLANNED: "Rejada",
  DONE: "O'tdi",
  NO_SHOW: "Kelmadi (sababsiz)",
  CANCELLED_CLIENT: "Mijoz bekor qildi",
  CANCELLED_CENTER: "Markaz bekor qildi",
} as const;

export type SessionStatus = keyof typeof SESSION_STATUSES;
export const SESSION_STATUS_KEYS = Object.keys(SESSION_STATUSES) as SessionStatus[];

/** Seans holatining rangi (Tailwind klasslari) */
export const SESSION_STATUS_STYLE: Record<SessionStatus, string> = {
  PLANNED: "bg-slate-100 text-slate-700 ring-slate-200",
  DONE: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  NO_SHOW: "bg-rose-50 text-rose-700 ring-rose-200",
  CANCELLED_CLIENT: "bg-amber-50 text-amber-700 ring-amber-200",
  CANCELLED_CENTER: "bg-sky-50 text-sky-700 ring-sky-200",
};

/** Mijoz holati */
export const CLIENT_STATUSES = {
  ACTIVE: "Faol",
  PAUSED: "To'xtatilgan",
  ARCHIVED: "Arxivda",
} as const;

export type ClientStatus = keyof typeof CLIENT_STATUSES;
export const CLIENT_STATUS_KEYS = Object.keys(CLIENT_STATUSES) as ClientStatus[];

/** To'lov usullari */
export const PAYMENT_METHODS = {
  CASH: "Naqd",
  CARD: "Karta",
  TRANSFER: "O'tkazma",
} as const;

export type PaymentMethod = keyof typeof PAYMENT_METHODS;
export const PAYMENT_METHOD_KEYS = Object.keys(PAYMENT_METHODS) as PaymentMethod[];

/** Hisob-kitobda "o'tgan" deb sanaladigan holatlar (mutaxassis haqi shulardan) */
export const BILLABLE_STATUSES: SessionStatus[] = ["DONE", "NO_SHOW"];
