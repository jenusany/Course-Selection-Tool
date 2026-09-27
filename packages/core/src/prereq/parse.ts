import type { ExternalRequirementReason, RequisiteNode } from "../types/domain.js";

// ── Calendar requisite text → RequisiteNode ────────────────────────────────
//
// Western's prerequisite phrasing is formulaic but not regular, so this is a
// pragmatic recursive splitter, not a grammar:
//
//   sentence   := clause (";" | "plus") clause ...   (a clause starting with
//                 "or" ORs against everything before it)
//   clause     := [list-head] "one of" / "N.N course(s) from:" list
//               | item "," item "," ["and"|"or"] item   (comma list)
//               | expr "and" expr | expr "or" expr    ("and" binds looser)
//               | "(" sentence ")" | atom
//   atom       := [the former] Subject Name 1234A/B [with at least N%]
//               | registration / permission / high-school phrase
//
// Anything the parser can't confidently structure becomes an
// `externalRequirement` with reason "unparsed" and the parse is marked
// incomplete — both the raw text and the tree are stored, so a bad parse
// never loses information and a human can hand-fix it.

export interface RequisiteParserOptions {
  /** Lowercased subject name (and accepted abbreviations) → subject code. Only seeded subjects. */
  subjects: ReadonlyMap<string, string>;
  /** Lowercased module name → module code, for "registration in the Honours Specialization in ...". */
  modules?: ReadonlyMap<string, string>;
}

export interface RequisiteParseResult {
  tree: RequisiteNode | null;
  /** False when any fragment fell back to an "unparsed" node or a substitution note was left out of the tree. */
  complete: boolean;
  /** Sentences kept out of the tree: recommendations, substitution rules, corequisites, conditions. */
  notes: string[];
}

interface Ctx {
  opts: RequisiteParserOptions;
  lastSubject?: string;
  complete: boolean;
  notes: string[];
}

const NUMBER = String.raw`\d{4}[A-Z]?(?:\/[A-Z])*`;
const MARK_PHRASE = String.raw`with (?:a )?(?:minimum )?(?:mark |grade )?(?:of )?(?:at least )?(\d{2,3})%`;
const MARK_SUFFIX = new RegExp(String.raw`\s*,?\s*\(?\s*${MARK_PHRASE}\s*\)?$`, "i");
const MARK_PARENS = /\s*\(\s*minimum mark (\d{2,3})%\s*\)/i;
const EACH_MARK = new RegExp(String.raw`\s*,?\s*\(?\s*(?:in each case,? |each )?${MARK_PHRASE}(?: in each)?\s*\)?$`, "i");
const PREFIX_MARK = /^a minimum (?:mark|grade) of (\d{2,3})% in (?:either |each of )?/i;
const LIST_INTRO = /(?:^|\s)(?:(?:at least )?one (?:or more )?of(?: the following)?:?|(\d+\.\d) courses? (?:(with [^:]*?) )?from:?)\s+/i;
const SUBSTITUTION = /can be used|may also be used|in place of|may substitute|can substitute|may be taken as a pre-or corequisite/i;

// Multi-word names containing "and" ("Numerical and Mathematical Methods 1411A/B", "Calculus and Vectors (MCV4U)")
// get their "and" joined with underscores so list splitting doesn't break them; undone on lookup/display.
const AND_IN_NAME = /\b([A-Z][a-z]+) and ([A-Z][a-z]+(?: [A-Z][a-z]+)*)(?= \d{4}| \()/g;

function normalize(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .replace(/([a-z])(\d{4}[A-Z])/g, "$1 $2") // "Calculus1500A/B"
    .replace(/,(?=\S)/g, ", ")
    .replace(AND_IN_NAME, "$1_and_$2")
    .trim();
}

function denormalize(text: string): string {
  return text.replace(/_and_/g, " and ");
}

/** Split on `sep` wherever it occurs at parenthesis depth 0. */
function splitTopLevel(s: string, sep: RegExp): string[] {
  const sticky = new RegExp(sep.source, sep.flags.replace("g", "").replace("y", "") + "y");
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (depth === 0) {
      sticky.lastIndex = i;
      const m = sticky.exec(s);
      if (m && m[0].length > 0) {
        parts.push(s.slice(start, i));
        start = i + m[0].length;
        i = start - 1;
      }
    }
  }
  parts.push(s.slice(start));
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}

/** Index of the first match of `re` at parenthesis depth 0, or -1. */
function findTopLevel(s: string, re: RegExp): { index: number; match: RegExpExecArray } | null {
  const sticky = new RegExp(re.source, re.flags.replace("g", "").replace("y", "") + "y");
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (depth === 0) {
      sticky.lastIndex = i;
      const m = sticky.exec(s);
      if (m) return { index: i, match: m };
    }
  }
  return null;
}

function wrappedInParens(s: string): boolean {
  if (!s.startsWith("(") || !s.endsWith(")")) return false;
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "(") depth++;
    else if (s[i] === ")") depth--;
    if (depth === 0 && i < s.length - 1) return false;
  }
  return true;
}

function stripTrailing(s: string): string {
  return s.replace(/[\s.,;:]+$/, "").trim();
}

function combine(type: "and" | "or", nodes: (RequisiteNode | null)[]): RequisiteNode | null {
  const flat: RequisiteNode[] = [];
  for (const n of nodes) {
    if (!n) continue;
    if (n.type === type) flat.push(...n.nodes);
    else flat.push(n);
  }
  if (flat.length === 0) return null;
  if (flat.length === 1) return flat[0]!;
  return { type, nodes: flat };
}

function applyGrade(node: RequisiteNode | null, grade: number): RequisiteNode | null {
  if (!node) return node;
  switch (node.type) {
    case "course":
      return node.minGrade === undefined ? { ...node, minGrade: grade } : node;
    case "and":
    case "or":
    case "creditsFrom":
      return { ...node, nodes: node.nodes.map((n) => applyGrade(n, grade)!) };
    default:
      return node;
  }
}

function external(ctx: Ctx, text: string, reason: ExternalRequirementReason): RequisiteNode {
  if (reason === "unparsed") ctx.complete = false;
  return { type: "externalRequirement", text: denormalize(stripTrailing(text)), reason };
}

function lookupSubject(ctx: Ctx, name: string): string | undefined {
  return ctx.opts.subjects.get(denormalize(name).trim().toLowerCase());
}

// ── atoms ──

const CREDITS_AT_LEVEL = [
  // "Completion of at least 1.5 Biology courses at the 3000 level or above", "1.0 additional Biology course at the 3000-level",
  // "1.0 Mathematics course or equivalent numbered 1000 or above"
  /^(?:completion of )?(?:at least )?(\d+\.\d) (?:additional )?([A-Z][A-Za-z]*(?: [A-Z][A-Za-z]*)*) courses? (?:or equivalent )?(?:at the |numbered )(\d{4})(?:[- ]level)?(?: or (?:above|higher))?$/i,
  // "one additional 0.5 course in Biology at the 3000 level or above"
  /^(?:one )?(?:additional )?(\d+\.\d) (?:additional )?courses? in ([A-Z][A-Za-z]*(?: [A-Z][A-Za-z]*)*) at the (\d{4})[- ]level(?: or (?:above|higher))?$/i,
];

function parseCreditsAtLevel(ctx: Ctx, s: string): RequisiteNode | null {
  for (const re of CREDITS_AT_LEVEL) {
    const m = re.exec(s);
    if (!m) continue;
    const subject = lookupSubject(ctx, m[2]!);
    if (!subject) return null;
    return { type: "creditsAtLevel", credits: Number(m[1]), subject, level: Number(m[3]) };
  }
  return null;
}

function parseRegistration(ctx: Ctx, s: string): RequisiteNode | null {
  const m = /^(?:registration|enrolment|enrollment) in (?:the )?(.*)$/i.exec(s);
  if (!m) return null;
  const code = ctx.opts.modules?.get(denormalize(stripTrailing(m[1]!)).toLowerCase());
  return code ? { type: "registrationIn", moduleCode: code } : external(ctx, s, "registration");
}

function parseAtom(ctx: Ctx, raw: string): RequisiteNode | null {
  let s = stripTrailing(raw).replace(/^(?:and|or|plus)\s+/i, "").trim();
  if (!s) return null;
  if (wrappedInParens(s)) return parseSentence(ctx, s.slice(1, -1));

  let grade: number | undefined;
  const paren = MARK_PARENS.exec(s);
  if (paren) {
    grade = Number(paren[1]);
    s = s.replace(MARK_PARENS, "").trim();
  }
  const suffix = MARK_SUFFIX.exec(s);
  if (suffix) {
    grade = Number(suffix[1]);
    s = s.slice(0, suffix.index).trim();
  }
  s = s.replace(/\s*\((?:recommended|preferred)\)/gi, "").replace(/^either\s+/i, "").trim();

  // "Numerical and Mathematical Methods 1412A/B (or the former Applied Mathematics 1412A/B)"
  const alt = /^(.*?)\s*\(or ([^)]*)\)\s*$/i.exec(s);
  if (alt) {
    const node = combine("or", [parseAtom(ctx, alt[1]!), parseAtom(ctx, alt[2]!)]);
    return grade !== undefined ? applyGrade(node, grade) : node;
  }
  if (/^(?:or )?(?:the )?equivalent$/i.test(s)) return external(ctx, "equivalent", "permission");

  const course = new RegExp(String.raw`^(?:the former\s+)?(.*?)\s*(${NUMBER})$`, "i").exec(s);
  if (course) {
    const name = course[1]!.trim();
    const number = course[2]!;
    const subject = name ? lookupSubject(ctx, name) : ctx.lastSubject;
    if (subject) {
      ctx.lastSubject = subject;
      return { type: "course", subject, number, ...(grade !== undefined ? { minGrade: grade } : {}) };
    }
    if (/^[A-Z][A-Za-z&._]*(?:\s+(?:and\s+)?[A-Z][A-Za-z&._]*)*$/.test(name)) {
      ctx.lastSubject = undefined;
      return external(ctx, `${name} ${number}`, "outOfCatalog");
    }
    return external(ctx, raw, "unparsed");
  }

  if (/permission/i.test(s)) return external(ctx, s, "permission");
  if (/Ontario Secondary School|Grade 1[12]\s?U|\b[A-Z]{3}4U\b|\bSB1[34]U/.test(s)) return external(ctx, s, "highSchool");
  const reg = parseRegistration(ctx, s);
  if (reg) return reg;
  const cal = parseCreditsAtLevel(ctx, s);
  if (cal) return cal;
  return external(ctx, raw, "unparsed");
}

// ── expressions ──

const REGISTRATION = /^(?:registration|enrolment|enrollment) in /i;
const COURSE_ONLY = new RegExp(String.raw`^(?:(?:and|or) )?(?:the former )?[A-Z][A-Za-z_ ]*\s${NUMBER}$`);

/**
 * A registration phrase runs to the end of its clause — rejoin anything split off after it.
 * `anywhere`: the phrase may start mid-part ("Biology 2483A/B and registration in ...") — used for comma splits.
 */
function mergeRegistrationTail(parts: string[], joiner: string, anywhere = false): string[] {
  const i = parts.findIndex((p) =>
    anywhere ? /\b(?:registration|enrolment|enrollment) in /i.test(p) : REGISTRATION.test(p.replace(/^(?:and|or)\s+/i, "")),
  );
  if (i < 0 || i === parts.length - 1) return parts;
  return [...parts.slice(0, i), parts.slice(i).join(joiner)];
}

function parseList(ctx: Ctx, s: string, conj: "and" | "or"): RequisiteNode | null {
  const items = splitTopLevel(s, /,\s*/);
  const nodes = items.map((it) => parseExpr(ctx, it.replace(/^(?:and|or)\s+/i, ""), conj));
  return combine(conj, nodes);
}

function parseExpr(ctx: Ctx, input: string, defaultConj?: "and" | "or"): RequisiteNode | null {
  let s = stripTrailing(input).replace(/^(?:either|and|or|plus)\s+/i, "").trim();
  if (!s) return null;
  if (wrappedInParens(s)) return parseSentence(ctx, s.slice(1, -1));

  // Phrases whose own text contains "or"/"and"/commas — must be recognised before splitting.
  if (REGISTRATION.test(s)) return parseRegistration(ctx, s);
  const cal = parseCreditsAtLevel(ctx, s);
  if (cal) return cal;
  // "1.0 course in Mathematics, Applied Mathematics, or Calculus at the 2100 level or higher" — credits pooled
  // across several subjects; creditsAtLevel only takes one subject, so keep it whole rather than mis-split it.
  if (/^\d+\.\d courses? in [A-Z][^,]*,[^;]*\bat the \d{4}/i.test(s)) {
    return external(ctx, s, "unparsed");
  }
  // "Completion of the 2000-level 'core' courses in Biology modules (Biochemistry 2280A, Biology 2244A/B or ...)"
  const core = /^completion of (?:the )?[^()]*courses[^()]*\((.*)\)$/i.exec(s);
  if (core) return parseExpr(ctx, core[1]!, "and");

  // "Biology 1001A and Biology 1002B with a minimum of 60% in each", "..., in each case with at least 65%"
  const each = EACH_MARK.exec(s);
  if (each && /each/i.test(each[0])) {
    return applyGrade(parseExpr(ctx, s.slice(0, each.index), defaultConj), Number(each[1]));
  }

  // "A minimum mark of 60% in X and Y" where that's the only mark phrase → applies to all of it.
  const prefix = PREFIX_MARK.exec(s);
  if (prefix && !/minimum (?:mark|grade)/i.test(s.slice(prefix[0].length)) && !LIST_INTRO.test(s)) {
    return applyGrade(parseExpr(ctx, s.slice(prefix[0].length), defaultConj), Number(prefix[1]));
  }

  // "[head and] one of A, B, C" / "[head;] 1.0 course from: A, B, C"
  const intro = findTopLevel(s, LIST_INTRO);
  if (intro) {
    const headRaw = s.slice(0, intro.index).trim();
    const listText = s.slice(intro.index + intro.match[0].length);
    const credits = intro.match[1] ? Number(intro.match[1]) : null;
    let listNode = parseList(ctx, listText, "or");
    const introMark = intro.match[2] ? /(\d{2,3})%/.exec(intro.match[2]) : null;
    if (introMark) listNode = applyGrade(listNode, Number(introMark[1]));
    if (credits !== null && credits > 0.5 && listNode) {
      listNode = { type: "creditsFrom", credits, nodes: listNode.type === "or" ? listNode.nodes : [listNode] };
    }
    if (!headRaw) return listNode;
    const headMark = /^a minimum (?:mark|grade) of (\d{2,3})% in$/i.exec(headRaw);
    if (headMark) return applyGrade(listNode, Number(headMark[1]));
    const conjMatch = /(?:,\s*|\s+)(and|or|plus)$/i.exec(headRaw);
    const conj: "and" | "or" = conjMatch?.[1]?.toLowerCase() === "or" ? "or" : "and";
    const head = conjMatch ? headRaw.slice(0, conjMatch.index) : headRaw;
    return combine(conj, [parseExpr(ctx, head, conj), listNode]);
  }

  // Comma list. The conjunction comes from the last item ("A, B, and C"), else the caller's default, else an
  // un-Oxford "A, B, C or D" (only when every item is a plain course), else it's ambiguous and flagged.
  const items = mergeRegistrationTail(splitTopLevel(s, /,\s*/), ", ", true);
  if (items.length > 1) {
    const last = items[items.length - 1]!;
    const lead = /^(and|or)\s+/i.exec(last);
    let conj: "and" | "or" | undefined = lead ? (lead[1]!.toLowerCase() as "and" | "or") : defaultConj;
    if (!conj) {
      const orParts = splitTopLevel(last, /\s+or\s+/i);
      const andParts = splitTopLevel(last, /\s+and\s+/i);
      const hasOr = orParts.length > 1;
      const hasAnd = andParts.length > 1;
      const courseOnly = (xs: string[]) => xs.every((x) => COURSE_ONLY.test(stripTrailing(x)));
      const earlier = items.slice(0, -1);
      if (hasOr !== hasAnd && courseOnly(earlier) && courseOnly(hasOr ? orParts : andParts)) {
        conj = hasOr ? "or" : "and";
        items.splice(items.length - 1, 1, ...(hasOr ? orParts : andParts));
      } else if (items.some((it) => /\sor\s/i.test(it)) && items.every((it) => !/\sand\s/i.test(it))) {
        // "A or B, C or D" with no final conjunction — every piece is an alternative. Plausible, not certain.
        conj = "or";
        ctx.complete = false;
        ctx.notes.push(`Ambiguous list read as "any of": ${denormalize(s)}`);
      } else {
        // AND is the conservative reading; flag for review.
        conj = "and";
        ctx.complete = false;
        ctx.notes.push(`Ambiguous list read as "all of": ${denormalize(s)}`);
      }
    }
    return combine(conj, items.map((it) => parseExpr(ctx, it.replace(/^(?:and|or)\s+/i, ""), conj)));
  }

  // "and" binds looser than "or": "Biology 1001A and either Biology 1002B or Integrated Science 1001X"
  const ands = mergeRegistrationTail(splitTopLevel(s, /\s+and\s+/i), " and ");
  if (ands.length > 1) return combine("and", ands.map((a) => parseExpr(ctx, a)));

  if (prefix) return applyGrade(parseExpr(ctx, s.slice(prefix[0].length)), Number(prefix[1]));

  const ors = splitTopLevel(s, /\s+or\s+/i);
  if (ors.length > 1) return combine("or", ors.map((o) => parseExpr(ctx, o)));

  return parseAtom(ctx, s);
}

function parseSentence(ctx: Ctx, sentence: string): RequisiteNode | null {
  const clauses = splitTopLevel(stripTrailing(sentence), /\s*;\s*|\s*,?\s+plus:?\s+|,\s*plus:?\s+/i);
  let acc: (RequisiteNode | null)[] = [];
  for (const clause of clauses) {
    const orLead = /^or\s+/i.exec(clause);
    if (orLead && acc.length > 0) {
      acc = [combine("or", [combine("and", acc), parseExpr(ctx, clause.slice(orLead[0].length))])];
    } else {
      acc.push(parseExpr(ctx, clause));
    }
  }
  return combine("and", acc);
}

function parseSentences(ctx: Ctx, text: string): RequisiteNode | null {
  const sentences = text.split(/(?<=\.)\s+(?=[A-Z(])/);
  const main = sentences.shift() ?? "";
  for (const extra of sentences) {
    if (SUBSTITUTION.test(extra)) ctx.complete = false;
    ctx.notes.push(denormalize(stripTrailing(extra)));
  }
  return parseSentence(ctx, main);
}

export function parsePrerequisiteText(text: string | null | undefined, opts: RequisiteParserOptions): RequisiteParseResult {
  if (!text || !text.trim()) return { tree: null, complete: true, notes: [] };
  const ctx: Ctx = { opts, complete: true, notes: [] };
  let body = normalize(text);

  // "Pre-or Corequisite(s): X" — may be taken before or alongside, so it stays in the tree (in-progress satisfies it).
  // "Corequisite(s): X" — not a prerequisite at all; it's stored separately as corequisiteText.
  let preOrCo: string | null = null;
  const pc = /\bPre-? ?or Corequisite\(s\):\s*/i.exec(body);
  if (pc) {
    preOrCo = body.slice(pc.index + pc[0].length);
    body = body.slice(0, pc.index);
  }
  const co = /\bCorequisite\(s\):\s*/i.exec(body);
  if (co) {
    ctx.notes.push(denormalize(stripTrailing(body.slice(co.index))));
    body = body.slice(0, co.index);
  }

  let tree: RequisiteNode | null;
  if (/\(1\)/.test(body) && /\(2\)/.test(body)) {
    tree = combine(
      "and",
      body
        .split(/\(\d\)\s*/)
        .filter((p) => p.trim())
        .map((p) => parseSentences(ctx, p.trim())),
    );
  } else {
    tree = parseSentences(ctx, body);
  }
  if (preOrCo) tree = combine("and", [tree, parseSentences(ctx, preOrCo)]);

  return { tree, complete: ctx.complete, notes: ctx.notes };
}

/**
 * Antirequisite text is a flat list: any listed course conflicts. Qualifiers
 * like "if taken before the 2022-2023 academic year" keep the course but mark
 * the parse incomplete (the condition isn't modelled), and "(except ...)"
 * exclusions are dropped before extracting courses.
 */
export function parseAntirequisiteText(text: string | null | undefined, opts: RequisiteParserOptions): RequisiteParseResult {
  if (!text || !text.trim()) return { tree: null, complete: true, notes: [] };
  const ctx: Ctx = { opts, complete: true, notes: [] };
  let body = normalize(text).replace(/\s*\(except[^)]*\)/gi, "");
  body = body.replace(/,?\s*except\b.*$/i, "");
  const colon = body.lastIndexOf(":");
  if (colon >= 0) body = body.slice(colon + 1);

  // "Computer Science 4434A/B, if taken during the 2021-2022 academic year; ..." — keep the course, note the condition.
  body = body.replace(/([^,;]*?),?\s*(if taken (?:before|during|in)\b[^,;]*)/gi, (_m, course: string, cond: string) => {
    ctx.complete = false;
    ctx.notes.push(`Conditional antirequisite (condition not modelled): ${denormalize(course.trim())} ${stripTrailing(cond)}`);
    return course;
  });

  const nodes: RequisiteNode[] = [];
  for (const item of splitTopLevel(stripTrailing(body), /\s*[,;]\s*|\s+and\s+|\s+or\s+/i)) {
    const node = parseAtom(ctx, item);
    if (node) nodes.push(node);
  }
  return { tree: combine("or", nodes), complete: ctx.complete, notes: ctx.notes };
}
