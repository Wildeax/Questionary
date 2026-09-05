# Phase 1: Publish and Play Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Node server with GitHub sign-in so people can publish quizzes by upload, browse a catalog, and play quizzes online with server-side grading, while the existing offline mode keeps working at `/local`.

**Architecture:** One Node 22 process runs Express 5 with the built-in `node:sqlite`. In dev it mounts Vite in middleware mode; in prod it serves `dist/`. Validation and grading live in `shared/` and run identically in the browser and on the server. The React app gains react-router 7 and a `QuizRunner` component extracted from today's `App.tsx`.

**Tech Stack:** Node 22 (type stripping, `node:sqlite`, `node:test`), Express 5, react-router 7, React 18, Vite 4, Tailwind 3, js-yaml, TypeScript 5.9.

**Spec:** `docs/superpowers/specs/2026-09-04-community-quizzes-design.md` (sections 5 to 11, 15 to 18 apply to this phase).

## Global Constraints

- Node runs `.ts` directly. Inside `server/` and `shared/`, every relative import uses an explicit `.ts` extension, and every type-only import uses `import type` or `import { type X }`. No enums, no namespaces, no constructor parameter properties (`erasableSyntaxOnly` enforces this).
- `package.json` has `"type": "module"`. Config files that use `module.exports` are `.cjs`.
- New runtime dependencies are exactly `express@5` and `react-router@7`. New dev dependencies are exactly `@types/express@5` and `@types/node@22`. Nothing else.
- Import Express as `import express from "express"` and use `express.Router()`, never a named `Router` import (CJS named-export detection is not guaranteed).
- Import js-yaml as `import { load, dump } from "js-yaml"`.
- All timestamps are Unix milliseconds as integers.
- API errors are `{ "error": "message" }`. Validation messages from `shared/validate.ts` pass through verbatim.
- Server tests use `node:test` and `fetch` against the app on port 0 with `DATABASE_PATH` `:memory:` and `SESSION_SECRET` `test`. No test framework.
- Every deliberate shortcut from spec section 19 gets a `// ponytail:` comment at the spot naming the ceiling and the upgrade.
- Commit messages: imperative subject line like the existing history ("Add quiz name and author title..."), no conventional-commit prefix. End every commit message with:
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01MH44PLVsdJ842ZraNvQHtF
  ```
- Work happens on the `community` branch, created from `master` in Task 1.
- Prose in code comments and docs follows the unslop rules: no em dashes, sentence case, say what the code does.

---

## File structure

```
package.json                 type: module, new scripts, new deps
postcss.config.cjs           renamed from .js
tailwind.config.cjs          renamed from .js
tsconfig.json                include src + shared, verbatimModuleSyntax, erasableSyntaxOnly
tsconfig.server.json         new: nodenext, includes server + shared
.env.example                 new
.gitignore                   add *.db, *.db-wal, *.db-shm
index.html                   title Questionary
README.md                    dev setup with OAuth app

shared/types.ts              moved from src/types.ts, plus PlayQuestion, Answers, QuizCard, Me
shared/validate.ts           parseQuestionsFromText, validateQuizData, normalizeTags, validateQuizInput
shared/questions.ts          isMC, isTF, formatCorrectAnswer, formatUserAnswer
shared/grade.ts              grade, stripAnswers

server/index.ts              entry: env, db, app, Vite or static, listen
server/app.ts                createApp(db, config): API routes + error handler
server/db.ts                 openDb(path), tx(db, fn)
server/schema.sql            five tables
server/http.ts               HttpError, errorHandler, jsonOnly, idParam
server/auth.ts               cookies, session sign/verify, attachUser, requireUser, requireMe
server/cards.ts              CARD_SELECT, Row, toCard, getQuizRow, replaceTags
server/routes/auth.ts        /auth/github, /auth/github/callback, /auth/logout, /me
server/routes/quizzes.ts     list, create, get, update, delete, publish, unpublish, export
server/routes/play.ts        /quizzes/:id/play, /quizzes/:id/attempts, /attempts/:id, /quizzes/:id/grade
server/routes/users.ts       /users/:username, /me/quizzes
server/test/helpers.ts       startServer, asUser, api
server/test/*.test.ts        validate, grade, db, auth, quizzes, play, users

src/index.tsx                RouterProvider
src/router.tsx               routes
src/api.ts                   fetch wrappers
src/me.tsx                   MeProvider, useMe
src/storage.ts               IndexedDB: save, getSavedQuiz, loadLatestLocalQuiz, clearQuizProgress
src/export.ts                results export (filename change only)
src/components/Layout.tsx    header + Outlet
src/components/ErrorBox.tsx
src/components/QuizCardView.tsx
src/components/SavedQuizCard.tsx   extracted from SetupView
src/components/QuizRunner.tsx      extracted from App.tsx
src/components/SetupView.tsx       uses SavedQuizCard
src/components/SettingsView.tsx    accepts PlayQuizData
src/components/QuestionPage.tsx    accepts PlayQuestion, submitting prop
src/components/ResultsView.tsx     uses grade(), onExit prop
src/pages/Catalog.tsx
src/pages/Quiz.tsx
src/pages/Play.tsx
src/pages/Publish.tsx
src/pages/Profile.tsx
src/pages/Me.tsx
src/pages/Local.tsx
src/pages/NotFound.tsx
src/App.tsx                  deleted (router replaces it)
src/types.ts                 deleted (moved to shared)
src/utils.ts                 deleted (split into shared)
```

---

### Task 1: Toolchain switch and shared validation

**Files:**
- Create: `shared/types.ts`, `shared/validate.ts`, `shared/questions.ts`, `tsconfig.server.json`, `server/test/validate.test.ts`
- Modify: `package.json`, `tsconfig.json`, `.gitignore`, `index.html`
- Rename: `postcss.config.js` to `postcss.config.cjs`, `tailwind.config.js` to `tailwind.config.cjs`
- Delete: `src/types.ts`, `src/utils.ts`
- Modify imports in: `src/App.tsx`, `src/export.ts`, `src/storage.ts`, `src/components/*.tsx`

**Interfaces:**
- Produces: `shared/types.ts` exports `QuizMetadata`, `Question`, `MCQuestion`, `TFQuestion`, `PlayQuestion`, `Answers`, `QuizData`, `PlayQuizData`, `QuizSettings`, `SavedQuizState`, `QuizCard`, `Me`.
- Produces: `shared/validate.ts` exports `parseQuestionsFromText(text): QuizData`, `validateQuizData(raw: unknown[]): QuizData`, `normalizeTags(raw: unknown): string[]`, `validateQuizInput(body: unknown): QuizInput`, type `QuizInput = { title: string; description: string; tags: string[]; questions: Question[] }`.
- Produces: `shared/questions.ts` exports `isMC`, `isTF`, `formatCorrectAnswer`, `formatUserAnswer`.

- [ ] **Step 1: Create the branch**

```bash
git checkout -b community
```

- [ ] **Step 2: Install dependencies and switch to ESM**

```bash
npm install express@5 react-router@7
npm install -D @types/express@5 @types/node@22
git mv postcss.config.js postcss.config.cjs
git mv tailwind.config.js tailwind.config.cjs
```

Edit `package.json` so the top and scripts read:

```json
{
  "name": "questionary",
  "version": "1.0.0",
  "description": "Community quizzes: publish, play, compete",
  "type": "module",
  "scripts": {
    "dev": "node --watch-path=server --watch-path=shared server/index.ts",
    "build": "tsc -p tsconfig.json && tsc -p tsconfig.server.json && vite build",
    "start": "node server/index.ts",
    "test": "node --test \"server/test/*.test.ts\"",
    "lint": "eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0",
    "preview": "vite preview"
  },
```

Leave `dependencies` and `devDependencies` as npm wrote them. Remove the `"main": "index.js"` line.

- [ ] **Step 3: Update tsconfigs**

Replace `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "erasableSyntaxOnly": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src", "shared"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

Create `tsconfig.server.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "types": ["node"],
    "skipLibCheck": true,
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "erasableSyntaxOnly": true,
    "noEmit": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["server", "shared"]
}
```

Append to `.gitignore`:

```
# SQLite
*.db
*.db-wal
*.db-shm
data/
```

In `index.html` change `<title>Unity Senior Certified Quiz</title>` to `<title>Questionary</title>`.

- [ ] **Step 4: Write the failing validation test**

Create `server/test/validate.test.ts`:

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeTags, parseQuestionsFromText, validateQuizInput } from "../../shared/validate.ts";

const yamlDoc = `
- metadata:
    name: "Sample"
    author: "Someone"
    description: "Two questions"
    tags: ["Unity ", "C Sharp", "unity"]
- id: Q1
  type: mc
  prompt: "Pick B"
  options: ["A", "B"]
  answer: 1
- id: Q2
  type: tf
  prompt: "Sky is blue"
  answer: true
`;

describe("parseQuestionsFromText", () => {
  it("parses metadata with the new optional fields", () => {
    const data = parseQuestionsFromText(yamlDoc);
    assert.equal(data.metadata.name, "Sample");
    assert.equal(data.metadata.description, "Two questions");
    assert.deepEqual(data.metadata.tags, ["unity", "c-sharp"]);
    assert.equal(data.questions.length, 2);
  });

  it("rejects a document without metadata", () => {
    assert.throws(() => parseQuestionsFromText(`- id: Q1\n  type: tf\n  prompt: x\n  answer: true`), /metadata/);
  });

  it("rejects an out-of-range mc answer", () => {
    assert.throws(
      () => parseQuestionsFromText(`- metadata:\n    name: x\n- id: Q1\n  type: mc\n  prompt: p\n  options: [a, b]\n  answer: 2`),
      /out of range/
    );
  });
});

describe("normalizeTags", () => {
  it("lowercases, hyphenates, dedupes", () => {
    assert.deepEqual(normalizeTags(["Unity ", "C Sharp", "unity"]), ["unity", "c-sharp"]);
  });
  it("rejects more than five", () => {
    assert.throws(() => normalizeTags(["a", "b", "c", "d", "e", "f"]), /at most 5/);
  });
  it("rejects bad characters", () => {
    assert.throws(() => normalizeTags(["c++"]), /Invalid tag/);
  });
  it("returns [] for non-arrays", () => {
    assert.deepEqual(normalizeTags(undefined), []);
  });
});

describe("validateQuizInput", () => {
  const questions = [{ id: "Q1", type: "tf", prompt: "p", answer: true }];
  it("accepts a valid body and trims", () => {
    const out = validateQuizInput({ title: "  T ", description: " d ", tags: ["X"], questions });
    assert.equal(out.title, "T");
    assert.equal(out.description, "d");
    assert.deepEqual(out.tags, ["x"]);
    assert.equal(out.questions.length, 1);
  });
  it("rejects an empty title", () => {
    assert.throws(() => validateQuizInput({ title: " ", questions }), /Title must be/);
  });
  it("rejects a long description", () => {
    assert.throws(() => validateQuizInput({ title: "t", description: "x".repeat(1001), questions }), /Description/);
  });
  it("rejects missing questions", () => {
    assert.throws(() => validateQuizInput({ title: "t" }), /questions must be an array/);
  });
  it("rejects zero questions", () => {
    assert.throws(() => validateQuizInput({ title: "t", questions: [] }), /No valid questions/);
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL, cannot find module `shared/validate.ts`.

- [ ] **Step 6: Create shared/types.ts**

```ts
export type QuizMetadata = {
  name: string;
  author?: string;
  description?: string;
  tags?: string[];
};

export type BaseQuestion = {
  id: string;
  prompt: string;
  explanation?: string;
};

export type MCQuestion = BaseQuestion & {
  type: "mc";
  options: string[];
  answer: number; // index in options
};

export type TFQuestion = BaseQuestion & {
  type: "tf";
  answer: boolean;
};

export type Question = MCQuestion | TFQuestion;

/** A question as sent to a player: no answer, no explanation. */
export type PlayQuestion =
  | Omit<MCQuestion, "answer" | "explanation">
  | Omit<TFQuestion, "answer" | "explanation">;

export type Answers = Record<string, number | boolean | undefined>;

export type QuizData = {
  metadata: QuizMetadata;
  questions: Question[];
};

export type PlayQuizData = {
  metadata: QuizMetadata;
  questions: PlayQuestion[];
};

export type QuizSettings = {
  randomOrder: boolean;
};

export type SavedQuizState = {
  id: string;
  source: "local" | "online";
  quizId?: number;
  attemptId?: number;
  version?: number;
  quizData: PlayQuizData;
  settings: QuizSettings;
  answers: Answers;
  currentIndex: number;
  timestamp: number;
  completed: boolean;
  questionOrder: string[];
  currentQuestionId: string | null;
};

export type QuizCard = {
  id: number;
  title: string;
  description: string;
  author: { username: string; avatarUrl: string };
  tags: string[];
  questionCount: number;
  score: number;
  plays: number;
  publishedAt: number | null;
};

export type Me = {
  id: number;
  username: string;
  avatarUrl: string;
  isAdmin: boolean;
};
```

- [ ] **Step 7: Create shared/questions.ts**

```ts
import type { PlayQuestion, Question } from "./types.ts";

export function isMC<T extends PlayQuestion>(q: T): q is Extract<T, { type: "mc" }> {
  return q.type === "mc";
}

export function isTF<T extends PlayQuestion>(q: T): q is Extract<T, { type: "tf" }> {
  return q.type === "tf";
}

export function formatCorrectAnswer(q: Question): string {
  if (isMC(q)) return q.options[q.answer];
  return q.answer ? "True" : "False";
}

export function formatUserAnswer(q: PlayQuestion, value: number | boolean | undefined): string {
  if (value === undefined) return "—";
  if (isMC(q)) {
    if (typeof value !== "number") return "—";
    return q.options[value] ?? "—";
  }
  return value ? "True" : "False";
}
```

- [ ] **Step 8: Create shared/validate.ts**

Move the body of `parseQuestionsFromText` and `validateQuizData` from `src/utils.ts` and extend the metadata block. Full file:

```ts
import { load } from "js-yaml";
import type { MCQuestion, Question, QuizData, QuizMetadata, TFQuestion } from "./types.ts";

export const TAG_RE = /^[a-z0-9][a-z0-9-]{0,29}$/;
export const MAX_TAGS = 5;

export function normalizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    const tag = String(item).trim().toLowerCase().replace(/\s+/g, "-");
    if (!tag) continue;
    if (!TAG_RE.test(tag)) {
      throw new Error(`Invalid tag "${String(item)}". Use letters, numbers, and hyphens, up to 30 characters.`);
    }
    if (!out.includes(tag)) out.push(tag);
  }
  if (out.length > MAX_TAGS) throw new Error(`A quiz can have at most ${MAX_TAGS} tags.`);
  return out;
}

export function parseQuestionsFromText(text: string): QuizData {
  if (!text || text.trim().length === 0) {
    throw new Error("File is empty. Please provide a valid JSON or YAML file with quiz questions.");
  }

  let jsonError: Error;
  try {
    const json = JSON.parse(text);
    const arr = Array.isArray(json) ? json : [json];
    return validateQuizData(arr);
  } catch (e) {
    if (e instanceof SyntaxError) {
      jsonError = e;
    } else {
      throw e;
    }
  }

  try {
    const doc = load(text);
    const arr = Array.isArray(doc) ? doc : [doc];
    return validateQuizData(arr as unknown[]);
  } catch (e) {
    const yamlError = e as Error;
    if (yamlError.name !== "YAMLException") {
      // Validation error from validateQuizData, not a parse error. js-yaml names its errors YAMLException.
      throw yamlError;
    }
    let errorMessage = "Failed to parse file. ";
    if (jsonError.message.includes("Unexpected token")) {
      errorMessage += "The file appears to be YAML but has JSON-like syntax errors. ";
    } else if (jsonError.message.includes("Expected property name")) {
      errorMessage += "Invalid JSON format. Check for missing quotes or commas. ";
    }
    if (yamlError.message.includes("bad indentation")) {
      errorMessage += "YAML indentation error. Make sure all items at the same level have consistent indentation. ";
    } else if (yamlError.message.includes("duplicated mapping key")) {
      errorMessage += "YAML error: duplicate keys found. ";
    }
    errorMessage += "\n\nExpected format:\n";
    errorMessage += "YAML: Start with '- metadata:' followed by questions starting with '- id:'\n";
    errorMessage += "JSON: Array of objects starting with metadata object";
    throw new Error(errorMessage);
  }
}

export function validateQuizData(raw: unknown[]): QuizData {
  const errors: string[] = [];

  if (!Array.isArray(raw)) {
    throw new Error("Invalid format: File must be an array of objects.\n\nFor YAML: Use '-' to start each item.\nFor JSON: Use square brackets [].");
  }

  if (raw.length === 0) {
    throw new Error("File is empty. Add at least metadata and one question.\n\nExample:\n- metadata:\n    name: \"My Quiz\"\n- id: Q1\n  type: mc\n  prompt: \"Question?\"");
  }

  const metadataItem = raw[0] as { metadata?: Record<string, unknown> } | null;
  if (!metadataItem || typeof metadataItem !== "object") {
    errors.push("First item must be a metadata object, not " + (metadataItem === null ? "null" : typeof metadataItem));
    errors.push("\nCorrect format:");
    errors.push("YAML: - metadata:\n        name: \"Quiz Title\"");
    errors.push("JSON: {\"metadata\": {\"name\": \"Quiz Title\"}}");
  } else if (!metadataItem.metadata || typeof metadataItem.metadata !== "object") {
    errors.push("First item must contain a 'metadata' object.");
    errors.push("Found keys: " + Object.keys(metadataItem).join(", "));
    errors.push("\nCorrect format:");
    errors.push("YAML: - metadata:\n        name: \"Quiz Title\"");
    errors.push("JSON: [{\"metadata\": {\"name\": \"Quiz Title\"}}]");
  } else if (!metadataItem.metadata.name || typeof metadataItem.metadata.name !== "string") {
    errors.push("Metadata must have a required 'name' field (string).");
    errors.push("Current metadata: " + JSON.stringify(metadataItem.metadata, null, 2));
    errors.push("\nExample: name: \"My Quiz Title\"");
  }

  if (errors.length) {
    throw new Error("Metadata validation failed:\n" + errors.join("\n"));
  }

  const md = (metadataItem as { metadata: Record<string, unknown> }).metadata;
  const metadata: QuizMetadata = {
    name: String(md.name).trim(),
    author: md.author ? String(md.author) : undefined,
    description: md.description ? String(md.description) : undefined,
    tags: Array.isArray(md.tags) ? normalizeTags(md.tags) : undefined,
  };

  const questions: Question[] = [];
  for (let i = 1; i < raw.length; i++) {
    const q = raw[i] as Record<string, unknown> | null;
    const questionNum = i;

    if (!q || typeof q !== "object") {
      errors.push(`Question ${questionNum}: Must be an object, got ${q === null ? "null" : typeof q}`);
      continue;
    }

    const missingFields: string[] = [];
    if (!q.id) missingFields.push("id");
    if (!q.type) missingFields.push("type");
    if (!q.prompt) missingFields.push("prompt");
    if (missingFields.length > 0) {
      errors.push(`Question ${questionNum}: Missing required fields: ${missingFields.join(", ")}`);
      errors.push(`   Found keys: ${Object.keys(q).join(", ")}`);
      continue;
    }

    if (q.type === "mc") {
      if (!Array.isArray(q.options)) {
        errors.push(`MC Question ${questionNum}: 'options' must be an array`);
        errors.push(`   Example: options: ["A", "B", "C", "D"]`);
        continue;
      }
      if (q.options.length < 2) {
        errors.push(`MC Question ${questionNum}: Must have at least 2 options, got ${q.options.length}`);
        continue;
      }
      if (typeof q.answer !== "number") {
        errors.push(`MC Question ${questionNum}: 'answer' must be a number (index), got ${typeof q.answer}`);
        errors.push(`   Example: answer: 0  (for first option)`);
        continue;
      }
      if (q.answer < 0 || q.answer >= q.options.length) {
        errors.push(`MC Question ${questionNum}: Answer index ${q.answer} is out of range. Valid range: 0-${q.options.length - 1}`);
        continue;
      }
      const mc: MCQuestion = {
        id: String(q.id),
        type: "mc",
        prompt: String(q.prompt),
        options: q.options.map(String),
        answer: Number(q.answer),
        explanation: q.explanation ? String(q.explanation) : undefined,
      };
      questions.push(mc);
    } else if (q.type === "tf") {
      if (typeof q.answer !== "boolean") {
        errors.push(`TF Question ${questionNum}: 'answer' must be true or false, got ${String(q.answer)} (${typeof q.answer})`);
        errors.push(`   Example: answer: true`);
        continue;
      }
      const tf: TFQuestion = {
        id: String(q.id),
        type: "tf",
        prompt: String(q.prompt),
        answer: Boolean(q.answer),
        explanation: q.explanation ? String(q.explanation) : undefined,
      };
      questions.push(tf);
    } else {
      errors.push(`Question ${questionNum}: Unknown question type '${String(q.type)}'. Use 'mc' (multiple choice) or 'tf' (true/false)`);
      continue;
    }
  }

  if (errors.length) {
    throw new Error(`Question validation failed (${errors.length} errors):\n` + errors.join("\n\n"));
  }

  if (questions.length === 0) {
    throw new Error("No valid questions found after metadata.\n\nAdd questions like:\n- id: Q1\n  type: mc\n  prompt: \"Question?\"\n  options: [\"A\", \"B\"]\n  answer: 0");
  }

  return { metadata, questions };
}

export type QuizInput = {
  title: string;
  description: string;
  tags: string[];
  questions: Question[];
};

/** Validates a publish body from the browser. Throws an Error with a user-facing message. */
export function validateQuizInput(body: unknown): QuizInput {
  if (!body || typeof body !== "object") throw new Error("Request body must be an object.");
  const b = body as Record<string, unknown>;
  const title = typeof b.title === "string" ? b.title.trim() : "";
  if (title.length < 1 || title.length > 120) throw new Error("Title must be 1 to 120 characters.");
  const description = typeof b.description === "string" ? b.description.trim() : "";
  if (description.length > 1000) throw new Error("Description must be at most 1000 characters.");
  const tags = normalizeTags(b.tags ?? []);
  if (!Array.isArray(b.questions)) throw new Error("questions must be an array.");
  const { questions } = validateQuizData([{ metadata: { name: title } }, ...b.questions]);
  return { title, description, tags, questions };
}
```

Note the JSON-first parse: the old code caught every error from the JSON branch and fell through to YAML, which turned validation errors from valid JSON into a confusing parse message. Now only a `SyntaxError` from `JSON.parse` falls through, and only a `YAMLException` from js-yaml produces the combined parse message. Validation errors keep their own text, which several tests match on.

- [ ] **Step 9: Delete the old files and fix imports**

```bash
git rm src/types.ts src/utils.ts
```

Then update every import:

- `src/App.tsx`: `import type { Question, QuizData, QuizSettings, SavedQuizState } from "../shared/types.ts";` and `import { parseQuestionsFromText } from "../shared/validate.ts";`
- `src/export.ts`: `import type { Question } from "../shared/types.ts";` and `import { isMC, formatCorrectAnswer, formatUserAnswer } from "../shared/questions.ts";`
- `src/storage.ts`: `import type { SavedQuizState } from "../shared/types.ts";`
- `src/components/QuestionPage.tsx`: `import type { Question, QuizMetadata } from "../../shared/types.ts";` and `import { isMC } from "../../shared/questions.ts";`
- `src/components/ResultsView.tsx`: `import type { Question } from "../../shared/types.ts";` and `import { isMC, formatCorrectAnswer, formatUserAnswer } from "../../shared/questions.ts";`
- `src/components/SettingsView.tsx`: `import type { QuizData } from "../../shared/types.ts";`
- `src/components/SetupView.tsx`: `import type { SavedQuizState } from "../../shared/types.ts";`

`SavedQuizState` gained required `source`, `questionOrder`, `currentQuestionId` and lost `orderedQuestions`. In `src/App.tsx` `buildSavedQuizState`, add `source: "local"`, keep `questionOrder` and `currentQuestionId`, and delete the `orderedQuestions` line. In `handleResumeQuiz`, delete the two `orderedQuestions` fallbacks (the branches that read `savedQuizData.orderedQuestions`). This file is rewritten in Task 9, so keep the edit to what compiles.

- [ ] **Step 10: Run tests and build**

Run: `npm test`
Expected: PASS, 12 tests.

Run: `npm run build`
Expected: both `tsc` passes and `vite build` writes `dist/`. The server tsconfig already has inputs because `server/test/validate.test.ts` exists.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "Move quiz types and validation into shared/ and switch the package to ESM

Adds description and tags to quiz metadata, a validateQuizInput for publish
bodies, and Node-compatible tsconfigs so server/ and shared/ run without a
build step.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MH44PLVsdJ842ZraNvQHtF"
```

---

### Task 2: Grading

**Files:**
- Create: `shared/grade.ts`, `server/test/grade.test.ts`

**Interfaces:**
- Produces: `grade(questions: Question[], answers: Answers): { correct: number; total: number; perQuestion: Record<string, boolean> }` and `stripAnswers(questions: Question[]): PlayQuestion[]`.

- [ ] **Step 1: Write the failing test**

Create `server/test/grade.test.ts`:

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { grade, stripAnswers } from "../../shared/grade.ts";
import type { Question } from "../../shared/types.ts";

const questions: Question[] = [
  { id: "a", type: "mc", prompt: "p", options: ["x", "y"], answer: 1, explanation: "because" },
  { id: "b", type: "tf", prompt: "p", answer: false },
  { id: "c", type: "tf", prompt: "p", answer: true },
];

describe("grade", () => {
  it("counts correct answers and reports per question", () => {
    const r = grade(questions, { a: 1, b: true });
    assert.equal(r.correct, 1);
    assert.equal(r.total, 3);
    assert.deepEqual(r.perQuestion, { a: true, b: false, c: false });
  });
  it("treats wrong types as wrong", () => {
    const r = grade(questions, { a: true, b: 0 });
    assert.equal(r.correct, 0);
  });
});

describe("stripAnswers", () => {
  it("removes answer and explanation, keeps options", () => {
    const stripped = stripAnswers(questions);
    assert.deepEqual(stripped[0], { id: "a", type: "mc", prompt: "p", options: ["x", "y"] });
    assert.deepEqual(stripped[1], { id: "b", type: "tf", prompt: "p" });
    assert.ok(!("answer" in stripped[2]));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL, cannot find module `shared/grade.ts`.

- [ ] **Step 3: Create shared/grade.ts**

```ts
import type { Answers, PlayQuestion, Question } from "./types.ts";

export type GradeResult = {
  correct: number;
  total: number;
  perQuestion: Record<string, boolean>;
};

export function grade(questions: Question[], answers: Answers): GradeResult {
  const perQuestion: Record<string, boolean> = {};
  let correct = 0;
  for (const q of questions) {
    const a = answers[q.id];
    const ok = q.type === "mc" ? typeof a === "number" && a === q.answer : typeof a === "boolean" && a === q.answer;
    perQuestion[q.id] = ok;
    if (ok) correct++;
  }
  return { correct, total: questions.length, perQuestion };
}

export function stripAnswers(questions: Question[]): PlayQuestion[] {
  return questions.map((q) =>
    q.type === "mc"
      ? { id: q.id, type: "mc", prompt: q.prompt, options: q.options }
      : { id: q.id, type: "tf", prompt: q.prompt }
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/grade.ts server/test/grade.test.ts
git commit -m "Add shared grading and answer stripping

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MH44PLVsdJ842ZraNvQHtF"
```

---

### Task 3: Database

**Files:**
- Create: `server/db.ts`, `server/schema.sql`, `server/test/db.test.ts`

**Interfaces:**
- Produces: `openDb(path: string): Db` where `Db` is `DatabaseSync` from `node:sqlite`; `tx<T>(db: Db, fn: () => T): T`.

- [ ] **Step 1: Write the failing test**

Create `server/test/db.test.ts`:

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { openDb, tx } from "../db.ts";

describe("openDb", () => {
  it("creates the five tables", () => {
    const db = openDb(":memory:");
    const names = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((r) => r.name as string);
    assert.deepEqual(names, ["attempts", "quiz_tags", "quizzes", "users", "votes"]);
  });

  it("enforces foreign keys", () => {
    const db = openDb(":memory:");
    assert.throws(() =>
      db.prepare("INSERT INTO quizzes (author_id, title, questions, created_at, updated_at) VALUES (999, 't', '[]', 0, 0)").run()
    );
  });

  it("rolls back a failed transaction", () => {
    const db = openDb(":memory:");
    assert.throws(() =>
      tx(db, () => {
        db.prepare("INSERT INTO users (github_id, username, avatar_url, created_at) VALUES (1, 'a', '', 0)").run();
        throw new Error("boom");
      })
    );
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM users").get()!.n, 0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL, cannot find module `server/db.ts`.

- [ ] **Step 3: Create server/schema.sql**

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
  questions     TEXT    NOT NULL,
  version       INTEGER NOT NULL DEFAULT 1,
  published     INTEGER NOT NULL DEFAULT 0,
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
  correct       INTEGER,
  total         INTEGER NOT NULL,
  started_at    INTEGER NOT NULL,
  finished_at   INTEGER,
  answers       TEXT
);
CREATE INDEX IF NOT EXISTS attempts_board ON attempts(quiz_id, quiz_version, correct, finished_at);
CREATE INDEX IF NOT EXISTS attempts_user  ON attempts(user_id, finished_at);
```

- [ ] **Step 4: Create server/db.ts**

```ts
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

// ponytail: node:sqlite is marked experimental on Node 22. This file is the only one
// that touches the driver, so swapping to better-sqlite3 is a one-file change.
export type Db = DatabaseSync;

export function openDb(path: string): Db {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(readFileSync(new URL("./schema.sql", import.meta.url), "utf8"));
  return db;
}

export function tx<T>(db: Db, fn: () => T): T {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test`
Expected: PASS. An `ExperimentalWarning: SQLite` line on stderr is expected.

If `tsc -p tsconfig.server.json` cannot find types for `node:sqlite`, check `node_modules/@types/node/sqlite.d.ts` exists. It ships with `@types/node` 22.5 and later.

- [ ] **Step 6: Commit**

```bash
git add server/db.ts server/schema.sql server/test/db.test.ts
git commit -m "Add SQLite schema and database helper

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MH44PLVsdJ842ZraNvQHtF"
```

---

### Task 4: App skeleton, sessions, and GitHub auth routes

**Files:**
- Create: `server/http.ts`, `server/auth.ts`, `server/routes/auth.ts`, `server/app.ts`, `server/test/helpers.ts`, `server/test/auth.test.ts`

**Interfaces:**
- Consumes: `openDb`, `Db` from Task 3.
- Produces: `createApp(db: Db, config: Config): express.Express`; `Config` type; `HttpError`; `idParam`; `getUser(res): Me | null`; `requireUser` middleware; `requireMe(res): Me`; test helpers `startServer()`, `asUser(db, username)`, `api(base, method, path, body?, cookie?)`.

- [ ] **Step 1: Write the failing test**

Create `server/test/helpers.ts`:

```ts
import type { AddressInfo } from "node:net";
import { createApp } from "../app.ts";
import { openDb, type Db } from "../db.ts";
import { SESSION_COOKIE, signSession, type Config } from "../auth.ts";

export const testConfig: Config = {
  sessionSecret: "test",
  githubClientId: "id",
  githubClientSecret: "secret",
  baseUrl: "http://localhost",
  adminUsers: ["admin"],
  production: false,
};

export type TestServer = { db: Db; base: string; close: () => Promise<void> };

export async function startServer(): Promise<TestServer> {
  const db = openDb(":memory:");
  const app = createApp(db, testConfig);
  const server = await new Promise<import("node:http").Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const { port } = server.address() as AddressInfo;
  return {
    db,
    base: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

let nextGithubId = 1000;

export function asUser(db: Db, username: string): { id: number; cookie: string } {
  const row = db
    .prepare("INSERT INTO users (github_id, username, avatar_url, created_at) VALUES (?, ?, ?, ?) RETURNING id")
    .get(nextGithubId++, username, `https://avatars.example/${username}`, Date.now()) as { id: number };
  return { id: row.id, cookie: `${SESSION_COOKIE}=${signSession(row.id, testConfig.sessionSecret)}` };
}

export async function api(
  base: string,
  method: string,
  path: string,
  body?: unknown,
  cookie?: string
): Promise<{ status: number; json: any; headers: Headers }> {
  const res = await fetch(base + path, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
  const text = await res.text();
  let json: any = text;
  try {
    json = JSON.parse(text);
  } catch {
    // not JSON, keep the text
  }
  return { status: res.status, json, headers: res.headers };
}

export const sampleQuestions = [
  { id: "Q1", type: "mc", prompt: "Pick B", options: ["A", "B", "C"], answer: 1, explanation: "B it is" },
  { id: "Q2", type: "tf", prompt: "Water is wet", answer: true },
];
```

Create `server/test/auth.test.ts`:

```ts
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { signSession, verifySession } from "../auth.ts";
import { api, asUser, startServer, type TestServer } from "./helpers.ts";

describe("session tokens", () => {
  it("round-trips a user id", () => {
    const token = signSession(42, "s");
    assert.equal(verifySession(token, "s"), 42);
  });
  it("rejects a tampered signature", () => {
    const token = signSession(42, "s");
    assert.equal(verifySession(token.slice(0, -1) + "x", "s"), null);
  });
  it("rejects a different secret", () => {
    assert.equal(verifySession(signSession(42, "s"), "other"), null);
  });
  it("rejects an expired token", () => {
    const token = signSession(42, "s", Date.now() - 31 * 24 * 60 * 60 * 1000);
    assert.equal(verifySession(token, "s"), null);
  });
  it("rejects garbage", () => {
    assert.equal(verifySession(undefined, "s"), null);
    assert.equal(verifySession("a.b", "s"), null);
  });
});

describe("auth routes", () => {
  let t: TestServer;
  before(async () => {
    t = await startServer();
  });
  after(() => t.close());

  it("GET /api/me is 401 when signed out", async () => {
    const r = await api(t.base, "GET", "/api/me");
    assert.equal(r.status, 401);
    assert.equal(typeof r.json.error, "string");
  });

  it("GET /api/me returns the user and admin flag", async () => {
    const u = asUser(t.db, "admin");
    const r = await api(t.base, "GET", "/api/me", undefined, u.cookie);
    assert.equal(r.status, 200);
    assert.equal(r.json.username, "admin");
    assert.equal(r.json.isAdmin, true);
    assert.equal(r.json.avatarUrl, "https://avatars.example/admin");
  });

  it("POST /api/auth/logout clears the cookie", async () => {
    const u = asUser(t.db, "bob");
    const r = await api(t.base, "POST", "/api/auth/logout", undefined, u.cookie);
    assert.equal(r.status, 200);
    assert.match(r.headers.get("set-cookie") ?? "", /qs=;/);
  });

  it("GET /api/auth/github redirects to GitHub with a state cookie", async () => {
    const r = await api(t.base, "GET", "/api/auth/github");
    assert.equal(r.status, 302);
    assert.match(r.headers.get("location") ?? "", /^https:\/\/github\.com\/login\/oauth\/authorize\?/);
    assert.match(r.headers.get("set-cookie") ?? "", /oauth_state=/);
  });

  it("callback without a matching state redirects to /?error=auth", async () => {
    const r = await api(t.base, "GET", "/api/auth/github/callback?code=x&state=y");
    assert.equal(r.status, 302);
    assert.equal(r.headers.get("location"), "/?error=auth");
  });

  it("rejects mutating requests that are not JSON", async () => {
    const res = await fetch(t.base + "/api/auth/logout", { method: "POST" });
    assert.equal(res.status, 415);
  });

  it("unknown API paths are JSON 404s", async () => {
    const r = await api(t.base, "GET", "/api/nope");
    assert.equal(r.status, 404);
    assert.equal(r.json.error, "Not found");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL, cannot find module `server/app.ts`.

- [ ] **Step 3: Create server/http.ts**

```ts
import type { NextFunction, Request, Response } from "express";

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Parses a positive integer route param or throws 404. Takes unknown so Express 5's widened req.params needs no casts. */
export function idParam(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) throw new HttpError(404, "Not found");
  return n;
}

/** CSRF guard: every mutating API call must declare a JSON body. Cross-site forms cannot. */
export function jsonOnly(req: Request, res: Response, next: NextFunction): void {
  const mutating = req.method === "POST" || req.method === "PUT" || req.method === "DELETE" || req.method === "PATCH";
  const type = req.headers["content-type"] ?? "";
  if (mutating && !type.startsWith("application/json")) {
    res.status(415).json({ error: "Send JSON with Content-Type: application/json" });
    return;
  }
  next();
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  const known = err as { status?: unknown; message?: unknown };
  const status = err instanceof HttpError ? err.status : typeof known.status === "number" ? known.status : 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? "Something went wrong" : String(known.message ?? "Bad request") });
}
```

- [ ] **Step 4: Create server/auth.ts**

```ts
import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import type { Db } from "./db.ts";
import { HttpError } from "./http.ts";
import type { Me } from "../shared/types.ts";

export type Config = {
  sessionSecret: string;
  githubClientId: string;
  githubClientSecret: string;
  baseUrl: string;
  adminUsers: string[];
  production: boolean;
};

export const SESSION_COOKIE = "qs";
export const SESSION_MS = 30 * 24 * 60 * 60 * 1000;

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

// ponytail: stateless HMAC cookie, no sessions table. Ceiling: no logout-everywhere and
// no revocation before expiry. Upgrade: a sessions table keyed by a random id.
export function signSession(userId: number, secret: string, now = Date.now()): string {
  const payload = `${userId}.${now + SESSION_MS}`;
  return `${payload}.${sign(payload, secret)}`;
}

export function verifySession(token: string | undefined, secret: string, now = Date.now()): number | null {
  if (!token) return null;
  const [id, exp, sig] = token.split(".");
  if (!id || !exp || !sig) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(`${id}.${exp}`, secret));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if (Number(exp) < now) return null;
  const userId = Number(id);
  return Number.isInteger(userId) && userId > 0 ? userId : null;
}

export function cookieOptions(production: boolean, maxAgeMs: number) {
  return { httpOnly: true, sameSite: "lax" as const, secure: production, path: "/", maxAge: maxAgeMs };
}

type UserRow = { id: number; username: string; avatar_url: string };

export function attachUser(db: Db, config: Config) {
  const byId = db.prepare("SELECT id, username, avatar_url FROM users WHERE id = ?");
  return (req: Request, res: Response, next: NextFunction): void => {
    const userId = verifySession(parseCookies(req.headers.cookie)[SESSION_COOKIE], config.sessionSecret);
    const row = userId ? (byId.get(userId) as UserRow | undefined) : undefined;
    const me: Me | null = row
      ? { id: row.id, username: row.username, avatarUrl: row.avatar_url, isAdmin: config.adminUsers.includes(row.username) }
      : null;
    res.locals.user = me;
    next();
  };
}

export function getUser(res: Response): Me | null {
  return (res.locals.user as Me | null | undefined) ?? null;
}

export function requireUser(_req: Request, res: Response, next: NextFunction): void {
  if (!getUser(res)) {
    res.status(401).json({ error: "Sign in required" });
    return;
  }
  next();
}

export function requireMe(res: Response): Me {
  const me = getUser(res);
  if (!me) throw new HttpError(401, "Sign in required");
  return me;
}
```

- [ ] **Step 5: Create server/routes/auth.ts**

```ts
import express from "express";
import { randomBytes } from "node:crypto";
import type { Db } from "../db.ts";
import { SESSION_COOKIE, SESSION_MS, cookieOptions, getUser, parseCookies, signSession, type Config } from "../auth.ts";

export function authRoutes(db: Db, config: Config): express.Router {
  const r = express.Router();
  const upsert = db.prepare(
    `INSERT INTO users (github_id, username, avatar_url, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(github_id) DO UPDATE SET username = excluded.username, avatar_url = excluded.avatar_url
     RETURNING id`
  );
  const callbackUrl = `${config.baseUrl}/api/auth/github/callback`;

  r.get("/auth/github", (_req, res) => {
    const state = randomBytes(16).toString("hex");
    res.cookie("oauth_state", state, cookieOptions(config.production, 10 * 60 * 1000));
    const url = new URL("https://github.com/login/oauth/authorize");
    url.searchParams.set("client_id", config.githubClientId);
    url.searchParams.set("redirect_uri", callbackUrl);
    url.searchParams.set("state", state);
    res.redirect(url.toString());
  });

  r.get("/auth/github/callback", async (req, res) => {
    const { code, state } = req.query;
    const expected = parseCookies(req.headers.cookie).oauth_state;
    res.clearCookie("oauth_state", { path: "/" });
    if (typeof code !== "string" || typeof state !== "string" || !expected || state !== expected) {
      res.redirect("/?error=auth");
      return;
    }
    try {
      const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: config.githubClientId,
          client_secret: config.githubClientSecret,
          code,
          redirect_uri: callbackUrl,
        }),
      });
      const token = (await tokenRes.json()) as { access_token?: string };
      if (!token.access_token) throw new Error("GitHub returned no access token");
      const userRes = await fetch("https://api.github.com/user", {
        headers: { Authorization: `Bearer ${token.access_token}`, "User-Agent": "questionary" },
      });
      const gh = (await userRes.json()) as { id?: number; login?: string; avatar_url?: string };
      if (!gh.id || !gh.login) throw new Error("GitHub returned no user");
      const row = upsert.get(gh.id, gh.login, gh.avatar_url ?? "", Date.now()) as { id: number };
      res.cookie(SESSION_COOKIE, signSession(row.id, config.sessionSecret), cookieOptions(config.production, SESSION_MS));
      res.redirect("/");
    } catch (err) {
      console.warn("GitHub sign-in failed:", err);
      res.redirect("/?error=auth");
    }
  });

  r.post("/auth/logout", (_req, res) => {
    res.clearCookie(SESSION_COOKIE, { path: "/" });
    res.json({ ok: true });
  });

  r.get("/me", (_req, res) => {
    const me = getUser(res);
    if (!me) {
      res.status(401).json({ error: "Not signed in" });
      return;
    }
    res.json(me);
  });

  return r;
}
```

- [ ] **Step 6: Create server/app.ts**

```ts
import express from "express";
import type { Db } from "./db.ts";
import { attachUser, type Config } from "./auth.ts";
import { errorHandler, jsonOnly } from "./http.ts";
import { authRoutes } from "./routes/auth.ts";

export function createApp(db: Db, config: Config): express.Express {
  const app = express();
  app.use("/api", jsonOnly, express.json({ limit: "1mb" }), attachUser(db, config));
  app.use("/api", authRoutes(db, config));
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not found" });
  });
  app.use(errorHandler);
  return app;
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npm test`
Expected: PASS, all auth tests green. Then run `npx tsc -p tsconfig.server.json` and expect no errors.

- [ ] **Step 8: Commit**

```bash
git add server/http.ts server/auth.ts server/routes/auth.ts server/app.ts server/test/helpers.ts server/test/auth.test.ts
git commit -m "Add Express app with HMAC sessions and GitHub OAuth routes

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MH44PLVsdJ842ZraNvQHtF"
```

---

### Task 5: Server entry with Vite middleware and static serving

**Files:**
- Create: `server/index.ts`, `.env.example`

**Interfaces:**
- Consumes: `createApp`, `openDb`, `Config`.

- [ ] **Step 1: Create .env.example**

```
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
SESSION_SECRET=change-me
# From https://github.com/settings/developers, callback URL BASE_URL/api/auth/github/callback
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
BASE_URL=http://localhost:3000
# Comma-separated GitHub usernames who may unpublish or delete any published quiz
ADMIN_USERS=
DATABASE_PATH=./data/questionary.db
PORT=3000
```

- [ ] **Step 2: Create server/index.ts**

```ts
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { createApp } from "./app.ts";
import { openDb } from "./db.ts";
import type { Config } from "./auth.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Load .env here instead of with --env-file. Node's watch mode registers the env
// file, and on Windows that means watching its directory, the project root,
// recursively, so every SQLite write under data/ would restart the server.
try {
  process.loadEnvFile(join(root, ".env"));
} catch (err) {
  // A missing .env is fine: the environment itself carries the settings.
  // Anything else (unreadable file, a directory at that path) must surface.
  if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
}

const production = process.env.NODE_ENV === "production";

function env(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === "") {
    console.error(`Missing environment variable ${name}. See .env.example.`);
    process.exit(1);
  }
  return value;
}

const config: Config = {
  sessionSecret: env("SESSION_SECRET"),
  githubClientId: env("GITHUB_CLIENT_ID"),
  githubClientSecret: env("GITHUB_CLIENT_SECRET"),
  baseUrl: env("BASE_URL", "http://localhost:3000").replace(/\/$/, ""),
  adminUsers: (process.env.ADMIN_USERS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  production,
};

const db = openDb(env("DATABASE_PATH", join(root, "data", "questionary.db")));
const app = createApp(db, config);

if (production) {
  const dist = join(root, "dist");
  app.use(express.static(dist));
  // Express 5 wildcard syntax. `/{*splat}` also matches `/`. If this version of the
  // router rejects it, use `app.use((req, res) => ...)` with a `req.method === "GET"` check.
  app.get("/{*splat}", (_req, res) => {
    res.sendFile(join(dist, "index.html"));
  });
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({ root, server: { middlewareMode: true }, appType: "spa" });
  app.use(vite.middlewares);
}

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  console.log(`Questionary listening on http://localhost:${port}${production ? "" : " (dev, Vite middleware)"}`);
});
```

- [ ] **Step 3: Verify dev mode serves the app and the API**

Create a local `.env` from `.env.example` with `SESSION_SECRET=dev`, `GITHUB_CLIENT_ID=x`, `GITHUB_CLIENT_SECRET=y`. Start in the background:

```bash
npm run dev &
sleep 6
curl -s http://localhost:3000/ | head -5
curl -s http://localhost:3000/api/me
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/local
```

Expected: the first prints HTML containing `<div id="root">` and `/src/index.tsx`; the second prints `{"error":"Not signed in"}`; the third prints `200` (Vite's SPA fallback). Stop the server afterwards (`kill %1` or find the node process).

If `/local` returns 404, Vite 4 in middleware mode needs the fallback done by hand: replace the `else` branch body with

```ts
  const { createServer } = await import("vite");
  const vite = await createServer({ root, server: { middlewareMode: true }, appType: "custom" });
  app.use(vite.middlewares);
  app.get("/{*splat}", async (req, res, next) => {
    try {
      const html = await vite.transformIndexHtml(req.originalUrl, readFileSync(join(root, "index.html"), "utf8"));
      res.status(200).set({ "Content-Type": "text/html" }).end(html);
    } catch (err) {
      next(err);
    }
  });
```

with `import { readFileSync } from "node:fs";` at the top.

- [ ] **Step 4: Verify production mode**

```bash
npm run build
NODE_ENV=production SESSION_SECRET=dev GITHUB_CLIENT_ID=x GITHUB_CLIENT_SECRET=y DATABASE_PATH=./data/test.db node server/index.ts &
sleep 3
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/quiz/1
curl -s http://localhost:3000/api/me
```

Expected: `200` then `{"error":"Not signed in"}`. Stop the server and delete `data/test.db*`.

- [ ] **Step 5: Commit**

```bash
git add server/index.ts .env.example
git commit -m "Add server entry that serves Vite in dev and dist in production

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MH44PLVsdJ842ZraNvQHtF"
```

---

### Task 6: Quiz routes

**Files:**
- Create: `server/cards.ts`, `server/routes/quizzes.ts`, `server/test/quizzes.test.ts`
- Modify: `server/app.ts`

**Interfaces:**
- Consumes: `validateQuizInput`, `HttpError`, `idParam`, `getUser`, `requireUser`, `requireMe`, `tx`.
- Produces: `server/cards.ts` exports `CARD_SELECT`, type `Row`, `toCard(row): QuizCard`, `getQuizRow(db, id): Row` (throws 404), `replaceTags(db, quizId, tags)`.

- [ ] **Step 1: Write the failing test**

Create `server/test/quizzes.test.ts`:

```ts
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { api, asUser, sampleQuestions, startServer, type TestServer } from "./helpers.ts";

describe("quiz routes", () => {
  let t: TestServer;
  let alice: { id: number; cookie: string };
  let bob: { id: number; cookie: string };
  let admin: { id: number; cookie: string };
  before(async () => {
    t = await startServer();
    alice = asUser(t.db, "alice");
    bob = asUser(t.db, "bob");
    admin = asUser(t.db, "admin");
  });
  after(() => t.close());

  const body = { title: "Unity basics", description: "Warm-up", tags: ["Unity", "C Sharp"], questions: sampleQuestions };

  it("requires sign-in to create", async () => {
    const r = await api(t.base, "POST", "/api/quizzes", body);
    assert.equal(r.status, 401);
  });

  it("rejects an invalid body with the validator message", async () => {
    const r = await api(t.base, "POST", "/api/quizzes", { ...body, title: "" }, alice.cookie);
    assert.equal(r.status, 400);
    assert.match(r.json.error, /Title must be/);
  });

  let id: number;
  it("creates a draft visible only to its author", async () => {
    const r = await api(t.base, "POST", "/api/quizzes", body, alice.cookie);
    assert.equal(r.status, 201);
    id = r.json.id;
    const mine = await api(t.base, "GET", `/api/quizzes/${id}`, undefined, alice.cookie);
    assert.equal(mine.status, 200);
    assert.equal(mine.json.published, false);
    assert.equal(mine.json.version, 1);
    assert.equal(mine.json.questions.length, 2);
    assert.deepEqual(mine.json.tags.sort(), ["c-sharp", "unity"]);
    const anon = await api(t.base, "GET", `/api/quizzes/${id}`);
    assert.equal(anon.status, 404);
    const other = await api(t.base, "GET", `/api/quizzes/${id}`, undefined, bob.cookie);
    assert.equal(other.status, 404);
  });

  it("does not list drafts", async () => {
    const r = await api(t.base, "GET", "/api/quizzes");
    assert.equal(r.json.items.length, 0);
  });

  it("publishes and then lists, strips answers for others", async () => {
    const p = await api(t.base, "POST", `/api/quizzes/${id}/publish`, undefined, alice.cookie);
    assert.equal(p.status, 200);
    const list = await api(t.base, "GET", "/api/quizzes");
    assert.equal(list.json.items.length, 1);
    assert.equal(list.json.items[0].title, "Unity basics");
    assert.equal(list.json.items[0].questionCount, 2);
    assert.equal(list.json.items[0].author.username, "alice");
    assert.equal(list.json.hasMore, false);
    const anon = await api(t.base, "GET", `/api/quizzes/${id}`);
    assert.equal(anon.status, 200);
    assert.equal(anon.json.questions, undefined);
    assert.equal(anon.json.score, 0);
    assert.equal(anon.json.plays, 0);
  });

  it("searches by text and filters by tag", async () => {
    const hit = await api(t.base, "GET", "/api/quizzes?q=warm");
    assert.equal(hit.json.items.length, 1);
    const miss = await api(t.base, "GET", "/api/quizzes?q=zzz");
    assert.equal(miss.json.items.length, 0);
    const tagged = await api(t.base, "GET", "/api/quizzes?tag=c-sharp");
    assert.equal(tagged.json.items.length, 1);
    const untagged = await api(t.base, "GET", "/api/quizzes?tag=python");
    assert.equal(untagged.json.items.length, 0);
  });

  it("keeps the version when questions do not change", async () => {
    const r = await api(t.base, "PUT", `/api/quizzes/${id}`, { ...body, title: "Unity basics 2" }, alice.cookie);
    assert.equal(r.status, 200);
    assert.equal(r.json.version, 1);
  });

  it("bumps the version when questions change on a published quiz", async () => {
    const changed = { ...body, title: "Unity basics 2", questions: [{ ...sampleQuestions[0], answer: 2 }, sampleQuestions[1]] };
    const r = await api(t.base, "PUT", `/api/quizzes/${id}`, changed, alice.cookie);
    assert.equal(r.status, 200);
    assert.equal(r.json.version, 2);
  });

  it("forbids strangers from editing or deleting", async () => {
    const e = await api(t.base, "PUT", `/api/quizzes/${id}`, body, bob.cookie);
    assert.equal(e.status, 403);
    const d = await api(t.base, "DELETE", `/api/quizzes/${id}`, undefined, bob.cookie);
    assert.equal(d.status, 403);
  });

  it("exports YAML for the author only", async () => {
    const mine = await api(t.base, "GET", `/api/quizzes/${id}/export`, undefined, alice.cookie);
    assert.equal(mine.status, 200);
    assert.match(mine.headers.get("content-type") ?? "", /yaml/);
    assert.match(mine.json, /name: Unity basics 2/);
    assert.match(mine.json, /author: alice/);
    assert.match(mine.json, /answer: 2/);
    const anon = await api(t.base, "GET", `/api/quizzes/${id}/export`);
    assert.equal(anon.status, 401);
    const other = await api(t.base, "GET", `/api/quizzes/${id}/export`, undefined, bob.cookie);
    assert.equal(other.status, 403);
  });

  it("rejects more than five tags", async () => {
    const r = await api(t.base, "POST", "/api/quizzes", { ...body, tags: ["a", "b", "c", "d", "e", "f"] }, alice.cookie);
    assert.equal(r.status, 400);
    assert.match(r.json.error, /at most 5/);
  });

  it("lets an admin unpublish and delete a published quiz", async () => {
    const u = await api(t.base, "POST", `/api/quizzes/${id}/unpublish`, undefined, admin.cookie);
    assert.equal(u.status, 200);
    const gone = await api(t.base, "GET", `/api/quizzes/${id}`);
    assert.equal(gone.status, 404);
    await api(t.base, "POST", `/api/quizzes/${id}/publish`, undefined, alice.cookie);
    const d = await api(t.base, "DELETE", `/api/quizzes/${id}`, undefined, admin.cookie);
    assert.equal(d.status, 200);
    const after = await api(t.base, "GET", `/api/quizzes/${id}`, undefined, alice.cookie);
    assert.equal(after.status, 404);
  });

  it("does not let an admin delete a draft they cannot see", async () => {
    const r = await api(t.base, "POST", "/api/quizzes", body, alice.cookie);
    const d = await api(t.base, "DELETE", `/api/quizzes/${r.json.id}`, undefined, admin.cookie);
    assert.equal(d.status, 404);
  });

  it("sorts by new and paginates", async () => {
    for (let i = 0; i < 21; i++) {
      const r = await api(t.base, "POST", "/api/quizzes", { ...body, title: `Q${i}` }, alice.cookie);
      await api(t.base, "POST", `/api/quizzes/${r.json.id}/publish`, undefined, alice.cookie);
    }
    const p1 = await api(t.base, "GET", "/api/quizzes?sort=new");
    assert.equal(p1.json.items.length, 20);
    assert.equal(p1.json.hasMore, true);
    assert.equal(p1.json.items[0].title, "Q20");
    const p2 = await api(t.base, "GET", "/api/quizzes?sort=new&page=2");
    assert.equal(p2.json.items.length, 1);
    assert.equal(p2.json.hasMore, false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL, POST /api/quizzes returns 404.

- [ ] **Step 3: Create server/cards.ts**

```ts
import type { Db } from "./db.ts";
import { HttpError } from "./http.ts";
import type { QuizCard } from "../shared/types.ts";

// ponytail: score and plays are subselects per row. Ceiling: slow listing at tens of
// thousands of quizzes. Upgrade: counter columns kept by triggers.
export const CARD_SELECT = `
  SELECT q.id, q.title, q.description, q.published, q.version, q.author_id, q.published_at,
    q.updated_at, q.questions, u.username, u.avatar_url,
    json_array_length(q.questions) AS question_count,
    COALESCE((SELECT SUM(v.value) FROM votes v WHERE v.quiz_id = q.id), 0) AS score,
    (SELECT COUNT(*) FROM attempts a WHERE a.quiz_id = q.id AND a.finished_at IS NOT NULL) AS plays,
    COALESCE((SELECT group_concat(t.tag) FROM quiz_tags t WHERE t.quiz_id = q.id), '') AS tags
  FROM quizzes q JOIN users u ON u.id = q.author_id`;

export type Row = {
  id: number;
  title: string;
  description: string;
  published: number;
  version: number;
  author_id: number;
  published_at: number | null;
  updated_at: number;
  questions: string;
  username: string;
  avatar_url: string;
  question_count: number;
  score: number;
  plays: number;
  tags: string;
};

export function toCard(r: Row): QuizCard {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    author: { username: r.username, avatarUrl: r.avatar_url },
    tags: r.tags ? r.tags.split(",") : [],
    questionCount: r.question_count,
    score: r.score,
    plays: r.plays,
    publishedAt: r.published_at,
  };
}

export function getQuizRow(db: Db, id: number): Row {
  const row = db.prepare(`${CARD_SELECT} WHERE q.id = ?`).get(id) as Row | undefined;
  if (!row) throw new HttpError(404, "Not found");
  return row;
}

export function replaceTags(db: Db, quizId: number, tags: string[]): void {
  db.prepare("DELETE FROM quiz_tags WHERE quiz_id = ?").run(quizId);
  const insert = db.prepare("INSERT INTO quiz_tags (quiz_id, tag) VALUES (?, ?)");
  for (const tag of tags) insert.run(quizId, tag);
}
```

- [ ] **Step 4: Create server/routes/quizzes.ts**

```ts
import express from "express";
import { dump } from "js-yaml";
import { tx, type Db } from "../db.ts";
import { getUser, requireMe, requireUser } from "../auth.ts";
import { HttpError, idParam } from "../http.ts";
import { CARD_SELECT, getQuizRow, replaceTags, toCard, type Row } from "../cards.ts";
import { validateQuizInput, type QuizInput } from "../../shared/validate.ts";
import type { Question } from "../../shared/types.ts";

export const PAGE_SIZE = 20;

// q.id DESC breaks ties: quizzes published in the same millisecond would otherwise
// come back in undefined order and paginate inconsistently.
const SORTS: Record<string, string> = {
  top: "score DESC, plays DESC, q.published_at DESC, q.id DESC",
  new: "q.published_at DESC, q.id DESC",
  popular: "plays DESC, q.published_at DESC, q.id DESC",
};

function parseInput(body: unknown): QuizInput {
  try {
    return validateQuizInput(body);
  } catch (err) {
    throw new HttpError(400, (err as Error).message);
  }
}

/** Author may do anything to their quiz. Admin may act on published quizzes. Others see a draft as 404. */
function authorize(row: Row, me: { id: number; isAdmin: boolean }, adminAllowed: boolean): void {
  if (row.author_id === me.id) return;
  if (!row.published) throw new HttpError(404, "Not found");
  if (adminAllowed && me.isAdmin) return;
  throw new HttpError(403, "Only the author can do that");
}

export function quizRoutes(db: Db): express.Router {
  const r = express.Router();

  r.get("/quizzes", (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const tag = typeof req.query.tag === "string" ? req.query.tag.trim().toLowerCase() : "";
    const sort = SORTS[String(req.query.sort)] ?? SORTS.top;
    const page = Math.max(1, Math.floor(Number(req.query.page)) || 1);
    // ponytail: LIKE '%q%' search, full scan, no ranking. Upgrade: FTS5 on title and description.
    const rows = db
      .prepare(
        `${CARD_SELECT}
         WHERE q.published = 1
           AND (? = '' OR q.title LIKE ? OR q.description LIKE ?)
           AND (? = '' OR EXISTS (SELECT 1 FROM quiz_tags t WHERE t.quiz_id = q.id AND t.tag = ?))
         ORDER BY ${sort}
         LIMIT ? OFFSET ?`
      )
      .all(q, `%${q}%`, `%${q}%`, tag, tag, PAGE_SIZE + 1, (page - 1) * PAGE_SIZE) as Row[];
    res.json({ items: rows.slice(0, PAGE_SIZE).map(toCard), page, hasMore: rows.length > PAGE_SIZE });
  });

  r.post("/quizzes", requireUser, (req, res) => {
    const me = requireMe(res);
    const input = parseInput(req.body);
    const now = Date.now();
    const id = tx(db, () => {
      const row = db
        .prepare(
          "INSERT INTO quizzes (author_id, title, description, questions, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id"
        )
        .get(me.id, input.title, input.description, JSON.stringify(input.questions), now, now) as { id: number };
      replaceTags(db, row.id, input.tags);
      return row.id;
    });
    res.status(201).json({ id });
  });

  r.get("/quizzes/:id", (req, res) => {
    const row = getQuizRow(db, idParam(req.params.id));
    const me = getUser(res);
    const isAuthor = me?.id === row.author_id;
    if (!row.published && !isAuthor) throw new HttpError(404, "Not found");
    const card = toCard(row);
    if (isAuthor) {
      res.json({ ...card, questions: JSON.parse(row.questions) as Question[], published: row.published === 1, version: row.version });
      return;
    }
    res.json(card);
  });

  r.put("/quizzes/:id", requireUser, (req, res) => {
    const me = requireMe(res);
    const row = getQuizRow(db, idParam(req.params.id));
    authorize(row, me, false);
    const input = parseInput(req.body);
    const questionsJson = JSON.stringify(input.questions);
    const bump = row.published === 1 && questionsJson !== row.questions ? 1 : 0;
    tx(db, () => {
      db.prepare(
        "UPDATE quizzes SET title = ?, description = ?, questions = ?, version = version + ?, updated_at = ? WHERE id = ?"
      ).run(input.title, input.description, questionsJson, bump, Date.now(), row.id);
      replaceTags(db, row.id, input.tags);
    });
    res.json({ id: row.id, version: row.version + bump });
  });

  r.delete("/quizzes/:id", requireUser, (req, res) => {
    const me = requireMe(res);
    const row = getQuizRow(db, idParam(req.params.id));
    authorize(row, me, true);
    db.prepare("DELETE FROM quizzes WHERE id = ?").run(row.id);
    res.json({ ok: true });
  });

  r.post("/quizzes/:id/publish", requireUser, (req, res) => {
    const me = requireMe(res);
    const row = getQuizRow(db, idParam(req.params.id));
    authorize(row, me, false);
    db.prepare("UPDATE quizzes SET published = 1, published_at = COALESCE(published_at, ?), updated_at = ? WHERE id = ?").run(
      Date.now(),
      Date.now(),
      row.id
    );
    res.json({ ok: true });
  });

  r.post("/quizzes/:id/unpublish", requireUser, (req, res) => {
    const me = requireMe(res);
    const row = getQuizRow(db, idParam(req.params.id));
    authorize(row, me, true);
    db.prepare("UPDATE quizzes SET published = 0, updated_at = ? WHERE id = ?").run(Date.now(), row.id);
    res.json({ ok: true });
  });

  r.get("/quizzes/:id/export", requireUser, (req, res) => {
    const me = requireMe(res);
    const row = getQuizRow(db, idParam(req.params.id));
    authorize(row, me, false);
    const tags = row.tags ? row.tags.split(",") : [];
    const metadata: Record<string, unknown> = { name: row.title, author: row.username };
    if (row.description) metadata.description = row.description;
    if (tags.length) metadata.tags = tags;
    const doc = [{ metadata }, ...(JSON.parse(row.questions) as Question[])];
    const filename = row.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "quiz";
    res.setHeader("Content-Type", "application/yaml; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}.yaml"`);
    res.send(dump(doc, { lineWidth: -1 }));
  });

  return r;
}
```

- [ ] **Step 5: Mount the router in server/app.ts**

Add `import { quizRoutes } from "./routes/quizzes.ts";` and, after the auth routes line, `app.use("/api", quizRoutes(db));`.

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test`
Expected: PASS. Then `npx tsc -p tsconfig.server.json` with no errors.

- [ ] **Step 7: Commit**

```bash
git add server/cards.ts server/routes/quizzes.ts server/app.ts server/test/quizzes.test.ts
git commit -m "Add quiz CRUD, publish, listing, and YAML export routes

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MH44PLVsdJ842ZraNvQHtF"
```

---

### Task 7: Play routes

**Files:**
- Create: `server/routes/play.ts`, `server/test/play.test.ts`
- Modify: `server/app.ts`

**Interfaces:**
- Consumes: `grade`, `stripAnswers`, `getQuizRow`, `requireUser`, `requireMe`, `HttpError`, `idParam`.
- Produces: routes `GET /api/quizzes/:id/play`, `POST /api/quizzes/:id/attempts`, `POST /api/attempts/:id`, `POST /api/quizzes/:id/grade`. Start responses are `{ attemptId?, version, title, author: { username, avatarUrl }, questions }`. Grade responses are `{ correct, total, durationMs, questions }`.

- [ ] **Step 1: Write the failing test**

Create `server/test/play.test.ts`:

```ts
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { api, asUser, sampleQuestions, startServer, type TestServer } from "./helpers.ts";

describe("play routes", () => {
  let t: TestServer;
  let alice: { id: number; cookie: string };
  let bob: { id: number; cookie: string };
  let id: number;
  before(async () => {
    t = await startServer();
    alice = asUser(t.db, "alice");
    bob = asUser(t.db, "bob");
    const r = await api(t.base, "POST", "/api/quizzes", { title: "T", questions: sampleQuestions }, alice.cookie);
    id = r.json.id;
  });
  after(() => t.close());

  it("does not serve drafts", async () => {
    const r = await api(t.base, "GET", `/api/quizzes/${id}/play`);
    assert.equal(r.status, 404);
  });

  it("serves stripped questions once published", async () => {
    await api(t.base, "POST", `/api/quizzes/${id}/publish`, undefined, alice.cookie);
    const r = await api(t.base, "GET", `/api/quizzes/${id}/play`);
    assert.equal(r.status, 200);
    assert.equal(r.json.version, 1);
    assert.equal(r.json.title, "T");
    assert.equal(r.json.author.username, "alice");
    assert.equal(r.json.questions.length, 2);
    assert.ok(!("answer" in r.json.questions[0]));
    assert.ok(!("explanation" in r.json.questions[0]));
    assert.deepEqual(r.json.questions[0].options, ["A", "B", "C"]);
  });

  it("grades anonymously without storing", async () => {
    const r = await api(t.base, "POST", `/api/quizzes/${id}/grade`, { answers: { Q1: 1, Q2: false } });
    assert.equal(r.status, 200);
    assert.equal(r.json.correct, 1);
    assert.equal(r.json.total, 2);
    assert.equal(r.json.durationMs, null);
    assert.equal(r.json.questions[0].answer, 1);
    assert.equal(r.json.questions[0].explanation, "B it is");
    const n = t.db.prepare("SELECT COUNT(*) AS n FROM attempts").get()!.n;
    assert.equal(n, 0);
  });

  it("rejects a bad answers body", async () => {
    const r = await api(t.base, "POST", `/api/quizzes/${id}/grade`, { answers: [1] });
    assert.equal(r.status, 400);
  });

  it("starts and submits an attempt for a signed-in user", async () => {
    const start = await api(t.base, "POST", `/api/quizzes/${id}/attempts`, undefined, bob.cookie);
    assert.equal(start.status, 201);
    assert.equal(typeof start.json.attemptId, "number");
    assert.ok(!("answer" in start.json.questions[0]));
    const submit = await api(t.base, "POST", `/api/attempts/${start.json.attemptId}`, { answers: { Q1: 1, Q2: true } }, bob.cookie);
    assert.equal(submit.status, 200);
    assert.equal(submit.json.correct, 2);
    assert.equal(typeof submit.json.durationMs, "number");
    assert.equal(submit.json.questions[1].answer, true);
    const again = await api(t.base, "POST", `/api/attempts/${start.json.attemptId}`, { answers: {} }, bob.cookie);
    assert.equal(again.status, 409);
    const card = await api(t.base, "GET", `/api/quizzes/${id}`);
    assert.equal(card.json.plays, 1);
  });

  it("hides other people's attempts", async () => {
    const start = await api(t.base, "POST", `/api/quizzes/${id}/attempts`, undefined, bob.cookie);
    const r = await api(t.base, "POST", `/api/attempts/${start.json.attemptId}`, { answers: {} }, alice.cookie);
    assert.equal(r.status, 404);
  });

  it("requires sign-in to start an attempt", async () => {
    const r = await api(t.base, "POST", `/api/quizzes/${id}/attempts`);
    assert.equal(r.status, 401);
  });

  it("returns 409 when the quiz version moved", async () => {
    const start = await api(t.base, "POST", `/api/quizzes/${id}/attempts`, undefined, bob.cookie);
    const changed = { title: "T", questions: [{ ...sampleQuestions[0], answer: 0 }, sampleQuestions[1]] };
    await api(t.base, "PUT", `/api/quizzes/${id}`, changed, alice.cookie);
    const r = await api(t.base, "POST", `/api/attempts/${start.json.attemptId}`, { answers: { Q1: 1 } }, bob.cookie);
    assert.equal(r.status, 409);
    assert.match(r.json.error, /updated/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL, `/api/quizzes/:id/play` returns 404.

- [ ] **Step 3: Create server/routes/play.ts**

```ts
import express from "express";
import type { Db } from "../db.ts";
import { requireMe, requireUser } from "../auth.ts";
import { HttpError, idParam } from "../http.ts";
import { getQuizRow, type Row } from "../cards.ts";
import { grade, stripAnswers } from "../../shared/grade.ts";
import type { Answers, Question } from "../../shared/types.ts";

type AttemptRow = {
  id: number;
  quiz_id: number;
  quiz_version: number;
  user_id: number;
  started_at: number;
  finished_at: number | null;
};

function publishedQuiz(db: Db, raw: string | undefined): Row {
  const row = getQuizRow(db, idParam(raw));
  if (!row.published) throw new HttpError(404, "Not found");
  return row;
}

function parseAnswers(body: unknown): Answers {
  const raw = (body as { answers?: unknown } | null)?.answers;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new HttpError(400, "answers must be an object keyed by question id");
  }
  const out: Answers = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "number" || typeof value === "boolean") out[key] = value;
  }
  return out;
}

function startPayload(row: Row, questions: Question[]) {
  return {
    version: row.version,
    title: row.title,
    author: { username: row.username, avatarUrl: row.avatar_url },
    questions: stripAnswers(questions),
  };
}

export function playRoutes(db: Db): express.Router {
  const r = express.Router();

  r.get("/quizzes/:id/play", (req, res) => {
    const row = publishedQuiz(db, req.params.id);
    res.json(startPayload(row, JSON.parse(row.questions) as Question[]));
  });

  r.post("/quizzes/:id/attempts", requireUser, (req, res) => {
    const me = requireMe(res);
    const row = publishedQuiz(db, req.params.id);
    const questions = JSON.parse(row.questions) as Question[];
    const attempt = db
      .prepare("INSERT INTO attempts (quiz_id, quiz_version, user_id, total, started_at) VALUES (?, ?, ?, ?, ?) RETURNING id")
      .get(row.id, row.version, me.id, questions.length, Date.now()) as { id: number };
    res.status(201).json({ attemptId: attempt.id, ...startPayload(row, questions) });
  });

  r.post("/attempts/:id", requireUser, (req, res) => {
    const me = requireMe(res);
    const attempt = db.prepare("SELECT id, quiz_id, quiz_version, user_id, started_at, finished_at FROM attempts WHERE id = ?").get(
      idParam(req.params.id)
    ) as AttemptRow | undefined;
    if (!attempt || attempt.user_id !== me.id) throw new HttpError(404, "Attempt not found");
    if (attempt.finished_at) throw new HttpError(409, "This attempt was already submitted.");
    const row = getQuizRow(db, attempt.quiz_id);
    if (row.version !== attempt.quiz_version) {
      throw new HttpError(409, "This quiz was updated by its author. Start over to play the new version.");
    }
    const answers = parseAnswers(req.body);
    const questions = JSON.parse(row.questions) as Question[];
    const result = grade(questions, answers);
    const now = Date.now();
    db.prepare("UPDATE attempts SET correct = ?, finished_at = ?, answers = ? WHERE id = ?").run(
      result.correct,
      now,
      JSON.stringify(answers),
      attempt.id
    );
    res.json({ correct: result.correct, total: result.total, durationMs: now - attempt.started_at, questions });
  });

  r.post("/quizzes/:id/grade", (req, res) => {
    const row = publishedQuiz(db, req.params.id);
    const answers = parseAnswers(req.body);
    const questions = JSON.parse(row.questions) as Question[];
    const result = grade(questions, answers);
    res.json({ correct: result.correct, total: result.total, durationMs: null, questions });
  });

  return r;
}
```

- [ ] **Step 4: Mount the router in server/app.ts**

Add `import { playRoutes } from "./routes/play.ts";` and `app.use("/api", playRoutes(db));` after the quiz routes.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/routes/play.ts server/app.ts server/test/play.test.ts
git commit -m "Add server-graded play routes with stored attempts

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MH44PLVsdJ842ZraNvQHtF"
```

---

### Task 8: User routes

**Files:**
- Create: `server/routes/users.ts`, `server/test/users.test.ts`
- Modify: `server/app.ts`

**Interfaces:**
- Produces: `GET /api/users/:username` returning `{ username, avatarUrl, createdAt, quizzes: QuizCard[] }`; `GET /api/me/quizzes` returning `{ drafts: QuizCard[], published: QuizCard[] }`.

- [ ] **Step 1: Write the failing test**

Create `server/test/users.test.ts`:

```ts
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { api, asUser, sampleQuestions, startServer, type TestServer } from "./helpers.ts";

describe("user routes", () => {
  let t: TestServer;
  let alice: { id: number; cookie: string };
  before(async () => {
    t = await startServer();
    alice = asUser(t.db, "Alice");
    const draft = await api(t.base, "POST", "/api/quizzes", { title: "Draft", questions: sampleQuestions }, alice.cookie);
    const pub = await api(t.base, "POST", "/api/quizzes", { title: "Live", questions: sampleQuestions }, alice.cookie);
    await api(t.base, "POST", `/api/quizzes/${pub.json.id}/publish`, undefined, alice.cookie);
    assert.equal(draft.status, 201);
  });
  after(() => t.close());

  it("shows a profile with published quizzes only, case-insensitive", async () => {
    const r = await api(t.base, "GET", "/api/users/alice");
    assert.equal(r.status, 200);
    assert.equal(r.json.username, "Alice");
    assert.equal(typeof r.json.createdAt, "number");
    assert.deepEqual(r.json.quizzes.map((q: { title: string }) => q.title), ["Live"]);
  });

  it("404s an unknown user", async () => {
    const r = await api(t.base, "GET", "/api/users/nobody");
    assert.equal(r.status, 404);
  });

  it("requires sign-in for /api/me/quizzes", async () => {
    const r = await api(t.base, "GET", "/api/me/quizzes");
    assert.equal(r.status, 401);
  });

  it("splits drafts and published for the signed-in user", async () => {
    const r = await api(t.base, "GET", "/api/me/quizzes", undefined, alice.cookie);
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.drafts.map((q: { title: string }) => q.title), ["Draft"]);
    assert.deepEqual(r.json.published.map((q: { title: string }) => q.title), ["Live"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL, `/api/users/alice` returns 404 with "Not found".

- [ ] **Step 3: Create server/routes/users.ts**

```ts
import express from "express";
import type { Db } from "../db.ts";
import { requireMe, requireUser } from "../auth.ts";
import { HttpError } from "../http.ts";
import { CARD_SELECT, toCard, type Row } from "../cards.ts";

type UserRow = { id: number; username: string; avatar_url: string; created_at: number };

export function userRoutes(db: Db): express.Router {
  const r = express.Router();

  r.get("/users/:username", (req, res) => {
    const u = db
      .prepare("SELECT id, username, avatar_url, created_at FROM users WHERE username = ? COLLATE NOCASE")
      .get(String(req.params.username)) as UserRow | undefined;
    if (!u) throw new HttpError(404, "User not found");
    const rows = db.prepare(`${CARD_SELECT} WHERE q.published = 1 AND q.author_id = ? ORDER BY q.published_at DESC`).all(u.id) as Row[];
    res.json({ username: u.username, avatarUrl: u.avatar_url, createdAt: u.created_at, quizzes: rows.map(toCard) });
  });

  r.get("/me/quizzes", requireUser, (_req, res) => {
    const me = requireMe(res);
    const rows = db.prepare(`${CARD_SELECT} WHERE q.author_id = ? ORDER BY q.updated_at DESC`).all(me.id) as Row[];
    res.json({
      drafts: rows.filter((row) => !row.published).map(toCard),
      published: rows.filter((row) => row.published).map(toCard),
    });
  });

  return r;
}
```

- [ ] **Step 4: Mount the router in server/app.ts**

Add `import { userRoutes } from "./routes/users.ts";` and `app.use("/api", userRoutes(db));` after the play routes. The final `createApp` is:

```ts
export function createApp(db: Db, config: Config): express.Express {
  const app = express();
  app.use("/api", jsonOnly, express.json({ limit: "1mb" }), attachUser(db, config));
  app.use("/api", authRoutes(db, config));
  app.use("/api", quizRoutes(db));
  app.use("/api", playRoutes(db));
  app.use("/api", userRoutes(db));
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not found" });
  });
  app.use(errorHandler);
  return app;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test`
Expected: PASS, all server tests green.

- [ ] **Step 6: Commit**

```bash
git add server/routes/users.ts server/app.ts server/test/users.test.ts
git commit -m "Add profile and my-quizzes routes

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MH44PLVsdJ842ZraNvQHtF"
```

---

### Task 9: Frontend foundation and local mode on the router

**Files:**
- Create: `src/router.tsx`, `src/api.ts`, `src/me.tsx`, `src/components/Layout.tsx`, `src/components/ErrorBox.tsx`, `src/components/SavedQuizCard.tsx`, `src/components/QuizRunner.tsx`, `src/pages/Local.tsx`, `src/pages/NotFound.tsx`
- Modify: `src/index.tsx`, `src/storage.ts`, `src/export.ts`, `src/components/SetupView.tsx`, `src/components/SettingsView.tsx`, `src/components/QuestionPage.tsx`, `src/components/ResultsView.tsx`
- Delete: `src/App.tsx`

**Interfaces:**
- Produces: `QuizRunner` props `{ quizData: PlayQuizData; saveId: string; source: "local" | "online"; meta?: { quizId?: number; attemptId?: number; version?: number }; initial?: SavedQuizState | null; onFinish: (answers: Answers) => Promise<Question[]>; onQuit: () => void; onRestart?: () => void; exitLabel: string }`.
- Produces: `src/api.ts` functions listed in Step 3. `useMe(): { me: Me | null; loading: boolean; refresh: () => Promise<void> }`.
- Produces: `src/storage.ts` exports `saveQuizProgress(state)`, `getSavedQuiz(id)`, `loadLatestLocalQuiz()`, `clearQuizProgress(id)`.

- [ ] **Step 1: Rewrite src/storage.ts**

```ts
import type { SavedQuizState } from "../shared/types.ts";

const DB_NAME = "QuestionaryDB";
const DB_VERSION = 1;
const STORE = "quizzes";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(new Error("Failed to open database"));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("timestamp", "timestamp", { unique: false });
      }
    };
  });
}

function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const request = run(db.transaction([STORE], mode).objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }).finally(() => db.close())
  );
}

export async function saveQuizProgress(state: SavedQuizState): Promise<void> {
  await withStore("readwrite", (store) => store.put(state));
}

export async function getSavedQuiz(id: string): Promise<SavedQuizState | null> {
  try {
    return ((await withStore("readonly", (store) => store.get(id))) as SavedQuizState | undefined) ?? null;
  } catch (error) {
    console.warn("Failed to load saved quiz:", error);
    return null;
  }
}

/** Most recent unfinished local-mode quiz. Older saves without a source count as local. */
export async function loadLatestLocalQuiz(): Promise<SavedQuizState | null> {
  try {
    const all = (await withStore("readonly", (store) => store.getAll())) as SavedQuizState[];
    return (
      all
        .filter((s) => (s.source ?? "local") === "local" && !s.completed)
        .sort((a, b) => b.timestamp - a.timestamp)[0] ?? null
    );
  } catch (error) {
    console.warn("Failed to load saved progress:", error);
    return null;
  }
}

export async function clearQuizProgress(id: string): Promise<void> {
  await withStore("readwrite", (store) => store.delete(id));
}
```

- [ ] **Step 2: Create src/components/ErrorBox.tsx**

```tsx
export function ErrorBox({ message }: { message: string }) {
  return <div className="mt-4 text-sm text-red-400 whitespace-pre-wrap">{message}</div>;
}
```

- [ ] **Step 3: Create src/api.ts**

```ts
import type { Answers, Me, PlayQuestion, Question, QuizCard } from "../shared/types.ts";
import type { QuizInput } from "../shared/validate.ts";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401 && method !== "GET") {
    window.location.href = "/api/auth/github";
  }
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(res.status, data.error ?? res.statusText);
  }
  return (await res.json()) as T;
}

export type QuizPage = { items: QuizCard[]; page: number; hasMore: boolean };
export type QuizDetail = QuizCard & { questions?: Question[]; published?: boolean; version?: number };
export type PlayStart = {
  attemptId?: number;
  version: number;
  title: string;
  author: { username: string; avatarUrl: string };
  questions: PlayQuestion[];
};
export type GradeResponse = { correct: number; total: number; durationMs: number | null; questions: Question[] };
export type Profile = { username: string; avatarUrl: string; createdAt: number; quizzes: QuizCard[] };
export type MyQuizzes = { drafts: QuizCard[]; published: QuizCard[] };

export const getMe = () => request<Me>("GET", "/api/me");
export const logout = () => request<{ ok: true }>("POST", "/api/auth/logout");

export function listQuizzes(params: { q?: string; tag?: string; sort?: string; page?: number }) {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.tag) search.set("tag", params.tag);
  if (params.sort) search.set("sort", params.sort);
  if (params.page && params.page > 1) search.set("page", String(params.page));
  const qs = search.toString();
  return request<QuizPage>("GET", `/api/quizzes${qs ? `?${qs}` : ""}`);
}

export const getQuiz = (id: number | string) => request<QuizDetail>("GET", `/api/quizzes/${id}`);
export const createQuiz = (input: QuizInput) => request<{ id: number }>("POST", "/api/quizzes", input);
export const updateQuiz = (id: number | string, input: QuizInput) =>
  request<{ id: number; version: number }>("PUT", `/api/quizzes/${id}`, input);
export const deleteQuiz = (id: number | string) => request<{ ok: true }>("DELETE", `/api/quizzes/${id}`);
export const publishQuiz = (id: number | string) => request<{ ok: true }>("POST", `/api/quizzes/${id}/publish`);
export const unpublishQuiz = (id: number | string) => request<{ ok: true }>("POST", `/api/quizzes/${id}/unpublish`);

export const getPlay = (id: number | string) => request<PlayStart>("GET", `/api/quizzes/${id}/play`);
export const startAttempt = (id: number | string) => request<PlayStart>("POST", `/api/quizzes/${id}/attempts`);
export const submitAttempt = (attemptId: number, answers: Answers) =>
  request<GradeResponse>("POST", `/api/attempts/${attemptId}`, { answers });
export const gradeAnonymous = (id: number | string, answers: Answers) =>
  request<GradeResponse>("POST", `/api/quizzes/${id}/grade`, { answers });

export const getProfile = (username: string) => request<Profile>("GET", `/api/users/${encodeURIComponent(username)}`);
export const getMyQuizzes = () => request<MyQuizzes>("GET", "/api/me/quizzes");
```

- [ ] **Step 4: Create src/me.tsx**

```tsx
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Me } from "../shared/types.ts";
import { getMe } from "./api.ts";

type MeState = { me: Me | null; loading: boolean; refresh: () => Promise<void> };

const MeContext = createContext<MeState>({ me: null, loading: true, refresh: async () => {} });

export function MeProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try {
      setMe(await getMe());
    } catch {
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return <MeContext.Provider value={{ me, loading, refresh }}>{children}</MeContext.Provider>;
}

export function useMe(): MeState {
  return useContext(MeContext);
}
```

- [ ] **Step 5: Create src/components/Layout.tsx**

```tsx
import { useState } from "react";
import { Link, Outlet, useLocation, useNavigate, useSearchParams } from "react-router";
import { MeProvider, useMe } from "../me.tsx";
import { logout } from "../api.ts";

export function Layout() {
  return (
    <MeProvider>
      <div className="min-h-screen w-full bg-neutral-950 text-neutral-100 flex flex-col">
        <Header />
        <main className="flex-1 mx-auto max-w-5xl w-full px-4 py-8">
          <Outlet />
        </main>
      </div>
    </MeProvider>
  );
}

function Header() {
  const { me, loading, refresh } = useMe();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");

  return (
    <header className="w-full border-b border-neutral-800 sticky top-0 z-10 backdrop-blur supports-[backdrop-filter]:bg-neutral-950/80">
      <div className="mx-auto max-w-5xl px-4 py-3 flex items-center gap-4">
        <Link to="/" className="text-lg font-semibold tracking-tight whitespace-nowrap">
          Questionary
        </Link>
        <form
          className="flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            navigate(q.trim() ? `/?q=${encodeURIComponent(q.trim())}` : "/");
          }}
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search quizzes"
            aria-label="Search quizzes"
            className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
          />
        </form>
        <Link to="/local" className="text-sm text-neutral-300 hover:text-white whitespace-nowrap">
          Play a file
        </Link>
        {loading ? null : me ? (
          <details key={location.pathname} className="relative">
            <summary className="list-none cursor-pointer flex items-center gap-2">
              <img src={me.avatarUrl} alt="" className="h-8 w-8 rounded-full bg-neutral-800" />
              <span className="text-sm hidden sm:inline">{me.username}</span>
            </summary>
            <div className="absolute right-0 mt-2 w-44 bg-neutral-900 border border-neutral-800 rounded-xl shadow-xl py-1 text-sm">
              <Link to="/me" className="block px-4 py-2 hover:bg-neutral-800">My quizzes</Link>
              <Link to="/new" className="block px-4 py-2 hover:bg-neutral-800">New quiz</Link>
              <Link to={`/u/${me.username}`} className="block px-4 py-2 hover:bg-neutral-800">Profile</Link>
              <button
                onClick={async () => {
                  await logout();
                  await refresh();
                  navigate("/");
                }}
                className="block w-full text-left px-4 py-2 hover:bg-neutral-800"
              >
                Sign out
              </button>
            </div>
          </details>
        ) : (
          <a href="/api/auth/github" className="rounded-xl px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-sm font-medium whitespace-nowrap">
            Sign in with GitHub
          </a>
        )}
      </div>
      {params.get("error") === "auth" && (
        <div className="mx-auto max-w-5xl px-4 pb-3 text-sm text-red-400">GitHub sign-in failed. Try again.</div>
      )}
    </header>
  );
}
```

- [ ] **Step 6: Create src/components/SavedQuizCard.tsx and slim SetupView**

`src/components/SavedQuizCard.tsx`:

```tsx
import type { SavedQuizState } from "../../shared/types.ts";

export function SavedQuizCard({ saved, onResume, onClear }: { saved: SavedQuizState; onResume: () => void; onClear: () => void }) {
  const answered = Object.values(saved.answers).filter((v) => v !== undefined).length;
  const total = saved.quizData.questions.length;
  const pct = total ? Math.round((answered / total) * 100) : 0;
  return (
    <div className="max-w-3xl w-full">
      <div className="bg-blue-900/20 border border-blue-500/50 rounded-2xl p-6 shadow-xl">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-xl font-semibold text-blue-400 mb-1">Continue saved quiz</h3>
            <div className="text-sm text-neutral-300">
              <div className="font-medium text-lg">{saved.quizData.metadata.name}</div>
              <div className="text-neutral-400">by {saved.quizData.metadata.author || "Unknown"}</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm text-neutral-400">
              {answered} of {total} answered
            </div>
            <div className="text-sm font-medium text-blue-400">{pct}% complete</div>
          </div>
        </div>
        <div className="mb-4">
          <div className="w-full bg-neutral-700 rounded-full h-2">
            <div className="bg-blue-500 h-2 rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div className="text-sm text-neutral-300 mb-4">Last saved: {new Date(saved.timestamp).toLocaleString()}</div>
        <div className="flex gap-3">
          <button onClick={onResume} className="inline-flex items-center justify-center rounded-xl px-6 py-2 bg-blue-600 hover:bg-blue-500 transition font-medium">
            Continue
          </button>
          <button onClick={onClear} className="inline-flex items-center justify-center rounded-xl px-4 py-2 bg-neutral-800 hover:bg-neutral-700 transition text-sm">
            Delete and start new
          </button>
        </div>
      </div>
    </div>
  );
}
```

In `src/components/SetupView.tsx`, replace the whole `{savedQuiz && ( ... )}` block with:

```tsx
      {savedQuiz && <SavedQuizCard saved={savedQuiz} onResume={onResume} onClear={onClearSaved} />}
```

and add `import { SavedQuizCard } from "./SavedQuizCard.tsx";`. Change the heading text to `Play a quiz file (offline)` and the paragraph's first sentence to `Paste your document below or upload a .json / .yaml / .yml file. Nothing is sent to the server.` Also update the `import type` to `../../shared/types.ts` if Task 1 did not already.

- [ ] **Step 7: Adjust SettingsView, QuestionPage, ResultsView, export.ts**

`src/components/SettingsView.tsx`: change the props type and drop the duplicate `QuizSettings` export:

```tsx
import { useState } from "react";
import type { QuizMetadata, QuizSettings } from "../../shared/types.ts";

type SettingsProps = {
  questionCount: number;
  quizMetadata: { metadata: QuizMetadata } | null;
  onStartQuiz: (_settings: QuizSettings) => void;
};
```

The rest of the file is unchanged.

`src/components/QuestionPage.tsx`: change `question: Question` to `question: PlayQuestion` in the props type and the import to `import type { PlayQuestion, QuizMetadata } from "../../shared/types.ts";`. Add `submitting?: boolean;` to the props and destructure it. Change the Finish button to:

```tsx
                <button
                  onClick={onFinish}
                  disabled={submitting}
                  className="rounded-xl px-4 py-2 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-60"
                >
                  {submitting ? "Submitting…" : "Finish"}
                </button>
```

`src/components/ResultsView.tsx`: replace the props and the row computation:

```tsx
import type { Answers, Question } from "../../shared/types.ts";
import { isMC, formatCorrectAnswer, formatUserAnswer } from "../../shared/questions.ts";
import { grade } from "../../shared/grade.ts";
import { generateQuizResults, exportAsJSON, exportAsCSV } from "../export.ts";

type ResultsProps = {
  questions: Question[];
  answers: Answers;
  onRestart: () => void;
  onExit: () => void;
  exitLabel: string;
};

export function ResultsView({ questions, answers, onRestart, onExit, exitLabel }: ResultsProps) {
  const result = grade(questions, answers);
  const rows = questions.map((q, idx) => ({ idx, q, user: answers[q.id], isCorrect: result.perQuestion[q.id] }));
  const correctCount = result.correct;
  const total = result.total;
```

Keep the rest, but replace the two last buttons with:

```tsx
          <button onClick={onRestart} className="rounded-xl px-4 py-2 bg-neutral-800 hover:bg-neutral-700">
            Play again
          </button>
          <button onClick={onExit} className="rounded-xl px-4 py-2 bg-neutral-800 hover:bg-neutral-700">
            {exitLabel}
          </button>
```

`src/export.ts`: use `grade` for `isCorrect` and rename the file prefix:

```ts
import type { Answers, Question } from "../shared/types.ts";
import { formatCorrectAnswer, formatUserAnswer } from "../shared/questions.ts";
import { grade } from "../shared/grade.ts";
```

In `generateQuizResults`, take `answers: Answers`, compute `const per = grade(questions, answers).perQuestion;` before the map and use `isCorrect: per[q.id]`. Replace both `unity_certification_results_` with `questionary_results_`. Remove the now-unused `isMC` import.

- [ ] **Step 8: Create src/components/QuizRunner.tsx**

```tsx
import { useEffect, useMemo, useState } from "react";
import type { Answers, PlayQuestion, PlayQuizData, Question, QuizSettings, SavedQuizState } from "../../shared/types.ts";
import { clearQuizProgress, saveQuizProgress } from "../storage.ts";
import { SettingsView } from "./SettingsView.tsx";
import { QuestionPage } from "./QuestionPage.tsx";
import { ResultsView } from "./ResultsView.tsx";
import { ErrorBox } from "./ErrorBox.tsx";

export type QuizRunnerProps = {
  quizData: PlayQuizData;
  saveId: string;
  source: "local" | "online";
  meta?: { quizId?: number; attemptId?: number; version?: number };
  initial?: SavedQuizState | null;
  /** Grades the answers and returns the full questions with answer keys. */
  onFinish: (answers: Answers) => Promise<Question[]>;
  onQuit: () => void;
  /** Play again. Defaults to returning to the settings screen. */
  onRestart?: () => void;
  exitLabel: string;
};

function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Reorders base by a saved id order. Unknown ids are dropped, missing ones appended. */
export function orderQuestions<T extends { id: string }>(base: T[], order: string[] | undefined): T[] {
  if (!order || order.length === 0) return base;
  const byId = new Map(base.map((q) => [q.id, q]));
  const ordered = order.map((id) => byId.get(id)).filter((q): q is T => Boolean(q));
  const seen = new Set(ordered.map((q) => q.id));
  return [...ordered, ...base.filter((q) => !seen.has(q.id))];
}

function restoredIndex(initial: SavedQuizState, ordered: PlayQuestion[]): number {
  const byId = initial.currentQuestionId ? ordered.findIndex((q) => q.id === initial.currentQuestionId) : -1;
  if (byId !== -1) return byId;
  return Math.min(Math.max(initial.currentIndex, 0), Math.max(ordered.length - 1, 0));
}

export function QuizRunner({ quizData, saveId, source, meta, initial, onFinish, onQuit, onRestart, exitLabel }: QuizRunnerProps) {
  const [view, setView] = useState<"settings" | "quiz" | "results">(initial ? "quiz" : "settings");
  const [settings, setSettings] = useState<QuizSettings>(initial?.settings ?? { randomOrder: false });
  const [questions, setQuestions] = useState<PlayQuestion[]>(() =>
    initial ? orderQuestions(quizData.questions, initial.questionOrder) : quizData.questions
  );
  const [answers, setAnswers] = useState<Answers>(initial?.answers ?? {});
  const [currentIndex, setCurrentIndex] = useState(() =>
    initial ? restoredIndex(initial, orderQuestions(quizData.questions, initial.questionOrder)) : 0
  );
  const [graded, setGraded] = useState<Question[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const total = questions.length;
  const current = questions[currentIndex];
  const answeredCount = useMemo(() => Object.values(answers).filter((v) => v !== undefined).length, [answers]);
  const progressPct = total ? Math.round((answeredCount / total) * 100) : 0;

  function snapshot(): SavedQuizState {
    return {
      id: saveId,
      source,
      quizId: meta?.quizId,
      attemptId: meta?.attemptId,
      version: meta?.version,
      quizData,
      settings,
      answers,
      currentIndex,
      timestamp: Date.now(),
      completed: false,
      questionOrder: questions.map((q) => q.id),
      currentQuestionId: current?.id ?? null,
    };
  }

  // Autosave while answering, debounced by a second.
  useEffect(() => {
    if (view !== "quiz" || answeredCount === 0) return;
    const t = setTimeout(() => {
      saveQuizProgress(snapshot()).catch((e) => console.warn("Auto-save failed:", e));
    }, 1000);
    return () => clearTimeout(t);
    // snapshot() reads exactly the state listed here.
  }, [view, answers, currentIndex, questions, settings, answeredCount]);

  function start(s: QuizSettings) {
    setSettings(s);
    setQuestions(s.randomOrder ? shuffle(quizData.questions) : quizData.questions);
    setAnswers({});
    setCurrentIndex(0);
    setGraded(null);
    setError(null);
    setView("quiz");
  }

  function select(value: number | boolean) {
    if (current) setAnswers((prev) => ({ ...prev, [current.id]: value }));
  }

  function next() {
    if (current && answers[current.id] === undefined) return;
    setCurrentIndex((i) => Math.min(i + 1, total - 1));
  }

  function prev() {
    setCurrentIndex((i) => Math.max(i - 1, 0));
  }

  async function finish() {
    const unanswered = total - answeredCount;
    if (unanswered > 0 && !window.confirm(`You still have ${unanswered} unanswered question${unanswered === 1 ? "" : "s"}. Finish anyway?`)) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const full = await onFinish(answers);
      const byId = new Map(full.map((q) => [q.id, q]));
      setGraded(questions.map((q) => byId.get(q.id)).filter((q): q is Question => Boolean(q)));
      await clearQuizProgress(saveId).catch(() => undefined);
      setView("results");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function quit() {
    if (answeredCount > 0) {
      await saveQuizProgress(snapshot()).catch((e) => console.warn("Save failed:", e));
    }
    onQuit();
  }

  return (
    <div>
      {view !== "settings" && (
        <div className="mb-6">
          <div className="flex justify-between text-sm text-neutral-400 tabular-nums mb-2">
            <span>{quizData.metadata.name}</span>
            <span>
              {answeredCount}/{total} answered · {progressPct}%
            </span>
          </div>
          <div className="h-2 w-full bg-neutral-800 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${progressPct}%` }} />
          </div>
        </div>
      )}

      {view === "settings" && (
        <SettingsView questionCount={quizData.questions.length} quizMetadata={quizData} onStartQuiz={start} />
      )}

      {view === "quiz" && current && (
        <>
          <QuestionPage
            question={current}
            index={currentIndex}
            total={total}
            value={answers[current.id]}
            isAnswered={answers[current.id] !== undefined}
            onChange={select}
            onPrev={prev}
            onNext={next}
            onFinish={() => void finish()}
            onQuit={() => void quit()}
            quizMetadata={quizData.metadata}
            submitting={submitting}
          />
          {error && <ErrorBox message={error} />}
        </>
      )}

      {view === "results" && graded && (
        <ResultsView
          questions={graded}
          answers={answers}
          onRestart={onRestart ?? (() => setView("settings"))}
          onExit={onQuit}
          exitLabel={exitLabel}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 9: Create src/pages/Local.tsx and src/pages/NotFound.tsx**

`src/pages/Local.tsx`:

```tsx
import { useCallback, useEffect, useState } from "react";
import type { PlayQuizData, Question, SavedQuizState } from "../../shared/types.ts";
import { parseQuestionsFromText } from "../../shared/validate.ts";
import { clearQuizProgress, loadLatestLocalQuiz } from "../storage.ts";
import { SetupView } from "../components/SetupView.tsx";
import { QuizRunner } from "../components/QuizRunner.tsx";

export function Local() {
  const [quizData, setQuizData] = useState<PlayQuizData | null>(null);
  const [saved, setSaved] = useState<SavedQuizState | null>(null);
  const [initial, setInitial] = useState<SavedQuizState | null>(null);
  const [saveId, setSaveId] = useState("");
  const [runKey, setRunKey] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const loadSaved = useCallback(() => loadLatestLocalQuiz().then(setSaved), []);
  useEffect(() => {
    void loadSaved();
  }, [loadSaved]);

  function loadText(text: string) {
    setError(null);
    try {
      const parsed = parseQuestionsFromText(text);
      setQuizData(parsed);
      setInitial(null);
      setSaveId(`quiz_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`);
      setRunKey((k) => k + 1);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function loadFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => loadText(String(reader.result));
    reader.onerror = () => setError("Failed to read the file.");
    reader.readAsText(file);
  }

  function resume() {
    if (!saved) return;
    setQuizData(saved.quizData);
    setInitial(saved);
    setSaveId(saved.id);
    setRunKey((k) => k + 1);
  }

  async function clearSaved() {
    if (saved) await clearQuizProgress(saved.id).catch(() => undefined);
    setSaved(null);
  }

  function exit() {
    setQuizData(null);
    setInitial(null);
    void loadSaved();
  }

  if (!quizData) {
    return (
      <SetupView
        error={error}
        onPasteLoad={loadText}
        onFileSelected={loadFile}
        savedQuiz={saved}
        onResume={resume}
        onClearSaved={() => void clearSaved()}
      />
    );
  }

  return (
    <QuizRunner
      key={runKey}
      quizData={quizData}
      saveId={saveId}
      source="local"
      initial={initial}
      // Local mode keeps the full questions in memory, so grading needs no server.
      onFinish={async () => quizData.questions as Question[]}
      onQuit={exit}
      exitLabel="Back to import"
    />
  );
}
```

`src/pages/NotFound.tsx`:

```tsx
import { Link } from "react-router";

export function NotFound() {
  return (
    <p className="text-neutral-400">
      That page does not exist. <Link to="/" className="underline">Go home</Link>.
    </p>
  );
}
```

- [ ] **Step 10: Fix the YAML template indentation**

`src/templates.ts` indents `name` and `author` by two spaces under `- metadata:`, which YAML reads as siblings of `metadata`, so the inserted template fails validation with "First item must contain a 'metadata' object". Change the YAML branch to:

```ts
  return `- metadata:
    name: "My Quiz Title"
    author: "Your Name (optional)"
    description: "What this quiz covers (optional)"
    tags: ["topic", "level"]
- id: q1
  type: mc
  prompt: "<your question here>"
  options: ["A", "B", "C", "D"]
  answer: 0
  explanation: "<optional explanation>"
- id: q2
  type: tf
  prompt: "<your true/false statement here>"
  answer: true`;
```

Add `"description": "What this quiz covers (optional)"` and `"tags": ["topic", "level"]` to the JSON template's metadata object too.

- [ ] **Step 11: Create src/router.tsx, rewrite src/index.tsx, delete src/App.tsx**

`src/router.tsx` (pages for later tasks are added there; for now only these):

```tsx
import { createBrowserRouter } from "react-router";
import { Layout } from "./components/Layout.tsx";
import { Local } from "./pages/Local.tsx";
import { NotFound } from "./pages/NotFound.tsx";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <Local /> },
      { path: "local", element: <Local /> },
      { path: "*", element: <NotFound /> },
    ],
  },
]);
```

`src/index.tsx`:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router/dom";
import "./index.css";
import { router } from "./router.tsx";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
```

```bash
git rm src/App.tsx
```

- [ ] **Step 12: Build and check in the browser**

Run: `npm run build`
Expected: no TypeScript errors, `dist/` written. Fix any type errors in the touched components before moving on.

Run `npm run dev`, open `http://localhost:3000/local`, paste the YAML template via "Insert YAML Template", load, start, answer one question, refresh the page, and confirm the "Continue saved quiz" card appears and Continue lands on the same question. Finish and confirm results render with "Play again" and "Back to import". Stop the server.

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "Put the app on react-router and extract QuizRunner from App

Local mode moves to /local. The runner takes an onFinish that returns graded
questions, so online play can plug in a server call in place of the local
answer key.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MH44PLVsdJ842ZraNvQHtF"
```

---

### Task 10: Catalog and quiz pages

**Files:**
- Create: `src/components/QuizCardView.tsx`, `src/pages/Catalog.tsx`, `src/pages/Quiz.tsx`
- Modify: `src/router.tsx`

**Interfaces:**
- Consumes: `listQuizzes`, `getQuiz`, `publishQuiz`, `unpublishQuiz`, `deleteQuiz`, `useMe`, `ErrorBox`.

- [ ] **Step 1: Create src/components/QuizCardView.tsx**

```tsx
import { Link } from "react-router";
import type { QuizCard } from "../../shared/types.ts";

export function QuizCardView({ quiz }: { quiz: QuizCard }) {
  return (
    <Link
      to={`/quiz/${quiz.id}`}
      className="block bg-neutral-900 border border-neutral-800 hover:border-neutral-700 rounded-2xl p-5 transition"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-lg font-semibold leading-snug">{quiz.title}</h3>
        <span className="text-xs text-neutral-400 whitespace-nowrap">{quiz.questionCount} questions</span>
      </div>
      {quiz.description && <p className="mt-1 text-sm text-neutral-400 line-clamp-2">{quiz.description}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-neutral-400">
        <span className="flex items-center gap-1">
          <img src={quiz.author.avatarUrl} alt="" className="h-4 w-4 rounded-full bg-neutral-800" />
          {quiz.author.username}
        </span>
        <span title="Score">▲ {quiz.score}</span>
        <span>{quiz.plays} plays</span>
        {quiz.tags.map((t) => (
          <span key={t} className="rounded-md bg-neutral-800 px-1.5 py-0.5">
            {t}
          </span>
        ))}
      </div>
    </Link>
  );
}
```

- [ ] **Step 2: Create src/pages/Catalog.tsx**

```tsx
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { listQuizzes, type QuizPage } from "../api.ts";
import { QuizCardView } from "../components/QuizCardView.tsx";
import { ErrorBox } from "../components/ErrorBox.tsx";

const SORTS = ["top", "new", "popular"] as const;

export function Catalog() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const sort = params.get("sort") ?? "top";
  const tag = params.get("tag") ?? "";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const [data, setData] = useState<QuizPage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setError(null);
    listQuizzes({ q, sort, tag, page })
      .then((d) => alive && setData(d))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [q, sort, tag, page]);

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    setParams(next);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-6">
        {SORTS.map((s) => (
          <button
            key={s}
            onClick={() => setParam("sort", s === "top" ? "" : s)}
            className={`rounded-xl px-3 py-1.5 text-sm ${sort === s ? "bg-emerald-600" : "bg-neutral-800 hover:bg-neutral-700"}`}
          >
            {s[0].toUpperCase() + s.slice(1)}
          </button>
        ))}
        {q && (
          <span className="text-sm text-neutral-400">
            Results for "{q}"{" "}
            <button onClick={() => setParam("q", "")} className="underline">
              clear
            </button>
          </span>
        )}
        {tag && (
          <span className="text-sm text-neutral-400">
            Tag: {tag}{" "}
            <button onClick={() => setParam("tag", "")} className="underline">
              clear
            </button>
          </span>
        )}
      </div>

      {error && <ErrorBox message={error} />}
      {data && data.items.length === 0 && (
        <p className="text-neutral-400">
          No quizzes here yet.{" "}
          <Link to="/new" className="underline">
            Publish one
          </Link>
          .
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {data?.items.map((quiz) => (
          <QuizCardView key={quiz.id} quiz={quiz} />
        ))}
      </div>
      {data && (page > 1 || data.hasMore) && (
        <div className="mt-6 flex gap-3">
          {page > 1 && (
            <button onClick={() => setParam("page", String(page - 1))} className="rounded-xl px-4 py-2 bg-neutral-800 hover:bg-neutral-700">
              Previous
            </button>
          )}
          {data.hasMore && (
            <button onClick={() => setParam("page", String(page + 1))} className="rounded-xl px-4 py-2 bg-neutral-800 hover:bg-neutral-700">
              Next
            </button>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create src/pages/Quiz.tsx**

```tsx
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { deleteQuiz, getQuiz, publishQuiz, unpublishQuiz, type QuizDetail } from "../api.ts";
import { useMe } from "../me.tsx";
import { ErrorBox } from "../components/ErrorBox.tsx";

const btn = "rounded-xl px-4 py-2 transition disabled:opacity-50";

export function Quiz() {
  const { id } = useParams();
  const { me } = useMe();
  const navigate = useNavigate();
  const [quiz, setQuiz] = useState<QuizDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () =>
      getQuiz(id!)
        .then(setQuiz)
        .catch((e: Error) => setError(e.message)),
    [id]
  );
  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <ErrorBox message={error} />;
  if (!quiz) return <p className="text-neutral-400">Loading…</p>;

  // Only the author receives `published`; everyone else only ever sees published quizzes.
  const isPublished = quiz.published !== false;
  const isAuthor = me?.username === quiz.author.username;
  const canModerate = isAuthor || (me?.isAdmin === true && isPublished);

  async function act(fn: () => Promise<unknown>, after?: () => void) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      if (after) after();
      else await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl">
      {!isPublished && <div className="mb-3 text-xs uppercase tracking-wide text-amber-400">Draft</div>}
      <h1 className="text-3xl font-bold">{quiz.title}</h1>
      <Link to={`/u/${quiz.author.username}`} className="mt-2 inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-neutral-200">
        <img src={quiz.author.avatarUrl} alt="" className="h-5 w-5 rounded-full bg-neutral-800" />
        {quiz.author.username}
      </Link>
      {quiz.description && <p className="mt-4 text-neutral-300 whitespace-pre-wrap">{quiz.description}</p>}
      <div className="mt-4 flex flex-wrap gap-3 text-sm text-neutral-400">
        <span>{quiz.questionCount} questions</span>
        <span>▲ {quiz.score}</span>
        <span>{quiz.plays} plays</span>
        {quiz.tags.map((t) => (
          <Link key={t} to={`/?tag=${encodeURIComponent(t)}`} className="rounded-md bg-neutral-800 px-1.5 py-0.5 hover:bg-neutral-700">
            {t}
          </Link>
        ))}
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        {isPublished && (
          <Link to={`/quiz/${quiz.id}/play`} className={`${btn} bg-emerald-600 hover:bg-emerald-500 font-medium`}>
            Play
          </Link>
        )}
        {isAuthor && (
          <Link to={`/quiz/${quiz.id}/edit`} className={`${btn} bg-neutral-800 hover:bg-neutral-700`}>
            Edit
          </Link>
        )}
        {isAuthor && (
          <a href={`/api/quizzes/${quiz.id}/export`} className={`${btn} bg-neutral-800 hover:bg-neutral-700`}>
            Download YAML
          </a>
        )}
        {isAuthor && !isPublished && (
          <button disabled={busy} onClick={() => void act(() => publishQuiz(quiz.id))} className={`${btn} bg-emerald-600 hover:bg-emerald-500`}>
            Publish
          </button>
        )}
        {canModerate && isPublished && (
          <button
            disabled={busy}
            onClick={() => void act(() => unpublishQuiz(quiz.id), isAuthor ? undefined : () => navigate("/"))}
            className={`${btn} bg-neutral-800 hover:bg-neutral-700`}
          >
            Unpublish
          </button>
        )}
        {canModerate && (
          <button
            disabled={busy}
            onClick={() => {
              if (window.confirm("Delete this quiz? This cannot be undone.")) {
                void act(() => deleteQuiz(quiz.id), () => navigate(isAuthor ? "/me" : "/"));
              }
            }}
            className={`${btn} bg-red-600 hover:bg-red-500`}
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Register the routes**

In `src/router.tsx`, import `Catalog` and `Quiz` and change the children to:

```tsx
      { index: true, element: <Catalog /> },
      { path: "local", element: <Local /> },
      { path: "quiz/:id", element: <Quiz /> },
      { path: "*", element: <NotFound /> },
```

- [ ] **Step 5: Build and check**

Run: `npm run build`
Expected: clean.

Seed a quiz without GitHub by inserting directly. With the dev server stopped:

```bash
node -e "
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('./data/questionary.db');
db.exec(require('fs').readFileSync('server/schema.sql','utf8'));
const u = db.prepare('INSERT INTO users (github_id, username, avatar_url, created_at) VALUES (1, ?, ?, ?) ON CONFLICT(github_id) DO UPDATE SET username=excluded.username RETURNING id').get('seed', 'https://avatars.githubusercontent.com/u/1', Date.now());
const qs = JSON.stringify([{id:'Q1',type:'mc',prompt:'Pick B',options:['A','B','C'],answer:1,explanation:'B'},{id:'Q2',type:'tf',prompt:'Water is wet',answer:true}]);
const q = db.prepare('INSERT INTO quizzes (author_id, title, description, questions, published, created_at, updated_at, published_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?) RETURNING id').get(u.id, 'Seed quiz', 'Two questions', qs, Date.now(), Date.now(), Date.now());
db.prepare('INSERT INTO quiz_tags (quiz_id, tag) VALUES (?, ?)').run(q.id, 'sample');
console.log('quiz', q.id);
"
```

Run `npm run dev`, open `http://localhost:3000/`. Expected: one card "Seed quiz" by seed with the `sample` tag. Click it: the quiz page shows Play. Search "two" in the header: the card stays. Search "zzz": "No quizzes here yet." Stop the server.

- [ ] **Step 6: Commit**

```bash
git add src/components/QuizCardView.tsx src/pages/Catalog.tsx src/pages/Quiz.tsx src/router.tsx
git commit -m "Add catalog and quiz pages

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MH44PLVsdJ842ZraNvQHtF"
```

---

### Task 11: Online play page

**Files:**
- Create: `src/pages/Play.tsx`
- Modify: `src/router.tsx`

**Interfaces:**
- Consumes: `QuizRunner`, `SavedQuizCard`, `getPlay`, `startAttempt`, `submitAttempt`, `gradeAnonymous`, `ApiError`, `getSavedQuiz`, `clearQuizProgress`, `useMe`.

- [ ] **Step 1: Create src/pages/Play.tsx**

```tsx
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import type { Answers, PlayQuizData, Question, SavedQuizState } from "../../shared/types.ts";
import { ApiError, getPlay, gradeAnonymous, startAttempt, submitAttempt } from "../api.ts";
import { clearQuizProgress, getSavedQuiz } from "../storage.ts";
import { useMe } from "../me.tsx";
import { QuizRunner } from "../components/QuizRunner.tsx";
import { SavedQuizCard } from "../components/SavedQuizCard.tsx";
import { ErrorBox } from "../components/ErrorBox.tsx";

type Phase =
  | { kind: "loading" }
  | { kind: "resume"; saved: SavedQuizState }
  | { kind: "run"; data: PlayQuizData; attemptId?: number; version: number; initial: SavedQuizState | null; runKey: number }
  | { kind: "stale" }
  | { kind: "error"; message: string };

export function Play() {
  const { id } = useParams();
  const quizId = Number(id);
  const { me, loading } = useMe();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const saveId = `online_${quizId}`;

  async function start() {
    setPhase({ kind: "loading" });
    try {
      const s = me ? await startAttempt(quizId) : await getPlay(quizId);
      setPhase({
        kind: "run",
        data: { metadata: { name: s.title, author: s.author.username }, questions: s.questions },
        attemptId: s.attemptId,
        version: s.version,
        initial: null,
        runKey: Date.now(),
      });
    } catch (e) {
      setPhase({ kind: "error", message: (e as Error).message });
    }
  }

  useEffect(() => {
    if (loading) return;
    let alive = true;
    (async () => {
      const saved = await getSavedQuiz(saveId);
      if (!alive) return;
      if (saved && !saved.completed) setPhase({ kind: "resume", saved });
      else await start();
    })();
    return () => {
      alive = false;
    };
    // start() closes over me and quizId, both listed here.
  }, [loading, me, quizId]);

  async function onFinish(answers: Answers, attemptId?: number): Promise<Question[]> {
    try {
      const r = attemptId ? await submitAttempt(attemptId, answers) : await gradeAnonymous(quizId, answers);
      return r.questions;
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        await clearQuizProgress(saveId).catch(() => undefined);
        setPhase({ kind: "stale" });
      }
      throw e;
    }
  }

  if (phase.kind === "loading") return <p className="text-neutral-400">Loading…</p>;
  if (phase.kind === "error") return <ErrorBox message={phase.message} />;
  if (phase.kind === "stale") {
    return (
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl">
        <p className="text-neutral-200">This quiz was updated by its author, so your attempt cannot be submitted.</p>
        <button onClick={() => void start()} className="mt-4 rounded-xl px-4 py-2 bg-emerald-600 hover:bg-emerald-500">
          Start over
        </button>
      </div>
    );
  }
  if (phase.kind === "resume") {
    const saved = phase.saved;
    return (
      <div className="flex justify-center">
        <SavedQuizCard
          saved={saved}
          onResume={() =>
            setPhase({
              kind: "run",
              data: saved.quizData,
              attemptId: saved.attemptId,
              version: saved.version ?? 0,
              initial: saved,
              runKey: Date.now(),
            })
          }
          onClear={async () => {
            await clearQuizProgress(saveId).catch(() => undefined);
            await start();
          }}
        />
      </div>
    );
  }

  return (
    <QuizRunner
      key={phase.runKey}
      quizData={phase.data}
      saveId={saveId}
      source="online"
      meta={{ quizId, attemptId: phase.attemptId, version: phase.version }}
      initial={phase.initial}
      onFinish={(answers) => onFinish(answers, phase.attemptId)}
      onQuit={() => navigate(`/quiz/${quizId}`)}
      onRestart={() => void start()}
      exitLabel="Back to quiz"
    />
  );
}
```

- [ ] **Step 2: Register the route**

In `src/router.tsx` add `{ path: "quiz/:id/play", element: <Play /> },` after the `quiz/:id` route and import `Play`.

- [ ] **Step 3: Build and check**

Run: `npm run build`
Expected: clean.

Run `npm run dev`, open the seed quiz, click Play (signed out). Answer one question, refresh: the "Continue saved quiz" card appears. Continue, finish. Expected: results with correct answers and explanations, and the network tab shows a POST to `/api/quizzes/<id>/grade`. The DevTools response for `/api/quizzes/<id>/play` contains no `answer` keys. "Play again" starts a fresh run. Stop the server.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Play.tsx src/router.tsx
git commit -m "Add online play page with server grading and resume

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MH44PLVsdJ842ZraNvQHtF"
```

---

### Task 12: Publish, Me, and Profile pages

**Files:**
- Create: `src/pages/Publish.tsx`, `src/pages/Me.tsx`, `src/pages/Profile.tsx`
- Modify: `src/router.tsx`

**Interfaces:**
- Consumes: `parseQuestionsFromText`, `validateQuizInput`, `dump`, `getTemplate`, `createQuiz`, `updateQuiz`, `publishQuiz`, `getQuiz`, `getMyQuizzes`, `getProfile`, `useMe`, `QuizCardView`, `ErrorBox`.

- [ ] **Step 1: Create src/pages/Publish.tsx**

```tsx
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { dump } from "js-yaml";
import { parseQuestionsFromText, validateQuizInput, type QuizInput } from "../../shared/validate.ts";
import { createQuiz, getQuiz, publishQuiz, updateQuiz } from "../api.ts";
import { getTemplate } from "../templates.ts";
import { useMe } from "../me.tsx";
import { ErrorBox } from "../components/ErrorBox.tsx";

const field = "w-full bg-neutral-950 border border-neutral-800 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40";
const btn = "inline-flex items-center justify-center rounded-xl px-4 py-2 transition disabled:opacity-50";

export function Publish() {
  const { id } = useParams();
  const editing = id !== undefined;
  const navigate = useNavigate();
  const { me, loading } = useMe();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [count, setCount] = useState<number | null>(null);
  const [published, setPublished] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !me) window.location.href = "/api/auth/github";
  }, [loading, me]);

  useEffect(() => {
    if (!editing) return;
    getQuiz(id!)
      .then((q) => {
        if (!q.questions) {
          setError("Only the author can edit this quiz.");
          return;
        }
        setTitle(q.title);
        setDescription(q.description);
        setTags(q.tags);
        setPublished(q.published === true);
        const metadata: Record<string, unknown> = { name: q.title };
        if (q.description) metadata.description = q.description;
        if (q.tags.length) metadata.tags = q.tags;
        setText(dump([{ metadata }, ...q.questions], { lineWidth: -1 }));
        setCount(q.questions.length);
      })
      .catch((e: Error) => setError(e.message));
  }, [editing, id]);

  function onTextChange(value: string) {
    setText(value);
    setError(null);
    try {
      const parsed = parseQuestionsFromText(value);
      setCount(parsed.questions.length);
      if (!title) setTitle(parsed.metadata.name);
      if (!description && parsed.metadata.description) setDescription(parsed.metadata.description);
      if (tags.length === 0 && parsed.metadata.tags?.length) setTags(parsed.metadata.tags);
    } catch {
      setCount(null);
    }
  }

  function onFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => onTextChange(String(reader.result));
    reader.onerror = () => setError("Failed to read the file.");
    reader.readAsText(file);
  }

  function buildInput(): QuizInput | null {
    try {
      const parsed = parseQuestionsFromText(text);
      return validateQuizInput({
        title: title.trim() || parsed.metadata.name,
        description: description.trim() || parsed.metadata.description || "",
        tags: tags.length ? tags : parsed.metadata.tags ?? [],
        questions: parsed.questions,
      });
    } catch (e) {
      setError((e as Error).message);
      return null;
    }
  }

  async function save(publish: boolean) {
    const input = buildInput();
    if (!input) return;
    setBusy(true);
    setError(null);
    try {
      let quizId: number;
      if (editing) {
        await updateQuiz(id!, input);
        quizId = Number(id);
      } else {
        quizId = (await createQuiz(input)).id;
      }
      if (publish && !published) await publishQuiz(quizId);
      navigate(publish || published ? `/quiz/${quizId}` : "/me");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl">
      <h1 className="text-2xl font-semibold mb-4">{editing ? "Edit quiz" : "New quiz"}</h1>

      <label className="block text-sm text-neutral-300 mb-1">Title</label>
      <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} className={field} />

      <label className="block text-sm text-neutral-300 mt-4 mb-1">Description</label>
      <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} rows={3} className={field} />

      <label className="block text-sm text-neutral-300 mt-4 mb-1">Questions (YAML or JSON)</label>
      <p className="text-xs text-neutral-500 mb-2">
        Paste a full quiz document or upload a file. The title and description above win over the file's metadata when both are set.
      </p>
      <textarea value={text} onChange={(e) => onTextChange(e.target.value)} rows={16} className={`${field} font-mono`} />
      <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
        <label className={`${btn} bg-neutral-800 hover:bg-neutral-700 cursor-pointer`}>
          <input
            type="file"
            accept=".json,.yaml,.yml,application/json,application/x-yaml,text/yaml,text/x-yaml"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
            }}
          />
          Upload file
        </label>
        <button onClick={() => onTextChange(getTemplate("yaml"))} className={`${btn} bg-neutral-800 hover:bg-neutral-700`}>
          Insert YAML template
        </button>
        <span className="text-neutral-400">{count === null ? "No valid questions yet" : `${count} question${count === 1 ? "" : "s"} loaded`}</span>
      </div>

      {error && <ErrorBox message={error} />}

      <div className="mt-6 flex flex-wrap gap-3">
        <button disabled={busy} onClick={() => void save(false)} className={`${btn} bg-neutral-800 hover:bg-neutral-700`}>
          {published ? "Save" : "Save draft"}
        </button>
        {!published && (
          <button disabled={busy} onClick={() => void save(true)} className={`${btn} bg-emerald-600 hover:bg-emerald-500 font-medium`}>
            Publish
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create src/pages/Me.tsx**

```tsx
import { useEffect, useState } from "react";
import { Link } from "react-router";
import type { QuizCard } from "../../shared/types.ts";
import { getMyQuizzes, type MyQuizzes } from "../api.ts";
import { useMe } from "../me.tsx";
import { QuizCardView } from "../components/QuizCardView.tsx";
import { ErrorBox } from "../components/ErrorBox.tsx";

function Section({ title, quizzes, empty }: { title: string; quizzes: QuizCard[]; empty: string }) {
  return (
    <section className="mb-8">
      <h2 className="text-xl font-semibold mb-3">{title}</h2>
      {quizzes.length === 0 ? (
        <p className="text-neutral-400 text-sm">{empty}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {quizzes.map((q) => (
            <div key={q.id}>
              <QuizCardView quiz={q} />
              <Link to={`/quiz/${q.id}/edit`} className="mt-1 inline-block text-xs text-neutral-400 hover:text-neutral-200 underline">
                Edit
              </Link>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function Me() {
  const { me, loading } = useMe();
  const [data, setData] = useState<MyQuizzes | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!me) {
      window.location.href = "/api/auth/github";
      return;
    }
    getMyQuizzes()
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, [loading, me]);

  if (error) return <ErrorBox message={error} />;
  if (!data) return <p className="text-neutral-400">Loading…</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">My quizzes</h1>
        <Link to="/new" className="rounded-xl px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-sm font-medium">
          New quiz
        </Link>
      </div>
      <Section title="Drafts" quizzes={data.drafts} empty="No drafts." />
      <Section title="Published" quizzes={data.published} empty="Nothing published yet." />
    </div>
  );
}
```

- [ ] **Step 3: Create src/pages/Profile.tsx**

```tsx
import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { getProfile, type Profile as ProfileData } from "../api.ts";
import { QuizCardView } from "../components/QuizCardView.tsx";
import { ErrorBox } from "../components/ErrorBox.tsx";

export function Profile() {
  const { username } = useParams();
  const [data, setData] = useState<ProfileData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    setError(null);
    getProfile(username!)
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, [username]);

  if (error) return <ErrorBox message={error} />;
  if (!data) return <p className="text-neutral-400">Loading…</p>;

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <img src={data.avatarUrl} alt="" className="h-16 w-16 rounded-full bg-neutral-800" />
        <div>
          <h1 className="text-2xl font-semibold">{data.username}</h1>
          <p className="text-sm text-neutral-400">Member since {new Date(data.createdAt).toLocaleDateString()}</p>
        </div>
      </div>
      {data.quizzes.length === 0 ? (
        <p className="text-neutral-400">No published quizzes yet.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {data.quizzes.map((q) => (
            <QuizCardView key={q.id} quiz={q} />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Register the routes**

`src/router.tsx` final children for phase 1:

```tsx
      { index: true, element: <Catalog /> },
      { path: "local", element: <Local /> },
      { path: "quiz/:id", element: <Quiz /> },
      { path: "quiz/:id/play", element: <Play /> },
      { path: "quiz/:id/edit", element: <Publish /> },
      { path: "new", element: <Publish /> },
      { path: "u/:username", element: <Profile /> },
      { path: "me", element: <Me /> },
      { path: "*", element: <NotFound /> },
```

- [ ] **Step 5: Build and check without GitHub**

Run: `npm run build`
Expected: clean.

To act as a signed-in user without an OAuth app, mint a session cookie for the seed user. With the dev server stopped:

```bash
node -e "
const { createHmac } = require('crypto');
const secret = 'dev'; const payload = '1.' + (Date.now() + 86400000);
console.log('qs=' + payload + '.' + createHmac('sha256', secret).update(payload).digest('base64url'));
"
```

Run `npm run dev`, open DevTools on `http://localhost:3000/`, and in the Application tab add a cookie `qs` with that value for `localhost`. Reload. Expected: the header shows the seed avatar. Open New quiz, insert the YAML template, change the title, Publish. Expected: redirected to the new quiz page with Edit, Download YAML, Unpublish, Delete. Open My quizzes: it appears under Published. Open `/u/seed`: both quizzes appear. Edit the quiz, change an answer, Save, then play it: works. Stop the server.

- [ ] **Step 6: Commit**

```bash
git add src/pages/Publish.tsx src/pages/Me.tsx src/pages/Profile.tsx src/router.tsx
git commit -m "Add publish, my quizzes, and profile pages

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MH44PLVsdJ842ZraNvQHtF"
```

---

### Task 13: README and phase 1 checklist

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Rewrite README.md**

Replace the file with:

````markdown
# Questionary

Community quizzes. Sign in with GitHub, publish a quiz from a YAML or JSON file, and play
quizzes other people published. Grading happens on the server, so the answer key never
reaches the browser before you submit. The original offline mode still lives at `/local`.

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
````

- [ ] **Step 2: Run the phase 1 manual checklist**

With the dev server running and the minted cookie from Task 12, confirm each line and note any failure:

1. Header shows the avatar when the cookie is set. Sign out clears it.
2. Upload `questions/questions.yaml` on New quiz, publish. It appears in the catalog under New.
3. Play it signed out: results show. Play it signed in, refresh mid-quiz, resume works.
4. Edit the published quiz, change an answer, and submit an attempt started before the edit: the "updated by its author" message appears with Start over.
5. Profile page lists published quizzes only. My quizzes splits drafts and published.
6. `/local` still loads a pasted file and resumes after refresh.
7. `npm test` passes and `npm run build` is clean.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "Rewrite README for the community app

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MH44PLVsdJ842ZraNvQHtF"
```
