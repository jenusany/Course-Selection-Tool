# CLAUDE.md

Conventions and key decisions for this repo, so future sessions stay
consistent. See `PLAN.md` for the full architecture/phase breakdown and
`DATA_TODO.md` for seed-data caveats.

## Project

A first-draft replacement for Western University's course selection system,
scoped to the Faculty of Science. Every integration to a real Western system
(SSO, PeopleSoft/Student Center, timetable) sits behind an interface in
`packages/core` with a mock implementation in `packages/db`; nothing calls a
real Western system today.

## Repo layout

```
apps/web            Next.js App Router app (UI, API routes, auth)
packages/core        Framework-independent business logic (audit, validation,
                     enrollment, provider *interfaces*). No Prisma/Next imports.
packages/db          Prisma schema, migrations, seed data, mock provider impls
packages/workers      BullMQ queues/processors (enrollment engine, Phase 4)
packages/chatbot      RAG retrieval, tool orchestration, and ChatModelProvider impls
packages/config       Shared tsconfig base
requirements/         Declarative YAML: degree rules + module requirements
scripts/load-simulator  N-student enrollment load simulator (Phase 4)
e2e/                 Playwright specs (schedule builder + enrollment submit)
```

`pnpm-workspace.yaml` globs `apps/*`, `packages/*`, **and `scripts/*`** — the
last one was missing until Phase 4 needed `scripts/load-simulator` to be a
real workspace package (own `package.json`, resolves `@wcs/*` deps). If you
add another top-level `scripts/<name>` package, it's already covered.

`apps/web/app/` is currently flat (`dashboard/`, `login/`, `plan/`), not the
route-grouped `(student)/(counsellor)/(admin)` layout PLAN.md's repo-layout
section sketches — deliberately deferred (route groups are invisible in the
URL, so it's a safe, low-priority reorg whenever it's worth the diff, not a
Phase 3 requirement).

Package manager is **pnpm** (workspaces, see `pnpm-workspace.yaml`). Enable it
via `corepack enable && corepack prepare pnpm@9 --activate` if it's missing.

## Commands

```
pnpm install                 # from repo root, installs all workspace packages
docker compose up -d         # Postgres (pgvector) + Redis for local dev
pnpm db:generate             # prisma generate
pnpm db:migrate              # prisma migrate dev (needs an interactive TTY —
                              # see note below for non-interactive environments)
pnpm db:seed                 # runs packages/db/prisma/seed/index.ts
pnpm db:studio               # prisma studio
pnpm dev                     # next dev (apps/web)
pnpm build                   # build all packages
pnpm test                    # vitest across all packages
pnpm typecheck                # tsc --noEmit across all packages
pnpm e2e                      # playwright test (needs `pnpm dev` already running against a seeded DB)
```

Run `cp .env.example .env` once (already done in this checkout) before
`pnpm db:migrate`/`pnpm db:seed` — they read `DATABASE_URL` from there.
**Next.js only auto-loads `.env*` files from its own package directory**, not
the monorepo root — `apps/web/.env` needs a copy too (also already done in
this checkout), or `next dev`/`next build` will run with no env vars at all
(this is exactly how the `AUTH_SECRET` "MissingSecret" error showed up during
Phase 1 verification).

`prisma migrate dev` refuses to run without a TTY (agents, CI, etc.). To
create a new migration non-interactively: write the schema change, then
```sh
mkdir -p prisma/migrations/<timestamp>_<name>
npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --script \
  > prisma/migrations/<timestamp>_<name>/migration.sql   # first migration ever: --from-empty instead
npx prisma migrate deploy
```
Redirect only stdout to the file — `2>&1` will corrupt the SQL with CLI
banner/warning text (bit us once; `prisma migrate deploy` failed with a
syntax error pointing at a box-drawing character in the migration file).

## Key decisions

- **Business logic lives in `packages/core`**, framework-independent, with its
  own Vitest suite. `apps/web` and `packages/workers` are thin — they wire
  real (mock, for now) implementations of `packages/core`'s provider
  interfaces (`StudentRecordProvider`, `ChatModelProvider`, ...) and otherwise
  just call into `core`.
- **Requirements (degree + module rules) are declarative YAML**, not code —
  see `requirements/degrees/*.yaml` and `requirements/modules/*.yaml`. Adding
  a module or reacting to a yearly calendar change should never require a
  code change, only a new/edited YAML file. The audit engine (Phase 2) reads
  and validates these at load time with zod.
- **Auth**: Auth.js (`next-auth` v5 beta) with a Credentials ("mock-login")
  provider that lists seeded students on `/login`, gated by
  `AUTH_MODE=mock` (default). Setting `AUTH_MODE=entra` (plus the
  `AUTH_ENTRA_ID_*` env vars) switches to the real Microsoft Entra ID
  provider and hides the mock login list. Both paths reject non-`@uwo.ca`
  emails in the `signIn` callback.
- **Sections/timetable data is entirely synthetic.** There is no real Western
  timetable feed to mock against (that lives inside Student Center), so
  every `Section` row is generated by `packages/db/prisma/seed/lib/sections.ts`
  and flagged `synthetic: true`. Course *catalog* data (subject, number,
  title, description, prerequisite/antirequisite text, credit weight) **is**
  real, scraped directly from `westerncalendar.uwo.ca` — see `DATA_TODO.md`
  for the handful of exceptions.
- **Essay designation and breadth category are derived, not scraped
  per-course.** Per the calendar's own Course Numbering Policy, essay status
  is fully determined by the course-number suffix letter (E/F/G/Z = essay;
  everything else isn't), and breadth category is fully determined by
  subject (every subject is listed under exactly one of Category A/B/C in
  the calendar's Breadth Requirements page). Both are computed from those two
  lookup tables in `packages/db/prisma/seed/lib/courses.ts` rather than
  fetched per course — this is exact, not a heuristic.
- **Prerequisite/antirequisite text is stored raw *and* parsed.** The seed
  runs `packages/core/src/prereq/parse.ts` over every course and stores the
  result in `Course.prerequisiteTree`/`antirequisiteTree`. The parser never
  guesses: fragments it can't structure become `externalRequirement` nodes
  with `reason: "unparsed"` (and the seed logs which courses need review);
  subjects we haven't seeded become `reason: "outOfCatalog"` rather than an
  invented subject code. The list of partially-parsed courses is pinned in
  `packages/core/test/prereq.test.ts` — update it deliberately.
- **Degree audit engine** (`packages/core/src/audit`): `runDegreeAudit` is a
  pure function of (record, programs, catalog, degree YAML, module YAML).
  Module requirements are allocated *exclusively* (a course counts toward at
  most one requirement per module unless `allowSharedWith` says otherwise)
  by a deterministic greedy pass — specific/allOf, then oneOf, then pools by
  scarcity; degree-level rules (total/senior credits, breadth, essay,
  averages) are evaluated in *shared* mode. Modules are audited
  independently, so a course may count toward two modules. Level rules
  compare the four-digit course number (`2200 level or above` excludes
  2100-2199), not the catalog `level` bucket. Bump `AUDIT_ENGINE_VERSION`
  whenever a change would alter results for the same input — it's part of
  the `DegreeAuditSnapshot` fingerprint that `apps/web/lib/audit.ts` uses to
  decide whether a cached audit is still valid.
- **Course search + schedule builder** (`apps/web/app/plan`, Phase 3):
  `packages/core/src/validation/schedule.ts` (`validateScheduleAddition`) is
  the one place that decides whether adding a section is safe — duplicate/
  already-completed/time-conflict/prereq/antireq/credit-load/section-full,
  each tagged `severity: "block" | "warning"`. `packages/core/src/search.ts`
  (`computeRequirementBadges`) reuses the *audit's own output* to badge a
  course "counts toward X": it walks `DegreeAuditResult.modules[].requirements`
  and `.degreeRequirements`, and badges a course wherever it appears in an
  **UNMET** requirement's `suggestedCourses` — no separate matching logic,
  so a badge and the dashboard's audit can never disagree. Both are pure,
  framework-independent, and unit-tested; `apps/web/components/schedule-planner.tsx`
  is the one client component that calls them and calls the `schedule-actions.ts`
  server actions (which re-derive the acting student from the session on
  every call — never trust a client-supplied studentId for ownership checks).
  Known v1 simplification: `ScheduleItem` has one preferred + one fallback
  section per course, so a LEC's companion LAB/TUT isn't independently
  selectable — see `DATA_TODO.md`.
- **shadcn/ui**: `apps/web/components.json` + `components/ui/*` (button,
  badge, card, tabs, checkbox, select, tooltip, separator, input, label,
  scroll-area — added for Phase 3, more via `npx shadcn add <name>`). The
  Western-purple brand color is wired into shadcn's own CSS-variable tokens
  (`--primary` in `app/globals.css`), not bolted on separately. The weekly
  calendar grid is hand-rolled Tailwind (no date/calendar library) — 5 fixed
  day columns is simple enough not to need one.
- **Playwright** (`e2e/`, root `pnpm e2e`): no `webServer` block in
  `playwright.config.ts` — the app needs a seeded Postgres that Playwright
  itself can't provision, so start `pnpm dev` (with a real DB migrated +
  seeded) yourself first, same as manual testing.
- **Enrollment engine** (`packages/workers`, `packages/db/src/enrollment.ts`,
  Phase 4): `EnrollmentIntent` is created by `apps/web/lib/enrollment-actions.ts`
  (`submitEnrollmentPlan`) from a schedule marked as the enrollment plan, and
  a BullMQ commit job is delayed exactly to the student's real
  `enrollmentAppointment` (`scheduleCommitJob`) — no seat is ever reserved
  early. A recurring scan job (every `WORKERS_SCAN_INTERVAL_MS`, default 60s)
  finds intents due within 72h and pre-validates them
  (`findIntentsDueForPreValidation` → `preValidateIntent`), storing a
  `PreValidationResult` keyed by `computeEnrollmentFingerprint` (order-
  independent hash of student record version + hold versions + section
  versions — deliberately *not* `node:crypto`, since `packages/core` is
  imported by client components too). At commit time
  (`commitEnrollmentIntent`), a matching fingerprint reuses the cached
  result; a mismatch re-validates fully. Per-item validation reuses Phase
  3's `validateEnrollmentIntent`/`validateScheduleAddition` (falls back
  preferred → fallback section → "none"). The only place a seat is actually
  taken is `commitSeat`'s conditional `UPDATE ... WHERE "enrolledCount" <
  "capacity" RETURNING *` — no app-level locking, the WHERE clause *is* the
  concurrency control (proven under real concurrent load in
  `packages/db/test/enrollment-commit.test.ts` and the load simulator).
  Idempotency is a real DB constraint (`Enrollment` is unique on
  `(studentId, courseId, term, year)`), not just "processors try to be
  careful" — a retried job that already succeeded hits the constraint and
  no-ops. `packages/workers` runs as its own process
  (`pnpm --filter @wcs/workers start`) — separate from `apps/web` on
  purpose, since the commit queue's concurrency cap is the admission-control
  mechanism, and that only means something as a fixed number of real
  worker slots, not something serverless request handlers can enforce.
  `scripts/load-simulator` (`pnpm --filter @wcs/load-simulator simulate [N] [concurrency]`)
  spins up its *own* temporary `Worker` on the same queue to measure — stop
  any already-running `pnpm --filter @wcs/workers start` process first, or
  the two consumers split the jobs and skew the concurrency numbers.
  **BullMQ custom job ids can't contain `:`** (throws "Custom Id cannot
  contain :" — hit this for real on the very first live commit-job test);
  `commitJobId`/`preValidationJobId` in `packages/workers/src/queues.ts` use
  `-` and are the one place job ids get built, with a test pinning it.
- **Academic record + counsellor portal** (`apps/web/lib/academic-file.ts`,
  `apps/web/app/academic-file`, `apps/web/app/counsellor`, Phase 5):
  `packages/core/src/access/scope.ts`'s `canViewAcademicFile`/
  `canEditAcademicFile` are the one place access is decided — a student may
  view (never edit) their own file, a counsellor only if a `CounsellorStudent`
  row links them to the student, an admin always. `assertCanViewAcademicFile`
  (`apps/web/lib/academic-file.ts`) calls this and then Next's `notFound()`
  on denial — a 404, not a 403, so an unassigned counsellor can't distinguish
  "not your student" from "doesn't exist." Every call site follows the assert
  with `recordAccess(...)`, which writes a real `AccessLogEntry`; there's no
  separate "should I log this" logic — viewing the page *is* the log write.
  `apps/web/lib/counsellor-actions.ts`'s `addAdvisingNote` re-derives and
  re-checks the advising relationship server-side from the session (never
  trusts a client-supplied studentId), matching the same pattern as
  `schedule-actions.ts`/`enrollment-actions.ts`. The counsellor one-pager
  (`/counsellor/[studentId]`) uses the existing (previously unused) shadcn
  `Tabs` component with all tab content server-rendered up front and passed
  in as children — no client-side data fetching needed, Radix just
  shows/hides via CSS. `/dashboard` redirects `COUNSELLOR`/`ADMIN` sessions
  straight to `/counsellor` so there's one canonical home per role; mock
  login always redirects to `/dashboard` regardless of role and relies on
  that onward redirect. Counsellor caseloads and advising-note/accommodation/
  petition fixtures are seeded by `packages/db/prisma/seed/lib/academic-file.ts`
  (2 counsellors, 4 students each) — fabricated, not real advising records
  (see `DATA_TODO.md`).
- **Advisor chatbot** (`packages/chatbot`, `apps/web/app/chat`, `apps/web/app/api/chat`,
  Phase 6): `answerQuestion` (`packages/chatbot/src/orchestrate.ts`) is the
  single entry point — `packages/core/src/chatbot/guardrails.ts`'s
  `checkScope` runs first and short-circuits out-of-scope questions
  (petitions/appeals/accommodations/academic standing/medical/financial aid)
  to a canned counsellor redirect with zero model calls; otherwise
  `retrieveRelevantChunks` does a real pgvector `<=>` ANN query over
  `CalendarChunk` and the top results are injected as a numbered,
  cited context message before calling the `ChatModelProvider`. If the
  model calls the one offered tool (`GET_DEGREE_AUDIT_TOOL`), the real
  audit engine runs (`getDegreeAudit`, moved to `packages/db/src/audit.ts`
  in this phase so `apps/web`'s dashboard/counsellor pages and the chatbot
  share one cached implementation instead of duplicating it) and its
  digest (`summarizeAuditForTool`) is fed back for a second completion —
  never guessing a student's personal progress from policy text.
  **`CalendarChunk` embeddings are a deterministic hashing-trick bag-of-words
  vector** (`packages/core/src/chatbot/embed.ts`), not a real ML embedding —
  no embedding provider is configured in this environment. It's genuinely
  wired to pgvector (real `INSERT ... embedding vector(1536)`, real
  `ORDER BY embedding <=> query`), just with a mock vector function; swap
  `embedText` for a real provider (OpenAI/Voyage/a local Ollama embedding
  model) behind the same signature when one is configured, and re-run
  `pnpm db:seed` to re-embed. **`CHAT_MODEL_PROVIDER` defaults to `"mock"`**
  (`packages/chatbot/src/providers/mock.ts`) — no API key needed, runs out
  of the box, same pattern as mock auth/mock student records. It simulates
  what a real model would do with the same system prompt (keyword-based
  `looksPersonal` stands in for the model inferring intent from the tool's
  description). `AnthropicChatModelProvider`/`OllamaChatModelProvider` are
  real, code-complete implementations behind `CHAT_MODEL_PROVIDER=anthropic`/
  `=ollama`, **untested against a live API in this environment** (no key,
  no local Ollama server) — see `DATA_TODO.md`. `ChatMessage`'s role set
  (system/user/assistant/tool) is deliberately simpler than Anthropic's
  native tool_use/tool_result block shape so one interface fits both real
  providers; the Anthropic provider folds every system-role message into
  one top-level `system` string and sends a "tool" message as plain
  user-role text rather than a native tool_result block — a real v1
  simplification, not a bug. Calendar chunks are ingested at seed time
  (`packages/db/prisma/seed/lib/calendar-chunks.ts`, part of `pnpm db:seed`)
  from real data already in the database/requirement YAML — course
  catalog text (`Course.sourceUrl` is the real citation), and prose
  generated from the requirement DSL for modules/degree rules (citing the
  real `Modules.cfm?ModuleID=...`/`PolicyPages.cfm?...` URLs already in
  each YAML file's `# Source:` header comment) — nothing fabricated.
  Long documents are split into several small chunks rather than one giant
  one per module/degree file (measured directly: an unsplit HSp-Computer-
  Science module chunk didn't rank in the top 4 results for a query
  naming it, because its bag-of-words vector diluted across too much
  vocabulary; splitting fixed it) — a real chunking-pipeline concern, not
  just a workaround for the mock embedding.
- **Monorepo tool: pnpm workspaces only**, no Turborepo/Nx — flagged as an
  intentional deviation from a literal reading of the original stack list,
  approved during planning; revisit only if build caching actually becomes a
  pain point.
- **zod** is used for runtime validation of the requirement YAML and API
  route inputs — added during planning, not in the original stack list,
  because TypeScript alone can't validate data loaded from disk at runtime.

## Data provenance

Course catalog, module requirements, and degree-level rules (breadth,
essay, honours average, credit limits) were scraped directly from the live
2026 Western Academic Calendar (`westerncalendar.uwo.ca`) on 2026-09-27, not
estimated or invented. `DATA_TODO.md` lists the specific exceptions (one
course code referenced by a module that couldn't be found in the current
catalog; a handful of non-Science elective courses seeded thinly just to make
breadth Category A/B testable).

## Manual DB verification hygiene

When testing something live against the seeded dev DB (e.g. via `psql` or a
scratch script), **scope cleanup deletes by specific row id, never by a
broad filter like `studentId` alone** — the 8 seeded personas have real
Enrollment/Hold/etc. rows mixed in with whatever test data you just created
against the same student, and a `DELETE ... WHERE "studentId" = $1` takes
those out too. Hit this for real once (wiped and had to manually restore
Marcus Chen's seeded enrollment history from his `PERSONAS` entry in
`students.ts` — recoverable because the fixture data is in version control,
but avoid needing to). Prefer creating disposable scratch rows (a throwaway
Course/Student, like `packages/db/test/enrollment-commit.test.ts` and
`scripts/load-simulator` both do) over touching real seeded rows at all.

## Conventions

- Strict TypeScript everywhere; no `any` in `packages/core` or `packages/db`.
- Course identity is always `{ subject, number }` (e.g. `{ subject: "COMPSCI",
  number: "2210A/B" }`) — matches how Western's own calendar and course
  search present it. Don't invent a separate course-code string format.
- Seed student fixtures live in `packages/db/prisma/seed/students.ts` as
  plain data (`PERSONAS`) — add new fixtures there, not by hand-writing SQL
  or ad hoc scripts.
- When adding a new module: add `requirements/modules/<code>.yaml` (the file
  name must equal the module's `code`), then reference that `code` from any
  student fixture that should be enrolled in it. The seed creates a `Program`
  row for every module file automatically, and fails with a readable error if
  a file doesn't validate against `packages/core/src/requirements/schema.ts`.
  `checkModuleAgainstCatalog` (run in the core test suite) catches course
  codes that aren't in the catalog.
- Requirement node types: `specificCourse`, `allOf`, `oneOf` (optionally
  with `credits`), `creditsFromList` (matchers on subject / exact number /
  minLevel / maxLevel / breadth / essay), `creditsAtLevel`, `totalCredits`,
  `moduleAverage`, `cumulativeAverage`, `count` (n-of-m, nested). If a
  calendar rule can't be expressed with these, add a node type to the schema
  and engine — don't special-case a module in code.
