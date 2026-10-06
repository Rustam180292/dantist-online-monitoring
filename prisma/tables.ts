/**
 * Jadvallar tartibi: ota yozuvlar avval keladi.
 *
 * Zaxirani tiklashda shu tartib muhim — masalan mijozni yozishdan oldin uning
 * filiali bazada turishi kerak, aks holda baza bog'lanishni rad etadi.
 */
export const TABLES = [
  { name: "Branch", delegate: "branch" },
  { name: "User", delegate: "user" },
  { name: "Specialist", delegate: "specialist" },
  { name: "Client", delegate: "client" },
  { name: "Assignment", delegate: "assignment" },
  { name: "Package", delegate: "package" },
  { name: "Session", delegate: "session" },
  { name: "Payment", delegate: "payment" },
  { name: "SalaryPayout", delegate: "salaryPayout" },
  { name: "LinkCode", delegate: "linkCode" },
  { name: "Notification", delegate: "notification" },
] as const;
