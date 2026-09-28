export interface ScopeDecision {
  inScope: boolean;
  /** Present only when inScope is false — a ready-to-show redirect message. */
  redirectMessage?: string;
}

const redirect = (topic: string) =>
  `That involves ${topic}, which I'm not able to advise on. Please contact a real academic counsellor through Academic Advising for this — you can see who's assigned to you and book time with them from your academic file.`;

// Deliberately conservative: false positives (redirecting something that
// was actually answerable) are far cheaper than false negatives (guessing
// at an exception/appeal/accommodation/standing question).
const OUT_OF_SCOPE_PATTERNS: ReadonlyArray<{ pattern: RegExp; topic: string }> = [
  { pattern: /\b(petition|appeal|exception)\b/i, topic: "petitions, appeals, or exceptions" },
  { pattern: /\b(accommodation|accessible education|disability)\b/i, topic: "accommodations" },
  {
    pattern: /\b(academic standing|probation|suspension|required to withdraw|dismissal|dismissed)\b/i,
    topic: "academic standing",
  },
  { pattern: /\b(medical|mental health|counsell?ing service)\b/i, topic: "medical or mental health matters" },
  { pattern: /\b(financial aid|osap|scholarship|bursary|tuition (refund|appeal))\b/i, topic: "financial aid" },
];

/** The one place that decides whether a question is in scope for the advisor chatbot. */
export function checkScope(question: string): ScopeDecision {
  for (const { pattern, topic } of OUT_OF_SCOPE_PATTERNS) {
    if (pattern.test(question)) return { inScope: false, redirectMessage: redirect(topic) };
  }
  return { inScope: true };
}
