/**
 * Server qaysi vaqt zonasida ishlashini belgilaydi.
 *
 * Vercel'dagi server UTC da turadi, markaz esa Toshkentda. Dastur vaqtni
 * server soatiga qarab o'qiydi va yozadi ("09:00" deb kiritilgani
 * `new Date("...T09:00")` orqali server zonasida tushuniladi), shuning uchun
 * zona noto'g'ri bo'lsa hamma hisob 5 soatga siljiydi: masalan "o'tib ketgan
 * vaqtlar" ro'yxatdan chiqarilmay qoladi.
 *
 * Buni muhit o'zgaruvchisiga tashlab qo'ymadik: bir marta yozilmay qolsa
 * jadval jimgina siljib ketadi va buni sezish qiyin. Shuning uchun zona
 * kodda turadi; markaz boshqa shaharga ko'chsa `CENTER_TZ` bilan
 * almashtiriladi.
 *
 * `register` Next server ishga tushganda bir marta, so'rovlardan oldin
 * chaqiriladi — Date birinchi marta ishlatilgunga qadar ulgurib qoladi.
 */
export const CENTER_TZ = "Asia/Tashkent";

export function register() {
  // Edge runtime'da vaqt zonasini o'zgartirib bo'lmaydi va u yerda
  // sana bilan ishlaydigan kod ham yo'q
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  process.env.TZ = process.env.CENTER_TZ || CENTER_TZ;
}
