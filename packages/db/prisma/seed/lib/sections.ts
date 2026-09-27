// Synthetic timetable generation. There is no real Western timetable feed to
// mock against (that system lives entirely inside Student Center/PeopleSoft),
// so every Section this produces is marked `synthetic: true` — plausible for
// demoing the schedule builder, not sourced from any real Western data.

export type TermOffering = "FALL" | "WINTER";

const DAY_PATTERNS: Array<Array<"MO" | "TU" | "WE" | "TH" | "FR">> = [
  ["MO", "WE", "FR"],
  ["TU", "TH"],
  ["MO", "WE"],
  ["TU", "TH"],
  ["MO"],
  ["WE"],
  ["FR"],
];

const START_HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];

const INSTRUCTORS = [
  "Dr. A. Okafor", "Dr. B. Lindqvist", "Dr. C. Reyes", "Dr. D. Whitfield",
  "Dr. E. Nakamura", "Dr. F. Castellano", "Dr. G. Osei", "Dr. H. Petrov",
  "Dr. I. Fontaine", "Dr. J. Abara", "Dr. K. Novak", "Dr. L. Marchetti",
  "Dr. M. Singh", "Dr. N. Delacroix", "Dr. O. Bergström", "Dr. P. Yilmaz",
];

const LOCATIONS = [
  "NCB 101", "NCB 201", "MC 105B", "PAB 148", "SEB 1075", "WSC 55",
  "MSB 130", "TH 3140", "SH 2355", "NS 145", "PAB 117", "MC 110",
];

function hash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Which term(s) a course's number suffix implies it's offered in. */
export function termsForSuffix(number: string): TermOffering[] {
  const suffix = number.replace(/^\d{4}/, "");
  const letters = new Set(suffix.split("/").filter(Boolean));
  const hasFall = letters.has("A") || letters.has("F");
  const hasWinter = letters.has("B") || letters.has("G");
  const hasYearLong = letters.has("Y") || letters.has("Z") || letters.size === 0;

  if (hasYearLong && !hasFall && !hasWinter) return ["FALL", "WINTER"];
  const terms: TermOffering[] = [];
  if (hasFall) terms.push("FALL");
  if (hasWinter) terms.push("WINTER");
  if (terms.length === 0) terms.push("FALL", "WINTER");
  return terms;
}

export interface SyntheticSectionSpec {
  term: TermOffering;
  year: number;
  component: "LEC" | "LAB" | "TUT";
  sectionCode: string;
  meetingTimes: Array<{ day: string; start: string; end: string }>;
  location: string;
  instructor: string;
  capacity: number;
  enrolledCount: number;
}

/** Deterministic-but-varied synthetic sections for one course in one term. */
export function generateSections(
  courseKey: string,
  term: TermOffering,
  year: number,
  level: number,
  includeLabOrTut: boolean,
): SyntheticSectionSpec[] {
  const seed = hash(`${courseKey}:${term}:${year}`);
  const days = DAY_PATTERNS[seed % DAY_PATTERNS.length]!;
  const startHour = START_HOURS[(seed >> 3) % START_HOURS.length]!;
  const durationMinutes = days.length >= 3 ? 60 : 90;
  const endMinutesTotal = startHour * 60 + durationMinutes;
  const fmt = (mins: number) => `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;

  const capacity = level >= 4000 ? 30 + (seed % 20) : level >= 3000 ? 60 + (seed % 40) : 120 + (seed % 80);
  const enrolledCount = Math.round(capacity * (0.4 + ((seed >> 5) % 50) / 100));

  const lec: SyntheticSectionSpec = {
    term,
    year,
    component: "LEC",
    sectionCode: "001",
    meetingTimes: days.map((day) => ({ day, start: fmt(startHour * 60), end: fmt(endMinutesTotal) })),
    location: LOCATIONS[seed % LOCATIONS.length]!,
    instructor: INSTRUCTORS[(seed >> 2) % INSTRUCTORS.length]!,
    capacity,
    enrolledCount: Math.min(enrolledCount, capacity),
  };

  const sections = [lec];

  if (includeLabOrTut && level < 4000) {
    const component: "LAB" | "TUT" = level < 2000 ? "LAB" : "TUT";
    const tutSeed = seed >> 7;
    const tutDay = DAY_PATTERNS[(tutSeed % DAY_PATTERNS.length)]![0]!;
    const tutStartHour = START_HOURS[(tutSeed >> 3) % START_HOURS.length]!;
    const tutCapacity = Math.round(capacity / 3);
    sections.push({
      term,
      year,
      component,
      sectionCode: "010",
      meetingTimes: [{ day: tutDay, start: fmt(tutStartHour * 60), end: fmt(tutStartHour * 60 + 60) }],
      location: LOCATIONS[(tutSeed >> 1) % LOCATIONS.length]!,
      instructor: lec.instructor,
      capacity: tutCapacity,
      enrolledCount: Math.min(Math.round(tutCapacity * 0.6), tutCapacity),
    });
  }

  return sections;
}
