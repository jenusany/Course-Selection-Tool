# PLAN.md — Western Course Selection Platform (Faculty of Science, First Draft)

Status: **DRAFT — awaiting approval**. Nothing outside this file (and the quick
reachability check on `westerncalendar.uwo.ca` noted below) has been created yet.

---

## 1. Goals & non-goals

**Goal:** a working, faculty-of-Science-scoped replacement for Student Center
course selection, with every integration to a real Western system (SSO,
PeopleSoft, timetable feed) sitting behind an interface that has a realistic
mock today and can be swapped for a real adapter later without touching
business logic.

**Non-goals for this draft:**
- No real Entra ID tenant / real PeopleSoft access (we don't have credentials).
- Not multi-faculty — Arts & Humanities, Social Science, etc. are out of scope
  except as raw "elective" course rows where a Science module references them.
- No payment/finance (tuition, OSAP) — out of scope entirely.
- No production deploy target — Docker Compose is for local dev only.

---

## 2. Architecture overview

```
┌─────────────────────────────────────────────────────────────────┐
│ apps/web  (Next.js App Router, TS, Tailwind, shadcn/ui)          │
│  - Server components for data-heavy pages (audit, record)       │
│  - Client components for interactive schedule builder & chat    │
│  - Route handlers under app/api/* call into packages/core        │
│  - Auth.js (Entra ID provider gated by env; dev mock login)      │
└───────────────┬───────────────────────────────────┬─────────────┘
                │                                     │
                ▼                                     ▼
┌───────────────────────────────┐      ┌───────────────────────────────┐
│ packages/core  (pure TS,      │      │ packages/workers (BullMQ)      │
│ no framework/DB imports)      │      │  - pre-validation worker       │
│  - degree audit engine        │◄────►│  - appointment-time commit     │
│  - prerequisite parser/tree   │      │    worker (concurrency-capped) │
│  - schedule/enrollment        │      │  - metrics reporter (load)     │
│    validation rules           │      └───────────────┬─────────────────┘
│  - enrollment intent/fingerprint               │
│  - provider *interfaces* (StudentRecordProvider,│
│    ChatModelProvider, ...)                      │
└───────────────┬─────────────────────────────────┘
                │ implemented by
                ▼
┌───────────────────────────────┐      ┌───────────────────────────────┐
│ packages/db (Prisma)          │      │ packages/chatbot                │
│  - schema.prisma              │      │  - calendar chunker → pgvector  │
│  - seed scripts (mock data)   │      │  - RAG retrieval                │
│  - mock provider impls read   │      │  - tool-calling orchestration   │
│    from this DB               │      │    (calls degree audit engine)  │
└───────────────┬───────────────┘      │  - ChatModelProvider impls:     │
                │                       │    Anthropic (default), Ollama │
                ▼                       └───────────────────────────────┘
┌───────────────────────────────┐
│ Postgres (+pgvector) / Redis  │
│ via docker-compose.yml        │
└───────────────────────────────┘
```

Key rule: **`packages/core` never imports Prisma, Next.js, or BullMQ types
directly.** It depends only on the interfaces it defines. `apps/web` and
`packages/workers` wire real (mock) implementations in at the edges. This is
what makes "swap the mock for the real Western system later" actually true
instead of aspirational.

---

## 3. Tech stack — confirmed, with two additions

Sticking to the requested stack. Two things I'm adding and want to flag:

- **pnpm workspaces** (monorepo tool) to host `apps/web` + the `packages/*`
  split cleanly. No Turborepo/Nx — not needed at this size, keeps it simple.
- **zod** for runtime validation of the requirement DSL (YAML/JSON) and of
  API route inputs — TypeScript alone can't validate data loaded from disk at
  runtime, and the requirement files are meant to be edited without code
  changes, so they need a real parser with good error messages.

Nothing else changes from your list.

---

## 4. Repository layout

```
/
├── apps/
│   └── web/                        # Next.js App Router
│       ├── app/
│       │   ├── (auth)/login/       # mock login + Entra ID callback
│       │   ├── (student)/
│       │   │   ├── dashboard/      # graduation progress widget/page
│       │   │   ├── plan/           # search + schedule builder + chat panel
│       │   │   └── record/         # student's own academic file
│       │   ├── (counsellor)/
│       │   │   └── students/[id]/  # counsellor one-page summary + tabs
│       │   ├── (admin)/
│       │   └── api/                # route handlers, thin — call packages/core
│       ├── components/             # UI components (shadcn/ui based)
│       └── lib/                    # session helpers, provider wiring
├── packages/
│   ├── core/                       # framework-independent business logic
│   │   ├── src/
│   │   │   ├── audit/              # degree audit engine + allocator
│   │   │   ├── prereq/             # calendar-text parser + AND/OR evaluator
│   │   │   ├── validation/         # conflict/prereq/load-limit checks
│   │   │   ├── enrollment/         # intent, fingerprint, commit logic
│   │   │   ├── providers/          # interfaces only (see §7)
│   │   │   └── types/              # shared domain types (Course, Section, …)
│   │   └── test/                   # Vitest, fixtures = seeded students
│   ├── db/
│   │   ├── prisma/schema.prisma
│   │   ├── seed/                   # seed scripts, one file per data domain
│   │   └── src/providers/          # mock StudentRecordProvider etc., reading via Prisma
│   ├── workers/                    # BullMQ queues + processors
│   ├── chatbot/                    # ingestion pipeline + RAG + tool orchestration
│   └── config/                     # shared tsconfig, eslint, tailwind preset
├── requirements/                   # declarative degree/module requirement data
│   ├── degrees/science-honours.yaml
│   ├── degrees/science-3year.yaml
│   └── modules/
│       ├── hsp-computer-science.yaml
│       ├── major-computer-science.yaml
│       ├── hsp-biology.yaml
│       └── major-mathematics.yaml   (or chemistry — see open question)
├── scripts/
│   └── load-simulator/             # Phase 4 N-student simulator + report
├── e2e/                             # Playwright
├── docker-compose.yml
├── PLAN.md
├── CLAUDE.md
├── DATA_TODO.md
└── README.md
```

---

## 5. Data model (Prisma, entities not full DDL)

Grouped by domain; all have `id`, `createdAt`/`updatedAt` unless noted.

**Identity & roles**
- `User` — email (@uwo.ca only), name, role (`STUDENT`/`COUNSELLOR`/`ADMIN`)
- `Student` (1:1 User) — programId, year, enrollmentAppointment, standing,
  `recordVersion` (int, bumped on any mutation — used for the enrollment
  fingerprint)
- `Hold` — studentId, type, reason, placedAt, resolvedAt, `version`

**Catalog**
- `Course` — subject, number, suffix (A/B/Y), creditWeight (0.5/1.0), essay
  (bool), breadth (A/B/C/null), level (derived from number, e.g. 2xxx → 200),
  description, prerequisiteText/antirequisiteText/corequisiteText (raw, as
  published), `prerequisiteTree`/`antirequisiteTree` (structured JSON, see §8)
- `Section` — courseId, term (FALL/WINTER/SUMMER), component (LEC/LAB/TUT),
  meetingTimes (JSON array of `{day, start, end}`), location, instructor,
  capacity, enrolledCount, `version` (int, bumped on capacity/time change)
- `Enrollment` — studentId, courseId, sectionId?, term, grade?, status
  (COMPLETED/IN_PROGRESS)

**Programs**
- `Program`/`Module` — code, name, type (HONOURS_SPECIALIZATION/MAJOR/MINOR),
  faculty, `requirementsRef` (string key into `/requirements`, versioned)

**Planning**
- `DraftSchedule` — studentId, term, name, isEnrollmentPlan (bool)
- `ScheduleItem` — scheduleId, courseId, preferredSectionId, fallbackSectionId?
- `EnrollmentIntent` — studentId, term, items (course/section/fallback),
  status, appointmentTime
- `PreValidationResult` — intentId, fingerprint, resultJson, computedAt
- `EnrollmentAttempt` — intentId, sectionId, outcome, reason, timestamp
  (append-only audit log)

**Academic file**
- `AdvisingNote` — studentId, counsellorId, date, faculty, topic, summary,
  followUps (append-only; corrections are new rows referencing the original)
- `AccommodationTicket` — studentId, type, status (no medical detail)
- `PetitionException` — studentId, type, decision, decidedBy, date
- `AccessLogEntry` — viewerId, studentId, resourceType, action, timestamp

**Chatbot**
- `CalendarChunk` — sourceRef (calendar URL/section), content, embedding
  (pgvector), metadata (module/course/policy tag)
- `ChatSession`/`ChatMessage` — for conversation history (optional, low
  priority — can be in-memory for v1)

**Cached results**
- `DegreeAuditSnapshot` — studentId, generatedAt, resultJson (so the
  dashboard widget doesn't recompute on every render; invalidated on
  `Student.recordVersion` or `Enrollment` change)

---

## 6. Prerequisite/antirequisite structured model

```ts
type RequisiteNode =
  | { type: 'course'; subject: string; number: string; minGrade?: string }
  | { type: 'and'; nodes: RequisiteNode[] }
  | { type: 'or'; nodes: RequisiteNode[] }
  | { type: 'creditsAtLevel'; level: number; credits: number; subject?: string }
  | { type: 'registrationIn'; moduleCode: string }
  | { type: 'permissionOf'; text: string }; // unstructured escape hatch, flagged
```

The **parser** (`packages/core/src/prereq/parse.ts`) takes calendar-style text
like `"Prerequisite(s): Calculus 1000A/B or 1301A/B, and one of Computer
Science 1026A/B, 1027A/B, 1032A/B"` and produces this tree. Calendar
prerequisite phrasing is fairly formulaic but not 100% regular — the parser
will handle the common patterns and fall back to `permissionOf`-style raw
text (flagged `// UNVERIFIED-PARSE`) for anything it can't confidently
structure, so a human (me, in seed review) can hand-fix those rather than the
parser silently guessing wrong. Both the raw text and the structured tree are
stored, so a bad parse never loses information.

---

## 7. Core provider interfaces (the "swap later" seam)

```ts
interface StudentRecordProvider {
  getProfile(studentId: string): Promise<StudentProfile>;
  getCompletedCourses(studentId: string): Promise<CompletedCourse[]>;
  getInProgressCourses(studentId: string): Promise<InProgressCourse[]>;
  getHolds(studentId: string): Promise<Hold[]>;
  getEnrollmentAppointment(studentId: string): Promise<Date>;
}

interface ChatModelProvider {
  complete(messages: ChatMessage[], tools: ToolSpec[]): Promise<ChatModelResponse>;
}

interface AuthIdentityProvider {
  // Entra ID (real) or mock — resolves to a UWO identity + role
}
```

Mock implementations live in `packages/db/src/providers/*`, reading seeded
Postgres data. A future real implementation (e.g., calling PeopleSoft's SOAP/
REST API) implements the same interface and is swapped in at the composition
root (`apps/web/lib/providers.ts`) via an env flag — no changes to `core`.

---

## 8. Degree audit engine

Requirements are data, not code. Each module/degree is a YAML file validated
against a zod schema at load time. Requirement node types:

```yaml
- id: cs-core-1
  type: specificCourse
  course: "COMPSCI 2210A/B"
- id: cs-choice-1
  type: oneOf
  courses: ["COMPSCI 2211A/B", "COMPSCI 2212A/B"]
- id: cs-upper-year
  type: creditsFromList
  credits: 3.0
  courses: ["COMPSCI 3...", "COMPSCI 4..."]   # subject+level pattern
- id: breadth-b
  type: creditsAtLevel
  level: 2000
  credits: 1.0
  subject: null   # any subject
- id: honours-avg
  type: moduleAverage
  minAverage: 70
- id: total
  type: totalCredits
  credits: 20.0
- id: combo
  type: count           # n-of-m composite
  n: 2
  of: [cs-choice-1, cs-choice-2, cs-choice-3]
```

**Evaluation pipeline:**
1. Load student's completed + in-progress courses + grades.
2. Load the module/degree requirement tree(s) that apply.
3. Run the **allocator**: assigns each course to at most the requirements it's
   eligible for, respecting an explicit `allowSharedWith`/`exclusiveWith`
   annotation per requirement (a course generally counts once per *distinct*
   requirement unless the requirement graph says otherwise — this is exactly
   the "counts toward multiple requirements only where rules allow" ask).
   V1 allocator is a deterministic greedy pass (mandatory/specific
   requirements filled first, then flexible pools by scarcity), not a general
   ILP solver — documented as a known limitation with test fixtures pinning
   the exact behavior, so edge cases are visible rather than silently wrong.
5. For each requirement: status (met/in-progress/unmet), which courses were
   allocated to it, and — for unmet ones — which catalog courses *would*
   satisfy it (used by the "satisfies my unmet requirements" search filter).
6. Cache the result as `DegreeAuditSnapshot`.

Heavy Vitest coverage against the seeded students (§11) is the acceptance bar
for Phase 2, including at least one test per requirement type and one test
per seeded student's expected overall audit status.

---

## 9. Enrollment engine (Phase 4 detail)

- **Intent**: created when a draft schedule is marked `isEnrollmentPlan`.
  Stores preferred + fallback section per course.
- **Fingerprint**: `hash(student.recordVersion, holds.map(h => h.version), sections.map(s => s.version))`.
  Computed at pre-validation time and re-checked at commit time.
- **Pre-validation worker** (BullMQ, runs ~72h out): picks up intents whose
  appointment is within the window, runs full validation (prereqs, antireqs,
  conflicts, holds, credit limits, program restrictions), stores result +
  fingerprint. Scheduling favors low-load periods using a simple load signal
  (request rate + queue depth) exposed at `/api/metrics/load`.
- **Commit path (appointment time)**: job enters a concurrency-capped BullMQ
  queue. Worker recomputes the fingerprint; if unchanged, goes straight to an
  atomic per-section seat check via `UPDATE sections SET enrolled = enrolled+1
  WHERE id=$1 AND enrolled < capacity RETURNING *` (conditional update, no
  row-lock contention across unrelated sections, no oversubscription). If the
  fingerprint changed, only the changed piece is re-validated before
  committing. No seats are decremented before the student's actual
  appointment (fairness).
- **Student-visible status**: queued → validating → enrolled/partially
  enrolled/failed-with-reasons, via polling or a small SSE/websocket channel
  (start with polling for v1 simplicity; upgrade if time allows).
- **Load simulator** (`scripts/load-simulator`): spins up N synthetic
  appointment-time arrivals (default 3000), runs the flow with pre-validation
  on vs. off, reports p50/p95/p99 latency and throughput so the benefit is
  measurable, not asserted.
- Every attempt (queued, validated, committed, rejected) writes an
  `EnrollmentAttempt` row — the audit log — and all worker operations are
  idempotent on `(intentId, sectionId)` so a retried job can't double-enroll.

---

## 10. Seed data & sourcing plan

I confirmed `westerncalendar.uwo.ca` is reachable from here (checked the
homepage navigation just now: `Modules.cfm` for module/program requirements,
`Courses.cfm` for course descriptions/prerequisite text). Plan for Phase 1:

1. I pull real course lists, descriptions, and prerequisite text for the
   ~80–120 seeded courses and the 4 required modules directly from the
   calendar via fetch, and the degree-level rules (total credits, breadth,
   honours average, senior/first-year credit limits) from the Science
   faculty degree regulations pages.
2. Anything I can fetch and read directly goes in as verified seed data.
3. Anything ambiguous, paywalled, JS-rendered, or where the fetched content
   looks incomplete gets seeded with a clearly marked placeholder —
   `// UNVERIFIED` inline — and a corresponding line in `DATA_TODO.md` asking
   you to confirm or upload the real calendar page.
4. If you'd rather hand me specific calendar page exports/PDFs up front
   instead of me scraping, say so and I'll switch to upload-driven seeding —
   flagged as an open question below since it changes how Phase 1 starts.

Seeded students (5–8, all in `packages/db/seed/students.ts`):
1. First-year, undeclared program
2. Second-year, Honours Specialization in Computer Science, on track
3. Fourth-year, near graduation (tests "mostly met" audit paths)
4. Student with an antirequisite conflict (tests validation rejection path)
5. Student with an active hold (tests enrollment-blocked path)
6. Double-module student (e.g., Major CS + Minor Math) — tests multi-module
   audit aggregation
7. (stretch) Student mid-way through Honours Specialization in Biology
8. (stretch) Student with a borderline honours-average case (just above/below
   cutoff) — good edge-case fixture for the audit engine

---

## 11. Phase plan (deliverables + acceptance criteria)

**Phase 1 — Scaffold, data, mock auth**
- pnpm monorepo, Next.js app boots, docker-compose up brings Postgres+Redis,
  Prisma schema + migration, seed script populates catalog/modules/students,
  mock login page lists seeded students and sets a session, @uwo.ca-only
  guard on the (unused-for-now) Entra ID path.
- Acceptance: `docker compose up`, `pnpm db:migrate && pnpm db:seed`,
  `pnpm dev`, log in as each seeded student, see their basic profile.

**Phase 2 — Degree audit engine** *(built 2026-09-27)*
- Requirement DSL + zod schema, parser for prereq text, audit engine +
  allocator, dashboard widget showing progress.
- Acceptance: Vitest suite covering all requirement types and all seeded
  students' expected audit outcomes, passing.
- Known v1 limitations, each pinned by a test or listed in the audit's
  `notEvaluated`: greedy (not optimal) allocation; modules audited
  independently (no cross-module double-counting limit); antirequisite
  conflicts are warned about but both courses still count; residency and
  Faculty-of-Science-minimum rules not evaluated; admission requirements are
  schema-validated but not audited.

**Phase 3 — Course search + schedule builder** *(built 2026-09-27)*
- Split search/calendar UI, hover preview, conflict highlighting, filters,
  requirement badges, live validation, multi-draft schedules + one marked
  enrollment plan.
- Acceptance: manual walkthrough + Playwright happy-path test (search →
  add → conflict shown → resolve → mark as plan). Both e2e tests pass against
  a live Postgres instance (`e2e/schedule-builder.spec.ts`).
- Known v1 limitations: `ScheduleItem` has one preferred + one fallback
  section per course (no separate LEC/TUT component selection — a real
  registration needs both); `DEFAULT_MAX_CREDITS_PER_TERM` (3.0) is a
  reasonable planning default, not a scraped Western policy number (Western
  only publishes an *annual* minimum); badge/prereq computation runs over
  the whole current-year catalog client-side, fine at ~120 courses but would
  need server-side filtering at real-calendar scale; hover-preview conflict
  highlighting only checks time overlap, not the section's other conflict
  types.

**Phase 4 — Enrollment engine** *(built 2026-09-28)*
- Intents, pre-validation worker, fingerprinting, commit worker with
  concurrency cap, load simulator with before/after numbers.
- Acceptance: simulator report showing pre-validation reduces appointment-
  time latency/throughput bottleneck; unit tests on fingerprint/atomic seat
  check race conditions.
  - Both proven for real, not just asserted: `packages/db/test/enrollment-commit.test.ts`
    fires 25/40 concurrent `commitSeat` calls against a live Postgres section
    with 1/10 seats and gets exactly 1/10 successes every time; a full
    end-to-end run (real BullMQ job → commit worker → atomic seat commit →
    `Enrollment` row) was driven manually and via Playwright
    (`e2e/enrollment.spec.ts`). `pnpm --filter @wcs/load-simulator simulate 3000 10`
    ran 3000 synthetic arrivals against a 1500-seat section: exactly 1500
    enrolled every run (never oversubscribed), pre-validation gave a real
    ~1.16–1.6x wall-time speedup (more pronounced at lower concurrency /
    smaller N, since queueing dominates less of the total).
- Known v1 limitations: the commit worker always fully re-validates when the
  fingerprint doesn't match (not just "what changed", per the original
  design note); `DEFAULT_MAX_CREDITS_PER_TERM`/program-restriction checks
  reuse Phase 3's `validateScheduleAddition`, so the same soft credit-load
  default applies here too; status is polling-only (no SSE/websocket, as
  planned for v1); the recurring pre-validation scan runs every 60s in dev
  (`WORKERS_SCAN_INTERVAL_MS`) rather than a longer production interval.

**Phase 5 — Academic record + counsellor portal** *(built 2026-09-28)*
- Student-facing academic file (`/academic-file`), counsellor one-page
  summary + tabs (`/counsellor/[studentId]`) with a caseload roster
  (`/counsellor`), access log visible to the student, role-based scoping via
  `CounsellorStudent` (advising relationship required, admins see everyone).
- Acceptance: proven, not just asserted. `packages/core/test/access.test.ts`
  unit-tests `canViewAcademicFile`/`canEditAcademicFile` for all nine
  viewer/target combinations. `e2e/academic-record.spec.ts` drives it live
  against real seeded data: a counsellor viewing an unassigned student's
  detail URL directly gets a real HTTP 404 (`assertCanViewAcademicFile`
  calls Next's `notFound()`, never revealing whether the student exists);
  a counsellor viewing/editing an assigned student produces real
  `AccessLogEntry` rows, and the student then sees both the view and the
  edit in "Who has viewed your file" on their own `/academic-file`.
- Known v1 limitations: `AdvisingNote.supersedesId` (append-only
  corrections) is schema-ready but has no correction UI yet — only new-note
  creation; counsellor caseloads are a simple fixed `CounsellorStudent`
  assignment (2 counsellors, seeded 4-and-4), not a real advising-intake
  workflow; `AccommodationTicket`/`PetitionException` have no edit/creation
  UI, only fixture data and read views (out of scope — no medical detail is
  stored, matching the schema's own comment).

**Phase 6 — Chatbot** *(built 2026-09-28)*
- Calendar chunk ingestion → pgvector (`/chat`, `apps/web/app/api/chat`),
  RAG retrieval with citations, tool call into the audit engine for personal
  questions, Anthropic + Ollama provider implementations (code-complete,
  untested live — no key/local server in this environment), scope
  guardrails (redirect to a real counsellor for exceptions/appeals/
  accommodations/standing/medical/financial aid).
- Acceptance: proven, not just asserted, three ways for the same three
  prompts — `packages/chatbot/test/orchestrate.test.ts` (unit-level, live
  seeded DB, deterministic `MockChatModelProvider`), `e2e/chatbot.spec.ts`
  (full browser flow through the real `/chat` UI and `/api/chat` route),
  and `packages/chatbot/test/retrieve.test.ts` (proves the retrieval step
  itself is real pgvector ANN search, not string matching): (a) "What is
  the prerequisite for COMPSCI 2210A/B?" → answered with a `[1]` citation
  linking the real calendar page; (b) "Am I on track to finish my Computer
  Science module?" → calls `get_degree_audit`, answers from the real audit
  result, never guesses; (c) "Can I petition for an antirequisite
  exception?" → redirected to a real academic counsellor, no model/DB call
  for the audit at all.
- Known v1 limitations: `CalendarChunk` embeddings are a deterministic
  hashing-trick mock, not a real ML embedding model (see `DATA_TODO.md`) —
  genuinely wired to pgvector, just not semantically-aware the way a real
  embedding would be (won't generalize across synonyms/paraphrase); citations
  shown are every retrieved chunk, not only the ones the model's answer text
  actually cited; the Anthropic/Ollama providers map `ChatMessage`'s
  simplified role set onto each API's native shape in a best-effort way
  (no native `tool_result` blocks) and are untested against a live
  API/server; chat history is passed per-request from the client, not
  persisted server-side (`ChatSession`/`ChatMessage` tables were optional
  per the original plan and were skipped for v1).

**Phase 7 — Polish**
- WCAG AA pass (keyboard nav, contrast, aria), mobile layout, empty/error
  states, README with setup + a demo script walking through every seeded
  student end to end.

Each phase ends with: tests run, app run, a short "works / mocked" summary,
then I stop for your review before starting the next phase.

---

## 12. Open questions (need your call before/while I build)

1. **Seed data sourcing** — I'll scrape `westerncalendar.uwo.ca` directly for
   Phase 1 (confirmed reachable) unless you'd rather send me specific
   calendar pages/exports to work from instead. Which do you prefer?
2. **Fourth module** — Math or Chemistry, as you offered? I'll default to
   **Mathematics** (pairs naturally with the CS modules for prereq overlap
   and the double-module test student) unless you'd rather Chemistry.
3. **Anthropic API key** for Phase 6 — assume it'll be provided via env var
   (`ANTHROPIC_API_KEY`) when we get there; nothing needed now.
4. **CI** — not in your spec. I'll add a minimal GitHub Actions workflow
   (lint + unit tests) in Phase 1 unless you'd rather skip CI entirely for a
   first draft.

I've defaulted #2–#4 above so they don't block approval; flag if you want
different defaults. #1 is the one genuinely worth a quick answer before I
start Phase 1 seeding.
