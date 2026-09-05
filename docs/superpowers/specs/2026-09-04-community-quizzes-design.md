# Questionary community: PRD and technical design

Date: 2026-09-04
Status: approved in brainstorming, awaiting spec review
Repo: https://github.com/Wildeax/Questionary

## 1. Goal

Turn Questionary from a single-user, paste-a-file quiz player into a small community
site. People sign in with GitHub, publish quizzes, browse and search other people's
quizzes, play them, vote on them, compete on per-quiz leaderboards, and play live
against friends in rooms.

The existing offline flow (paste or upload a YAML/JSON file, play in the browser, resume
after a refresh) stays as it is today.

## 2. Decisions already made

These came out of the brainstorming session and are not open.

| Topic | Decision |
|---|---|
| Backend | Own Node server, SQLite via the built-in `node:sqlite` |
| Auth | GitHub OAuth only. No passwords, no email. |
| Authoring | Both: YAML/JSON upload and an in-app editor |
| Ranking | Thumbs up/down per quiz plus a per-quiz solver leaderboard |
| Anonymous play | Anyone can browse and play published quizzes. Sign-in is needed to publish, vote, appear on a leaderboard, or host a room. |
| Tags | Free-form, lowercased, up to 5 per quiz, autocomplete from existing tags |
| Structure | One Node process serving the built React app and the API. Monorepo. |
| Rooms | Both race mode and synchronized (Kahoot-style) mode |
| Room join | Anyone with the code joins by nickname. Host must be signed in. Room results stay in the room. |
| Deploy | One process, one SQLite file, Caddy or nginx in front for TLS |

## 3. Scope by phase

Everything below is in scope. It ships in four plans so a usable site exists after the
first one. Each phase gets its own implementation plan.

### Phase 1: publish and play

- Sign in with GitHub, sign out, header shows avatar.
- Publish a quiz by uploading or pasting YAML/JSON. Fill in title and description. Save
  as draft or publish.
- Catalog page: search by text, sort by top, new, or popular.
- Quiz page: title, description, author, question count, Play button.
- Online play with server-side grading. The browser never receives the answer key
  before submitting.
- Resume an online attempt after a refresh, same as local mode today.
- Profile page: avatar, username, published quizzes.
- My page: drafts and published quizzes, edit and delete.
- Admin can unpublish or delete any published quiz.
- Existing local mode, moved to `/local`, unchanged in behavior.

### Phase 2: votes, tags, leaderboard, history

- Thumbs up/down on a quiz page, one vote per user, changeable.
- Tags on publish form with autocomplete. Tag chips on the catalog filter the list.
- Leaderboard on the quiz page: top 10, best attempt per user.
- Attempt history on My page.

### Phase 3: editor

- In-app editor as a second tab on the publish page.
- Add, delete, reorder questions. Multiple choice and true/false.
- Download the quiz as YAML.

### Phase 4: rooms

- Host creates a room for a published quiz, gets a 6-character code.
- Friends join by code and nickname. No account needed.
- Race mode: same start, own pace, live progress board, winner by correct then time.
- Synchronized mode: one question at a time, per-question timer, points by speed,
  scoreboard between questions.
- Reconnect after a refresh keeps your seat.

## 4. Non-goals

- Password or email login. Password reset. Email of any kind.
- Comments, follows, notifications, direct messages.
- Reporting or a moderation queue. Admin is a list of usernames in env.
- Images or rich text in questions. Prompts and options are plain text.
- Question types beyond multiple choice and true/false.
- Persisting rooms across a server restart or across multiple server processes.
- Room results feeding the global leaderboard or attempt history.
- Rate limiting in application code.
- Mobile app. The site is responsive, as today.

## 5. Architecture

One Node process, `server/index.ts`, started with `node server/index.ts`. Node 22 runs
TypeScript files directly by stripping types, so the server has no build step.

- In development (`NODE_ENV` not `production`) the server creates Vite in middleware
  mode and mounts it after the API routes. One command gives hot reload and the API.
- In production it serves `dist/` with `express.static` and falls back to
  `dist/index.html` for any non-API GET so the router works on refresh.
- API routes are registered before either, under `/api`.
- SQLite through `node:sqlite` in WAL mode. One file at `DATABASE_PATH`.
- Live room state is pushed over Server-Sent Events. Actions come in as POSTs.

Runtime dependencies added: `express` 5 (5.2 at the time of writing; async route
errors reach the error middleware without wrappers) and `react-router` pinned to 7.x
(8.x requires React 19.2 and this app is on React 18; the `react-router-dom` package is
a compatibility re-export and is not used). Dev dependencies added: `@types/express` 5,
`@types/node` 22. Everything else is stdlib or already installed (`js-yaml`, `react`,
`vite`, `tailwindcss`, TypeScript 5.9).

## 6. Repo changes

```
src/                 React app. Existing components reused.
  App.tsx            router and header only
  pages/             Catalog, Quiz, Play, Publish, Profile, Me, Local, Room
  components/        existing QuestionPage, ResultsView, SettingsView, SetupView,
                     plus QuizRunner (extracted from today's App.tsx) and Editor
  api.ts             fetch wrappers, one function per endpoint
  storage.ts         IndexedDB resume, legacy stubs deleted
shared/
  types.ts           moved from src/types.ts
  validate.ts        parseQuestionsFromText and validateQuizData, moved from src/utils.ts
  grade.ts           grade(questions, answers) -> { correct, total, perQuestion }
server/
  index.ts           app setup, static or Vite, listen
  db.ts              open database, run schema.sql, prepared statement helpers
  auth.ts            GitHub OAuth, session cookie sign and verify, requireUser
  routes/            quizzes.ts, play.ts, users.ts, tags.ts, rooms.ts
  rooms.ts           in-memory room state machine, no HTTP in it
  schema.sql
  test/              node:test files
questions/           sample YAML stays
docs/superpowers/    this spec and the plans
```

Concrete edits to existing files:

- `package.json`: add `"type": "module"`. Scripts become
  `dev: node --env-file=.env --watch server/index.ts`,
  `build: tsc -p tsconfig.json && tsc -p tsconfig.server.json && vite build`,
  `start: node server/index.ts`, `test: node --test server/test/`.
- Rename `postcss.config.js` and `tailwind.config.js` to `.cjs`. They use
  `module.exports` and would break under `"type": "module"`.
- `tsconfig.json`: include `src` and `shared`, add `verbatimModuleSyntax: true` so a
  type-only import is always `import type`, and `erasableSyntaxOnly: true` so enums,
  namespaces, and parameter properties are compile errors. Node's type stripping
  cannot run those, and `shared/` runs on both sides.
- New `tsconfig.server.json`: `module: nodenext`, `types: ["node"]`, `noEmit`,
  `allowImportingTsExtensions`, `verbatimModuleSyntax`, `erasableSyntaxOnly`,
  includes `server` and `shared`.
- Relative imports inside `server/` and `shared/` use explicit `.ts` extensions. The
  frontend already allows that through `allowImportingTsExtensions`.
- `.gitignore`: add `*.db`, `*.db-wal`, `*.db-shm`.
- `index.html`: title becomes `Questionary`.
- `src/App.tsx`: the 400-line quiz flow moves into `components/QuizRunner.tsx`. The
  stale header comment describing the Unity exam goes.
- `src/storage.ts`: delete the four legacy no-op functions.

## 7. Data model

`server/schema.sql`, applied on startup with `CREATE TABLE IF NOT EXISTS`. All
timestamps are Unix milliseconds stored as INTEGER.

```sql
CREATE TABLE IF NOT EXISTS users (
  id          INTEGER PRIMARY KEY,
  github_id   INTEGER NOT NULL UNIQUE,
  username    TEXT    NOT NULL,
  avatar_url  TEXT    NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS quizzes (
  id            INTEGER PRIMARY KEY,
  author_id     INTEGER NOT NULL REFERENCES users(id),
  title         TEXT    NOT NULL,
  description   TEXT    NOT NULL DEFAULT '',
  questions     TEXT    NOT NULL,            -- JSON array of Question
  version       INTEGER NOT NULL DEFAULT 1,
  published     INTEGER NOT NULL DEFAULT 0,  -- 0 draft, 1 published
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  published_at  INTEGER
);
CREATE INDEX IF NOT EXISTS quizzes_published ON quizzes(published, published_at);
CREATE INDEX IF NOT EXISTS quizzes_author    ON quizzes(author_id);

CREATE TABLE IF NOT EXISTS quiz_tags (
  quiz_id  INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  tag      TEXT    NOT NULL,
  PRIMARY KEY (quiz_id, tag)
);
CREATE INDEX IF NOT EXISTS quiz_tags_tag ON quiz_tags(tag);

CREATE TABLE IF NOT EXISTS votes (
  user_id  INTEGER NOT NULL REFERENCES users(id),
  quiz_id  INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  value    INTEGER NOT NULL CHECK (value IN (-1, 1)),
  PRIMARY KEY (user_id, quiz_id)
);

CREATE TABLE IF NOT EXISTS attempts (
  id            INTEGER PRIMARY KEY,
  quiz_id       INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  quiz_version  INTEGER NOT NULL,
  user_id       INTEGER NOT NULL REFERENCES users(id),
  correct       INTEGER,                    -- NULL until submitted
  total         INTEGER NOT NULL,
  started_at    INTEGER NOT NULL,
  finished_at   INTEGER,
  answers       TEXT                        -- JSON, NULL until submitted
);
CREATE INDEX IF NOT EXISTS attempts_board ON attempts(quiz_id, quiz_version, correct, finished_at);
CREATE INDEX IF NOT EXISTS attempts_user  ON attempts(user_id, finished_at);
```

`PRAGMA foreign_keys = ON` and `PRAGMA journal_mode = WAL` run at open.

Derived values are computed at query time, no counter columns:

- score = `COALESCE(SUM(votes.value), 0)`
- plays = `COUNT(attempts.id) WHERE finished_at IS NOT NULL`
- leaderboard = best finished attempt per user for `quiz_version = quizzes.version`,
  ordered by `correct DESC, (finished_at - started_at) ASC`, limit 10
- durationMs = `finished_at - started_at`

Rooms are not in the database. See section 14.

## 8. Quiz file format

Unchanged shape, two new optional metadata fields.

```yaml
- metadata:
    name: "Unity Senior Certified Exam"   # required, becomes the title
    author: "Wildeax"                     # optional, display only
    description: "100 questions on ..."   # optional, prefills the publish form
    tags: [unity, csharp, certification]  # optional, prefills the publish form
- id: Q001
  type: mc
  prompt: "..."
  options: ["A", "B", "C", "D"]
  answer: 2
  explanation: "..."
- id: Q002
  type: tf
  prompt: "..."
  answer: true
```

`validateQuizData` in `shared/validate.ts` accepts and normalizes the two new fields.
Export (`GET /api/quizzes/:id/export`) writes them back. On publish the file's `author`
field is ignored: the signed-in publisher is the author everywhere on the site. Local
mode still shows the file's `author` as it does today. Export writes the publisher's
GitHub username into `author`.

## 9. Auth

GitHub OAuth, hand-rolled with `fetch`. No scope is requested. The public profile is
enough.

1. `GET /api/auth/github`: generate 16 random bytes as `state`, set it in a cookie
   `oauth_state` (HttpOnly, SameSite=Lax, 10 minutes), redirect to
   `https://github.com/login/oauth/authorize?client_id=...&state=...&redirect_uri=BASE_URL/api/auth/github/callback`.
2. `GET /api/auth/github/callback?code&state`: compare `state` to the cookie. POST to
   `https://github.com/login/oauth/access_token` with `Accept: application/json`. GET
   `https://api.github.com/user` with the token. Upsert `users` on `github_id`,
   refreshing `username` and `avatar_url`. Set the session cookie. Redirect to `/`.
   On any failure redirect to `/?error=auth`.
3. `POST /api/auth/logout`: clear the session cookie.
4. `GET /api/me`: `{ id, username, avatarUrl, isAdmin }` or 401.

Session cookie `qs` holds `userId.expiresAt.signature` where signature is
base64url(HMAC-SHA256(`userId.expiresAt`, `SESSION_SECRET`)). HttpOnly, SameSite=Lax,
Secure in production, 30 days. No sessions table. Verification is constant-time
compare via `crypto.timingSafeEqual`. Cookie parsing is a 5-line split of the
`Cookie` header, no cookie-parser.

`requireUser` middleware reads the cookie and loads the user, or returns 401.
`isAdmin` is `ADMIN_USERS.split(',').includes(username)`.

CSRF: SameSite=Lax plus JSON-only request bodies. The server rejects any mutating
request whose `Content-Type` is not `application/json`. Cross-site forms cannot send
that without a CORS preflight, and the server sets no CORS headers.

## 10. API

All responses are JSON. Errors are `{ "error": "message" }` with 400, 401, 403, 404,
or 409. Body limit 1 MB. Pagination is `?page=1`, 20 per page, response carries
`{ items, page, hasMore }`.

Card shape, used by every list:

```ts
type QuizCard = {
  id: number; title: string; description: string;
  author: { username: string; avatarUrl: string };
  tags: string[]; questionCount: number;
  score: number; plays: number; publishedAt: number;
};
```

### Quizzes

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/quizzes?q=&tag=&sort=top|new|popular&page=` | none | published only. `q` is `LIKE '%q%'` on title and description. `tag` is an exact match. Both given means both must match. |
| POST | `/api/quizzes` | user | body `{ title, description, tags, questions }`. Creates a draft. Returns `{ id }`. |
| GET | `/api/quizzes/:id` | none | published: card plus `myVote` (0 if signed out), `leaderboard`, and `myBest` as `{ correct, total, durationMs }` or null. Author gets the full quiz too: `questions` with answers, `published`, `version`. Drafts return 404 to anyone but the author. |
| PUT | `/api/quizzes/:id` | author | same body as POST. If published and the `questions` JSON changed, `version` increments. |
| DELETE | `/api/quizzes/:id` | author, or admin if published | cascades tags, votes, attempts |
| POST | `/api/quizzes/:id/publish` | author | sets `published=1`, `published_at=now` if null |
| POST | `/api/quizzes/:id/unpublish` | author or admin | sets `published=0` |
| PUT | `/api/quizzes/:id/vote` | user | body `{ value: 1 | -1 | 0 }`. 0 deletes the row. Returns `{ score, myVote }`. |
| GET | `/api/quizzes/:id/export` | author only | YAML file download. Author only because the file holds the answer key. |
| GET | `/api/quizzes/:id/leaderboard` | none | `[{ username, avatarUrl, correct, total, durationMs, finishedAt }]` top 10 for the current version. Order: `correct DESC, durationMs ASC, finishedAt ASC`. |

Validation on POST and PUT: `title` 1 to 120 chars after trim, `description` up to
1000, `tags` up to 5 after normalizing, `questions` passes `validateQuizData` and has at
least one question. Tag normalization: trim, lowercase, spaces to hyphens, must match
`^[a-z0-9][a-z0-9-]{0,29}$`, duplicates dropped.

### Play

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/quizzes/:id/attempts` | user | creates a row with `started_at=now`. Returns `{ attemptId, version, questions }` with `answer` and `explanation` stripped. |
| POST | `/api/attempts/:id` | user, owner of the attempt | body `{ answers }` keyed by question id. 409 if the quiz version moved. Grades, stores `correct`, `finished_at`, `answers`. Returns `{ correct, total, durationMs, questions }` where `questions` is the full array with answers. |
| POST | `/api/quizzes/:id/grade` | none | body `{ answers }`. Grades and returns the same shape with `durationMs: null`. Stores nothing. |
| GET | `/api/quizzes/:id/play` | none | `{ version, questions }` stripped. Used by anonymous players to start. |

Returning the full `questions` after submit means `ResultsView` renders exactly as it
does in local mode, from questions plus answers, with no new component.

### Users and tags

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/users/:username` | none | `{ username, avatarUrl, createdAt, quizzes: QuizCard[] }` published only |
| GET | `/api/me/quizzes` | user | `{ drafts: QuizCard[], published: QuizCard[] }` |
| GET | `/api/me/attempts` | user | last 50 finished: `[{ id, quiz: { id, title }, correct, total, durationMs, finishedAt }]` |
| GET | `/api/tags?q=` | none | `[{ tag, count }]` prefix match, top 20 by count |

### Rooms

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/rooms` | user | body `{ quizId, mode: "race" | "sync", questionSeconds? }`. Quiz must be published. Host is seated as a player under their username. Returns `{ code }`. |
| GET | `/api/rooms/:code` | none | `{ state, mode, you: { id, isHost } | null }` or 404 |
| POST | `/api/rooms/:code/join` | none | body `{ nickname }`. Only in `lobby`. Sets the player cookie. 400 if the nickname is taken or not 1 to 20 chars. 409 if the room already started or has 50 players. |
| GET | `/api/rooms/:code/events` | player cookie | SSE. 403 if the cookie is not a member of this room. Sends a full snapshot on connect and on every change. A comment line every 25 seconds keeps proxies from closing it. |
| POST | `/api/rooms/:code/start` | host | lobby to countdown (race) or to question 0 (sync) |
| POST | `/api/rooms/:code/answer` | player | body `{ questionId, value }` |
| POST | `/api/rooms/:code/next` | host | sync only, reveal to next question or finished |
| POST | `/api/rooms/:code/end` | host | race only, finishes the room. Unanswered questions count as wrong. |

The player cookie `rp` is 16 random bytes hex, HttpOnly, SameSite=Lax, 1 day. It
identifies a person across rooms. Membership is per room in memory.

## 11. Play and grading

`shared/grade.ts` exports one function used by the server, by local mode, and by rooms:

```ts
grade(questions: Question[], answers: Record<string, number | boolean | undefined>)
  -> { correct: number; total: number; perQuestion: Record<string, boolean> }
```

Online play flow:

1. Quiz page Play button. Signed in: `POST /api/quizzes/:id/attempts`. Anonymous:
   `GET /api/quizzes/:id/play`.
2. `QuizRunner` receives the stripped questions and runs settings, paging, and resume
   exactly as local mode does. Shuffle is client-side. Answers are keyed by question id,
   so order never matters to grading.
3. Finish. Signed in: `POST /api/attempts/:attemptId`. Anonymous:
   `POST /api/quizzes/:id/grade`. Either returns the full questions, which
   `ResultsView` renders as today.
4. A 409 on submit means the author changed the quiz. The client shows "This quiz was
   updated by its author. Start over?" and clears the saved state.

`QuizRunner` props: `{ quizData, onFinish: (answers) => Promise<Question[]>, resumeKey }`.
Local mode passes an `onFinish` that resolves with the same questions. Online mode
passes one that calls the API. That is the only difference between the two pages.

Resume: `SavedQuizState` gains `source: "local" | "online"`, `quizId?`, `attemptId?`,
`version?`. IndexedDB code is unchanged otherwise. Duration keeps counting while an
attempt sits unfinished, so a resumed attempt lands low on the leaderboard. That is
accepted.

Play count and leaderboard count only finished attempts by signed-in users. Anonymous
play is not counted anywhere.

## 12. Votes, tags, leaderboard

- Vote buttons on the quiz page. Clicking the active button again sends `value: 0`.
  Signed-out click shows the sign-in link.
- Catalog tag chips come from `GET /api/tags` with no query, top 20. Clicking one sets
  `?tag=`. Publish form tag input calls `GET /api/tags?q=` after 2 characters.
- Sort `top` is `score DESC, plays DESC, published_at DESC`. `popular` is
  `plays DESC, published_at DESC`. `new` is `published_at DESC`.
- Leaderboard shows only the current version. After an author changes questions it
  starts empty. The quiz page says "Leaderboard reset when the quiz was updated" when
  `version > 1` and the board is empty.

## 13. Editor

`components/Editor.tsx`. Props `{ value: Question[], onChange }`. State is the question
array itself. No form library.

- Each row: type select (`mc` or `tf`), prompt textarea, explanation input.
  For `mc`: an options list with a radio per option marking the correct one, add and
  remove option buttons, minimum 2 options. For `tf`: two radios, True and False.
- Row buttons: move up, move down, delete. Add question button at the bottom.
- Ids are `Q001`, `Q002`, renumbered on every change so reordering keeps them
  sequential. Uploaded ids are preserved until the user edits in the editor.
- Switching from the Upload tab to the Editor tab loads the parsed questions into the
  editor. Switching back shows the YAML produced by `js-yaml` `dump`.
- Publish runs `validateQuizData` on the editor output and shows its message in the
  existing red error box.
- Download YAML button builds the array with the metadata item first and uses
  `dump`, then triggers a download through a Blob URL.

## 14. Rooms

`server/rooms.ts` is a pure state machine with no HTTP. It takes a `now()` function so
tests can inject a clock. `routes/rooms.ts` maps HTTP and SSE onto it.

```ts
type Room = {
  code: string; hostPlayerId: string;
  quiz: { id: number; title: string; questions: Question[] };  // full, server only
  mode: "race" | "sync";
  state: "lobby" | "countdown" | "running" | "question" | "reveal" | "finished";
  players: Map<string, Player>;
  questionSeconds: number;          // sync, default 20, 5 to 120
  currentIndex: number;             // sync
  questionStartedAt: number;        // sync
  countdownEndsAt: number;          // race
  runningSince: number;             // race
  createdAt: number; lastActivity: number;
  listeners: Set<(snapshot) => void>;
};
type Player = {
  id: string; nickname: string; userId?: number;
  answers: Record<string, { value: number | boolean; at: number }>;
  correct: number; points: number;  // points is sync only
  lastCorrectAt?: number;           // sync tie-break
  finishedAt?: number;              // race
};
```

Codes use the alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, 6 characters. Rooms are in
a `Map<string, Room>`. A `setInterval` every 5 minutes deletes rooms whose
`lastActivity` is older than 2 hours.

### Race mode

```
lobby --start--> countdown (3 s) --timer--> running --last player finishes or host end--> finished
```

- `answer` in `running`: record it, grade it with `shared/grade.ts`, update `correct`.
  If the player has answered every question, set `finishedAt`. `durationMs` is
  `finishedAt - runningSince`, so the countdown does not count. The response to that
  final answer is `{ correct, total, durationMs, questions }` with full questions, so
  the player's own `ResultsView` renders. Before that the response is `{ ok: true }`.
- Snapshot per player: `{ id, nickname, answered, finished, durationMs?, correct? }`.
  `correct` appears only once the player is finished.
- A finished player has the answer key and could tell a friend. Accepted. Rooms are for
  friends.
- `end` by host: unanswered questions count as wrong for everyone still playing,
  `finishedAt` is set to now, state becomes `finished`.
- `finished` snapshot carries `ranking`: players sorted by `correct DESC, durationMs ASC`.

### Synchronized mode

```
lobby --start--> question(0) --timeout or all answered--> reveal --next--> question(i+1) ... --next after last--> finished
```

- Entering `question`: set `questionStartedAt`, arm a `setTimeout` for
  `questionSeconds`. The snapshot carries `question: { index, id, prompt, type,
  options?, endsAt }`. No answer, no explanation.
- `answer` in `question`: accepted once per player per question, only for the current
  question id. Points for a correct answer are
  `max(500, round(1000 - 500 * elapsedMs / limitMs))`, elapsed measured on the server.
  Wrong or missing is 0. If every player has answered, clear the timer and reveal now.
- `reveal` snapshot carries `reveal: { questionId, answer, explanation, scoreboard }`
  where scoreboard is players sorted by `points DESC` with `lastPoints` for the question
  just shown.
- `next` by host: next question, or `finished` with `ranking` sorted by
  `points DESC, lastCorrectAt ASC`. A correct answer updates `lastCorrectAt`, so on
  equal points the player who reached that total first is ahead.

### Snapshot

Every change calls every listener with the same object. Never includes `answer` or
`explanation` except inside `reveal`.

```ts
{
  code, mode, state, questionSeconds,
  quiz: { id, title, questionCount },
  host: nickname,
  you: { id, isHost, answered: string[] },   // your own answered question ids
  players: [...],
  countdownEndsAt?, question?, reveal?, ranking?
}
```

The SSE route serializes the snapshot for the requesting player (`you` differs per
listener). The listener set holds one function per open connection. Closing the
response removes it.

### Reconnect

The `rp` cookie identifies the seat. Opening the events route again attaches a new
listener and sends the current snapshot. The client renders from the snapshot alone, so
there is no client-side state to recover. In race mode the client also keeps its own
answers in memory to drive `QuestionPage`; after a refresh it rebuilds them from
`you.answered` and starts at the first unanswered question.

## 15. Frontend

`react-router-dom` with `createBrowserRouter`. `App.tsx` holds the router and the
header. A `useMe()` hook fetches `/api/me` once and caches it in context.

| Route | Page | Data |
|---|---|---|
| `/` | Catalog | `GET /api/quizzes`, `GET /api/tags` |
| `/local` | Local | today's `SetupView` flow, no network |
| `/quiz/:id` | Quiz | `GET /api/quizzes/:id` |
| `/quiz/:id/play` | Play | attempt start, `QuizRunner`, submit |
| `/new`, `/quiz/:id/edit` | Publish | Upload tab, Editor tab, title, description, tags, Save draft, Publish |
| `/u/:username` | Profile | `GET /api/users/:username` |
| `/me` | Me | `GET /api/me/quizzes`, `GET /api/me/attempts` |
| `/rooms/new?quiz=` | RoomNew | mode picker, seconds per question, Create |
| `/r/:code` | Room | `GET /api/rooms/:code`, then nickname form or events stream |

Header: logo linking to `/`, search box that navigates to `/?q=`, "Play a file" link to
`/local`, then either "Sign in with GitHub" (an anchor to `/api/auth/github`) or the
avatar with a menu holding My quizzes, New quiz, Sign out.

The Room page renders by `state`: lobby (big code, player list, Start for host),
countdown (number), race running (`QuestionPage` plus a progress board), sync question
(`QuestionPage` plus a timer bar), sync reveal (correct answer, scoreboard, Next for
host), finished (ranking, "Play again" for host, which creates a new room with the same
quiz and mode).

Styling stays Tailwind with the existing dark palette and rounded cards. No component
library.

## 16. Error handling

- Server: one error middleware turns thrown `HttpError(status, message)` into
  `{ error }`. Anything else logs the stack and returns 500 with a generic message.
  Validation messages from `validateQuizData` pass through verbatim, they are written
  for users.
- Client: `api.ts` throws on non-2xx with the server message. Pages show it in the red
  error box already used by `SetupView`. 401 from a mutating call redirects to
  `/api/auth/github`.
- 404 route renders a one-line page with a link home.
- SSE: on `error` the browser reconnects on its own. The page shows "Reconnecting" until
  the next snapshot arrives. A 404 from `GET /api/rooms/:code` shows "Room not found or
  expired".

## 17. Testing

Server tests run with `node --test server/test/` and no framework. `server/index.ts`
exports `createApp()` so tests start it on port 0 with `DATABASE_PATH=:memory:` and
`SESSION_SECRET=test`. A helper `asUser(db, username)` inserts a user and returns a
signed `Cookie` header, so every route except the two OAuth ones is covered without
GitHub.

| File | Covers |
|---|---|
| `validate.test.ts` | metadata required, new optional fields, each error branch |
| `grade.test.ts` | mc, tf, missing answers, per-question map |
| `quizzes.test.ts` | draft creation, publish, list sort, get strips answers for non-authors, PUT bumps version only when questions change, delete by admin, 403 by stranger, tag normalization, vote toggling |
| `play.test.ts` | start, submit, 409 on version change, anonymous grade stores nothing, leaderboard order and best-per-user |
| `rooms.test.ts` | drives `server/rooms.ts` directly with an injected clock: race countdown, finish order, host end; sync timeout, all-answered early reveal, points formula, final ranking; join rules |

Frontend has TypeScript and the manual checklist below. No component tests.

Manual checklist, run before each phase is called done:

1. Sign in with GitHub, header shows avatar, sign out clears it.
2. Upload the sample YAML, publish, it appears in the catalog under New.
3. Play it signed out, results show. Play it signed in, refresh mid-quiz, resume works.
4. Edit the published quiz, change an answer, old attempt submit gets the 409 message.
5. Vote up, vote up again to clear, vote down. Score on the card matches.
6. Add a tag, filter by it from the catalog chip.
7. Two accounts play, leaderboard orders by correct then time.
8. Editor: build a 3-question quiz, download YAML, upload it back, identical.
9. Room race with two browsers, one private. Progress board moves. Refresh one, seat
   kept. Host end works.
10. Room sync, timer expires with no answers, reveal shows, points match the formula.

## 18. Deploy and config

Environment variables:

| Name | Purpose |
|---|---|
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | OAuth app. Callback URL is `BASE_URL/api/auth/github/callback`. |
| `SESSION_SECRET` | 32+ random bytes, base64. Rotating it signs everyone out. |
| `ADMIN_USERS` | comma-separated GitHub usernames |
| `DATABASE_PATH` | path to the SQLite file, default `./data/questionary.db` |
| `BASE_URL` | public origin, `https://quiz.example.com` |
| `PORT` | default 3000 |
| `NODE_ENV` | `production` on the server |

Development: copy `.env.example` to `.env`, register a GitHub OAuth app with callback
`http://localhost:3000/api/auth/github/callback`, run `npm run dev`.

Production: `npm ci && npm run build`, a systemd unit running `node server/index.ts`
with `EnvironmentFile=`, Caddy with
`quiz.example.com { reverse_proxy localhost:3000 }`. Backup is a nightly
`sqlite3 questionary.db ".backup out.db"`, which is safe under WAL while the server runs.

## 19. Deliberate simplifications

Each of these is a real corner cut with a known ceiling. Each gets a `ponytail:`
comment at the spot in code.

| Shortcut | Ceiling | Upgrade |
|---|---|---|
| `node:sqlite` is marked experimental on Node 22 | API could change on a Node upgrade | `db.ts` is the only file that touches it; swap to better-sqlite3 there |
| Stateless HMAC session cookie | No logout-everywhere, no revocation before expiry | sessions table keyed by a random id |
| Rooms in memory, single process | Restart drops live rooms, no horizontal scaling | rooms table plus polling, or Redis pub/sub |
| `LIKE '%q%'` search | Full scan, no ranking | FTS5 virtual table on title and description |
| Score and plays computed by subselect | Slower listing at tens of thousands of quizzes | counter columns updated by triggers |
| No rate limiting | Abuse can hammer publish or grade | `limit_req` in nginx or Caddy |
| Finished race players hold the answer key | Friends can share answers | withhold results until the room finishes |
| No host transfer in rooms | Host leaving strands a sync room at reveal | auto-advance timer on reveal |

## 20. Out of scope for the first implementation plan

Phases 2, 3, and 4 each get their own plan after phase 1 ships. Nothing in phase 1
should be built with hooks for later phases beyond the schema, which is complete from
day one because it is one file and changing it later costs a migration.
