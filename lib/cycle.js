/** Cycle maths — pure, unit-tested. Ported from the prototype's cycInfo().
 *  cycles: [{ period_start: 'YYYY-MM-DD', period_end: 'YYYY-MM-DD'|null }] (any order) */
const DAY = 86400000;
export const parseKey = (k) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
export const diffDays = (a, b) => Math.round((b - a) / DAY);
export const addDays = (a, n) => new Date(a.getTime() + n * DAY);

export function buildModel(cycles, { defaultLen = 28, defaultPeriod = 5 } = {}) {
  const rows = [...cycles].sort((a, b) => a.period_start.localeCompare(b.period_start));
  const starts = rows.map((r) => parseKey(r.period_start));
  const lens = [];
  for (let i = 1; i < starts.length; i++) lens.push(diffDays(starts[i - 1], starts[i]));
  // duplicates (0) and long logging gaps (150+) must not poison the average
  const plausible = lens.filter((x) => x >= 15 && x <= 60);
  const recent = plausible.slice(-6);
  const avgLen = recent.length ? Math.round(recent.reduce((s, x) => s + x, 0) / recent.length) : defaultLen;
  const pLens = rows.map((r) => (r.period_end ? diffDays(parseKey(r.period_start), parseKey(r.period_end)) + 1 : null));
  const known = pLens.filter((x) => x != null && x > 0 && x < 15);
  const avgPeriod = known.length ? Math.round(known.reduce((s, x) => s + x, 0) / known.length) : defaultPeriod;
  const periodLens = pLens.map((x) => (x != null && x > 0 && x < 15 ? x : avgPeriod));
  const last = starts[starts.length - 1] || null;
  const nextStart = last ? addDays(last, avgLen) : null;
  const next2 = nextStart ? addDays(nextStart, avgLen) : null;
  return { starts, periodLens, avgLen, avgPeriod, nextStart, next2, count: starts.length };
}

/** Where a date sits in her cycle → {day, phase, fertile, ovu, predicted, pLen} or null (before first log / no logs). */
export function cycleInfo(date, m) {
  if (!m || !m.starts.length || date < m.starts[0]) return null;
  // beyond the modeled horizon (two predicted cycles) we know nothing — say so
  if (m.next2 && date >= addDays(m.next2, m.avgLen)) return null;
  const bounds = m.starts.concat([m.nextStart, m.next2]);
  for (let i = bounds.length - 1; i >= 0; i--) {
    if (date >= bounds[i]) {
      const day = diffDays(bounds[i], date) + 1;
      const predicted = i >= m.starts.length;
      const end = bounds[i + 1] || addDays(bounds[i], m.avgLen);
      const pLen = predicted ? m.avgPeriod : m.periodLens[i];
      const ovu = addDays(end, -14);
      const dOvu = diffDays(ovu, date);
      const phase = day <= pLen ? "period" : dOvu === 0 ? "ovulation" : dOvu < 0 ? "follicular" : "luteal";
      return { day, phase, predicted, pLen, ovu: dOvu === 0, fertile: dOvu >= -5 && dOvu <= 1 };
    }
  }
  return null;
}

/** the next ovulation that hasn't happened yet */
export function nextOvulation(today, m) {
  if (!m?.nextStart) return null;
  let n = addDays(m.nextStart, -14);
  if (diffDays(today, n) <= 0) n = addDays(m.next2, -14);
  return diffDays(today, n) > 0 ? n : null; // logging lapsed — no honest prediction
}

export const PHASES = {
  period: { name: "Period", e: "🌹", arc: "var(--rose)",
    body: "Her period is here — the uterus is shedding its lining and hormones are at their monthly low. Totally healthy, mostly annoying.",
    feel: "energy 🔋 low · cosy mode on. cramps, tiredness and big blanket energy are all normal.",
    tips: ["rest counts as productive today", "warmth is magic — chai, hot water bottle, hugs", "iron-rich food helps: dates, spinach, red meat"],
    partner: "heat pack ready, chai on standby, zero big plans — hero behaviour 💛",
    care: [
      { e: "🫖", t: "feed her warm", d: "warm beats cold this week — chai, soup, khichdi. iron top-ups help too: dates, spinach, a good kebab." },
      { e: "🧸", t: "her heart", d: "she may be quieter or tearier — that's hormones, not a problem to solve. sit close, ask nothing, stay soft." },
      { e: "🔥", t: "little heroics", d: "hot water bottle refilled before she asks. painkillers + water on the nightstand. instant legend." },
      { e: "🌙", t: "keep it slow", d: "no big plans, no long drives, no 'what's wrong?' on repeat. a quiet evening is the whole gift." }] },
  follicular: { name: "Follicular", e: "🌱", arc: "var(--sage)",
    body: "Estrogen is climbing and the body is prepping a fresh egg — this is the spring of her cycle.",
    feel: "energy 🔋 rising · brighter mood, sharper focus, more social by the day.",
    tips: ["a great week to start new things", "workouts feel easier than usual", "plan the adventures now"],
    partner: "her energy is climbing — this is the week for plans and little adventures ✨",
    care: [
      { e: "🥗", t: "feed her fresh", d: "light and fresh lands best — fruit, yogurt, proper colourful meals. her appetite may run smaller than usual." },
      { e: "🗺", t: "plan things", d: "energy is climbing — book the trip, try the new place, say yes to the plan you've been postponing." },
      { e: "💬", t: "her heart", d: "she's brighter and chattier — match it. big ideas and deep talks land beautifully this week." },
      { e: "🏃", t: "do it together", d: "walks, workouts, the thing she's been meaning to start — join in. the company is the point." }] },
  ovulation: { name: "Ovulation", e: "✨", arc: "var(--butter)",
    body: "An egg is released around now — estrogen peaks and everything runs at full brightness for a day or two.",
    feel: "energy 🔋 peak · confident, chatty, magnetic. this is also the fertile window.",
    tips: ["big days belong here — she's at 100%", "drink extra water", "a one-sided twinge (mittelschmerz) is normal"],
    partner: "she's at 100% today — date-night material. also: fertile window 👀",
    care: [
      { e: "💃", t: "date night", d: "she's at peak sparkle — dress up, go out, take the photos. this is the golden window of the month." },
      { e: "💧", t: "feed her light", d: "keep the water coming and the plates light — she runs warm around now, heavy food drags." },
      { e: "🌹", t: "her heart", d: "confidence is peaking — compliments hit different this week. don't ration them." },
      { e: "👀", t: "heads up", d: "the fertile window is open — whatever your plans are as a couple, plan accordingly." }] },
  luteal: { name: "Luteal", e: "🍂", arc: "var(--lilac)",
    body: "Progesterone takes over and the body slows down, runs a little warmer, and starts asking for snacks.",
    feel: "energy 🔋 easing down · PMS can visit: bloating, tenderness, mood dips, cravings.",
    tips: ["magnesium + dark chocolate genuinely help", "protect her sleep — it matters extra this week"],
    partner: "extra patience + her favourite chocolate go a long way 💛",
    care: [
      { e: "🍫", t: "feed her comfort", d: "cravings are chemistry, not weakness — dark chocolate, nuts, bananas. and never comment on quantities." },
      { e: "🧸", t: "her heart", d: "PMS makes small things feel big. extra patience, zero scorekeeping — the no-fight rule earns its keep now." },
      { e: "🛋", t: "cosy over busy", d: "slow evenings beat big nights — blanket, her show, your shoulder. that's the entire recipe." },
      { e: "😴", t: "guard her sleep", d: "she tires earlier this week — take the late chores, keep mornings gentle, let her wind down early." }] },
};
export const CYC_FACTS = [
  "A cycle counts from day 1 of one period to day 1 of the next — day 1 is the first bleed day, not the day after.",
  "Only about 1 in 8 cycles is exactly 28 days — anywhere from 21 to 35 is completely common.",
  "The egg lives just 12–24 hours after ovulation, but sperm can wait around for up to 5 days — hence the 6-day fertile window.",
  "Body temperature rises about 0.3°C after ovulation — that's the whole trick behind thermometer tracking.",
  "Period cravings are real chemistry: a progesterone dip sends the brain hunting for quick serotonin. Hi, chocolate.",
  "An average period sheds only 2–3 tablespoons of blood, even when it feels like a scene from a movie.",
  "Stress, travel and big life changes can genuinely shift a cycle — a late period isn't automatically news.",
  "PMS belongs to the luteal phase — and usually lifts within a day or two of the period starting.",
];
export const SYMPTOMS = ["😖 cramps", "🤕 headache", "🎈 bloating", "💧 tender", "🔋 low energy", "🍫 cravings", "😴 slept badly", "✨ all good"];
