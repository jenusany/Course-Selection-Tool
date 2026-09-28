# Western Course Selection Platform (First Draft — Faculty of Science)

A working first-draft replacement for Western University's course selection
experience, scoped to the Faculty of Science. See `PLAN.md` for the full
architecture and phase breakdown, `CLAUDE.md` for conventions and key
decisions, and `DATA_TODO.md` for seed-data caveats.

**Status:** All 7 phases complete — scaffold/seed/auth, degree audit engine,
course search + schedule builder, the enrollment engine (intents,
pre-validation, atomic appointment-time commit, load simulator), the
academic record + counsellor portal (student-facing file, counsellor
caseload + one-page summary, role-based access with a live access log), the
advisor chatbot (`/chat` — RAG over the real calendar with citations,
tool-calls the degree audit engine for personal questions, redirects
out-of-scope questions to a real counsellor), and a polish pass (WCAG 2.1 AA
— proven with an automated `axe-core` scan across every page, not just
asserted — mobile layout, empty/error states, and the demo script below).

## Prerequisites

- Node.js 20+
- [Docker](https://www.docker.com/) (for local Postgres + Redis) — or a
  local Postgres 16 with the `pgvector` extension and a local Redis, if you'd
  rather not use Docker
- pnpm, via corepack: `corepack enable && corepack prepare pnpm@9 --activate`

### If Docker isn't available and Homebrew is painfully slow

On at least one dev machine (macOS 14 "Sonoma"), Homebrew no longer ships
prebuilt bottles for that OS version, so `brew install postgresql@16 redis`
falls back to compiling everything (including transitive deps like
`readline`, `openssl`, and — for `redis` — a full LLVM/Rust/CMake toolchain)
from source. On top of that, `readline`'s source patches are only fetchable
through `ftpmirror.gnu.org`, whose GeoIP-based redirect pointed our test
network at a completely dead mirror, so the build could stall for a very
long time. If you hit the same thing:

- **Postgres**: use [Postgres.app](https://postgresapp.com/) instead — a
  precompiled, self-contained app (no Homebrew, no GNU mirrors) that
  **already bundles pgvector**. Download the Postgres-16-only build, drag it
  to `/Applications`, then either use its GUI to start a server, or headless:
  ```sh
  PGBIN=/Applications/Postgres.app/Contents/Versions/16/bin
  "$PGBIN/initdb" -D ~/pgdata-wcs -U wcs --auth=trust
  "$PGBIN/pg_ctl" -D ~/pgdata-wcs -l /tmp/postgres.log start
  "$PGBIN/createdb" -U wcs wcs
  "$PGBIN/psql" -U wcs -d wcs -c "CREATE EXTENSION vector;"
  ```
  Then set `DATABASE_URL="postgresql://wcs@localhost:5432/wcs"` in `.env`
  (note: no password — `--auth=trust` is fine for local dev only).
- **Redis**: same story — Homebrew's `redis` formula pulls in ~18 build-tool
  dependencies (cmake, rust, llvm, autoconf...) on top of the missing-bottle
  problem. Redis's own build is just a Makefile with no external
  dependencies beyond a C compiler, so building it directly from the GitHub
  release tarball (not via Homebrew) is fast and avoids all of this:
  ```sh
  curl -sL -o redis.tar.gz https://github.com/redis/redis/archive/refs/tags/8.10.2.tar.gz
  tar xzf redis.tar.gz && cd redis-8.10.2 && make -j4   # ~40s, no external deps
  mkdir -p ~/redis-local && cp src/redis-server src/redis-cli ~/redis-local/
  ~/redis-local/redis-server --daemonize yes --port 6379 --dir ~/redis-local --logfile ~/redis-local/redis.log
  ```
  `REDIS_URL="redis://localhost:6379"` in `.env` already matches this.

## Setup

```sh
pnpm install
cp .env.example .env          # already done in a fresh checkout of this repo
docker compose up -d          # Postgres (pgvector) + Redis
pnpm db:migrate
pnpm db:seed
pnpm dev                          # apps/web
pnpm --filter @wcs/workers start  # separate process — the enrollment engine's queue workers
```

Then open http://localhost:3000 — you'll land on `/login`. There's no real
Western SSO here, so sign in with any seeded `@uwo.ca` email and the shared
dev password **`test`** (a reference list of every seeded account is right
below the form).

## What's real vs. mocked right now

- **Real:** the course catalog (subjects, course numbers, titles,
  descriptions, prerequisite/antirequisite text, credit weights), the four
  seeded modules' requirements, and the Faculty of Science degree-level rules
  (breadth, essay, honours average, credit limits) — all scraped directly
  from the live Western Academic Calendar. The degree audit engine, the
  course search + schedule builder, and the enrollment engine (intents,
  pre-validation, atomic appointment-time seat commit) are fully working
  against this real catalog data. The academic record + counsellor portal's
  access control (advising-relationship scoping, access logging) is fully
  working logic — the notes/tickets/petitions it displays are fixture data.
  The advisor chatbot's retrieval, scope guardrails, and audit-tool-calling
  logic are fully working against real calendar text (with real citation
  URLs) and the real audit engine — see below for what's mocked inside it.
- **Mocked:** authentication (typed email + a shared dev password, `test`,
  against seeded accounts; real Entra ID wiring exists but
  is off by default), the student record system, the entire timetable
  (every `Section` — days/times/instructor/capacity — is synthetically
  generated, since no real Western timetable feed exists to mock against),
  the advising notes/accommodation tickets/petition records shown in the
  counsellor portal (fabricated fixtures, not real Western advising data),
  the chatbot's model (`CHAT_MODEL_PROVIDER=mock` by default — no API key
  needed; real Anthropic/Ollama implementations exist and are code-complete
  but untested live here, see `DATA_TODO.md`), and its embeddings (a
  deterministic hashing-trick vector standing in for a real embedding model,
  genuinely wired to pgvector).
- **Not built yet:** nothing — all 7 planned phases are built. See
  `PLAN.md`'s "Known v1 limitations" under each phase for what's
  deliberately out of scope for this first draft.

## Demo script

No real Western SSO exists here — sign in at `/login` with any seeded
`@uwo.ca` email below and the shared dev password **`test`**. Walking
through all 9 students plus both counsellors and the admin account
exercises every fixture scenario end to end.

### Students

1. **Priya Nakamura** (`priya.nakamura@uwo.ca`) — first-year, undeclared, no
   completed courses, no holds. Shows every empty state at once: dashboard
   with no active-holds banner, `/academic-file` showing "Undeclared" and
   "None on file", `/plan`'s audit with zero declared programs. Ask the chat
   ("What's the prerequisite for COMPSCI 2210A/B?") to confirm it still works
   with no program on record.
2. **Marcus Chen** (`marcus.chen@uwo.ca`) — second-year, Honours
   Specialization in Computer Science, on track. The main "everything works"
   path: dashboard audit progress, `/plan` search + add a course + mark a
   schedule as the enrollment plan, `/enrollment` submit and watch the status
   poll, `/chat` ask "Am I on track to finish my Computer Science module?"
   and watch it call the degree audit tool instead of guessing. Rebecca
   Stevens is his assigned counsellor — see her advising note about his
   upcoming enrollment appointment on his `/academic-file`.
3. **Aisha Bello** (`aisha.bello@uwo.ca`) — fourth-year, near graduation,
   module core essentially complete, finishing electives + thesis. Good
   contrast to Marcus/Priya for the audit's "mostly MET" state.
4. **Derek Osei** (`derek.osei@uwo.ca`) — has completed COMPSCI 3380F/G/Z,
   the antirequisite of COMPSCI 4490Z (Thesis). Search "4490Z" on `/plan`:
   it shows "Can't add" with the Add button disabled, and the audit flags
   the conflict.
5. **Sofia Marchetti** (`sofia.marchetti@uwo.ca`) — an active
   `DOCUMENT_MISSING` hold shows on her dashboard and blocks the usual flow.
   Her counsellor (Tunde Abara) left an advising note about it — visible on
   her `/academic-file` along with who's viewed her file and when.
6. **Jordan Whitfield** (`jordan.whitfield@uwo.ca`) — double-module (Major
   Computer Science + Major Mathematics), testing multi-module audit
   aggregation, plus an intentional antirequisite pair (COMPSCI 2214A/B /
   MATH 2155F/G, both completed — see `DATA_TODO.md`) with an approved
   petition exception on file for it.
7. **Grace Petrov** (`grace.petrov@uwo.ca`) — mid-way through Honours
   Specialization in Biology, an active accommodation ticket (extended exam
   time) visible on her `/academic-file`.
8. **Liam Fontaine** (`liam.fontaine@uwo.ca`) — fourth-year, borderline
   honours average: his HSp module average is 69.86%, just under the 70%
   cutoff and just above the 68% Dean's-permission floor. Check the
   dashboard audit's average requirement row, and his advising note from
   Tunde Abara about the standing check-in.
9. **Jenusan Yogarajah** (`jyogara@uwo.ca`) — the personal demo account for
   the typed login itself: fourth-year, near graduation, Honours
   Specialization in Computer Science (same shape as Aisha's fixture, with
   higher grades). Rebecca Stevens is the assigned counsellor.

### Counsellors and admin

10. **Rebecca Stevens** (`r.stevens@uwo.ca`) — caseload: Priya, Marcus,
    Aisha, Derek, Jenusan. Lands on `/counsellor` (the dashboard redirects
    counsellors there); click into a student for the one-page tabbed summary
    (Overview/Courses/Advising notes/Accommodations & petitions/Access log),
    and add a note from the Advising notes tab. Then try navigating directly
    to one of **Tunde's** students' `/counsellor/<id>` URL — it 404s, not a
    generic error, proving the advising-relationship check (see
    `e2e/academic-record.spec.ts`).
12. **Tunde Abara** (`t.abara@uwo.ca`) — caseload: Sofia, Jordan, Grace,
    Liam. Same portal, opposite caseload — good for the cross-counsellor
    access-denial check above.
13. **System Administrator** (`admin@uwo.ca`) — `/counsellor` shows **all**
    9 students regardless of caseload assignment (the one role with
    unrestricted access, per `canViewAcademicFile` in
    `packages/core/src/access/scope.ts`).

## Commands

See `CLAUDE.md` for the full command list and repo conventions.
