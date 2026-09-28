# Western Course Selection Platform (First Draft — Faculty of Science)

A working first-draft replacement for Western University's course selection
experience, scoped to the Faculty of Science. See `PLAN.md` for the full
architecture and phase breakdown, `CLAUDE.md` for conventions and key
decisions, and `DATA_TODO.md` for seed-data caveats.

**Status:** Phases 1–5 complete — scaffold/seed/auth, degree audit engine,
course search + schedule builder, the enrollment engine (intents,
pre-validation, atomic appointment-time commit, load simulator), and the
academic record + counsellor portal (student-facing file, counsellor
caseload + one-page summary, role-based access with a live access log).

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

Then open http://localhost:3000 — you'll land on `/login`, which lists the
seeded students (and a couple of counsellor/admin accounts) since there's no
real Western SSO available here. Pick any of them to sign in.

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
- **Mocked:** authentication (dev login list; real Entra ID wiring exists but
  is off by default), the student record system, the entire timetable
  (every `Section` — days/times/instructor/capacity — is synthetically
  generated, since no real Western timetable feed exists to mock against),
  and the advising notes/accommodation tickets/petition records shown in the
  counsellor portal (fabricated fixtures, not real Western advising data).
- **Not built yet:** the chatbot — see `PLAN.md`'s phase list.

## Commands

See `CLAUDE.md` for the full command list and repo conventions.
