/**
 * Representative emoji + tinted background for a category, by keyword
 * (specific → general). Shared by the Categories page and anywhere categories
 * surface (e.g. the Cashflow breakdown), so the iconography stays consistent.
 */

export function iconBg(color: string | null): string {
  return `color-mix(in srgb, ${color ?? 'var(--text-3)'} 18%, transparent)`;
}

const ICON_MAP: [RegExp, string][] = [
  [/credit card|annual fee/, '💳'],
  [/tax refund/, '🧾'],
  [/life insurance/, '🛡️'],
  [/dental|vision/, '🦷'],
  [/pharmacy/, '💊'],
  [/health insurance|doctor|health|medical/, '🩺'],
  [/gym|fitness/, '🏋️'],
  [/wellness/, '🧘'],
  [/personal care/, '🧴'],
  [/auto payment/, '🚗'],
  [/insurance/, '🛡️'],
  [/gas|charging|fuel/, '⛽'],
  [/parking/, '🅿️'],
  [/fees? & tickets|ticket/, '🎫'],
  [/public transit|transit/, '🚆'],
  [/taxi|ride ?share|rideshare/, '🚕'],
  [/rental car/, '🚙'],
  [/flight/, '✈️'],
  [/hotel/, '🏨'],
  [/vacation|travel/, '🏖️'],
  [/grocer/, '🛒'],
  [/fast food/, '🍔'],
  [/restaurant/, '🍽️'],
  [/delivery/, '🛵'],
  [/coffee|tea/, '☕'],
  [/alcohol|bar/, '🍺'],
  [/snack|pastr|bakery/, '🥐'],
  [/food|dining/, '🍴'],
  [/mortgage|rent|housing/, '🏠'],
  [/repair|maintenance/, '🔧'],
  [/improvement/, '🛠️'],
  [/auto|transport|car/, '🚗'],
  [/phone/, '📱'],
  [/internet|mobile|wifi/, '🌐'],
  [/utilit/, '💡'],
  [/stream/, '📺'],
  [/subscription/, '🔁'],
  [/online shopping|shopping/, '🛍️'],
  [/cloth|wearable|apparel|accessor/, '👕'],
  [/electronic/, '💻'],
  [/furniture/, '🛋️'],
  [/merch/, '🛍️'],
  [/sporting|sports/, '⚽'],
  [/office|shipping/, '📦'],
  [/game/, '🎮'],
  [/movie/, '🎬'],
  [/music/, '🎵'],
  [/book|reading|material/, '📚'],
  [/course|tutor|test prep|student|tuition|education/, '🎓'],
  [/event/, '🎟️'],
  [/attraction/, '🎡'],
  [/news|media/, '📰'],
  [/entertainment/, '🎮'],
  [/pet/, '🐾'],
  [/vet/, '🐕'],
  [/charit|donation/, '❤️'],
  [/gift/, '🎁'],
  [/paycheck|wages|salary|payroll/, '💵'],
  [/401|retirement|ira|roth/, '📈'],
  [/hsa/, '🏥'],
  [/dividend|investment/, '📈'],
  [/interest/, '🏦'],
  [/cashback|reward|points|sign|bonus/, '🎁'],
  [/zelle/, '💸'],
  [/reimburs/, '↩️'],
  [/resell|income/, '🏷️'],
  [/loan/, '🏦'],
  [/account transfer|transfer/, '🔄'],
  [/atm|cash/, '🏧'],
  [/check/, '📝'],
  [/financial|legal/, '⚖️'],
  [/fee/, '💲'],
  [/tax/, '🧾'],
  [/uncategorized/, '❓'],
  [/miscellaneous|other/, '🔹'],
  [/refund/, '🧾'],
];

export function iconFor(name: string): string {
  const n = name.toLowerCase();
  for (const [re, ic] of ICON_MAP) if (re.test(n)) return ic;
  return '•';
}
