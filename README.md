# Questionary

Community quizzes. Sign in with GitHub, publish a quiz from a YAML or JSON file, and play
quizzes other people published. Grading happens on the server, so the answer key never
reaches the browser before you submit. Vote quizzes up or down, filter by tag, and compete
on each quiz's leaderboard. The original offline mode still lives at `/local`.

## Run it locally

Requires Node 22 or newer.

1. `npm install`
2. Register a GitHub OAuth app at https://github.com/settings/developers with callback
   URL `http://localhost:3000/api/auth/github/callback`.
3. `cp .env.example .env` and fill in `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, and a
   random `SESSION_SECRET`.
4. `npm run dev` and open http://localhost:3000.

`npm test` runs the server tests. `npm run build` type-checks both sides and builds the
frontend into `dist/`.

## Quiz file format

A document is a list. The first item is metadata, the rest are questions.

```yaml
- metadata:
    name: "Unity basics"          # required
    author: "you"                 # optional, shown in offline mode only
    description: "Warm-up set"    # optional, prefills the publish form
    tags: [unity, csharp]         # optional, up to 5
- id: Q001
  type: mc
  prompt: "Which call allocates on the managed heap?"
  options: ["A", "B", "C", "D"]
  answer: 2                       # 0-based index
  explanation: "Optional"
- id: Q002
  type: tf
  prompt: "This statement is true."
  answer: true
```

## Deploy

One process. Build once, then run with `NODE_ENV=production`:

```bash
npm ci && npm run build
NODE_ENV=production node server/index.ts
```

The server reads `.env` from the project root if present; otherwise the environment
must carry the settings. Put Caddy or nginx in front for TLS and set `BASE_URL` to the
public origin. The database is the single SQLite file at `DATABASE_PATH`. Back it up
with `sqlite3 questionary.db ".backup out.db"`.

`npm run dev` restarts the server when files under `server/` or `shared/` change and
relies on Node's `--watch-path`, which Node documents for Windows and macOS. On Linux,
run `npm start` and restart by hand, or use your own watcher.

## Design

`docs/superpowers/specs/2026-09-04-community-quizzes-design.md` holds the product and
technical design. Plans per phase live in `docs/superpowers/plans/`.
