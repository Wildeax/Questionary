# Phase 3: In-App Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let authors build and edit a quiz in the browser with a form editor that produces the same question objects the upload path produces, switch between the editor and the YAML text freely, and download the quiz as YAML.

**Architecture:** A pure question model in `shared/editor.ts` (renumber, blank question, type switch, reorder, option edits) with `node:test` coverage, a presentational `Editor` component that only calls those helpers and emits a new array, and two tabs on the publish page that convert between the text document and the question array with the existing parser and `js-yaml` `dump`. Publish validates editor output through the same `validateQuizInput` as uploads, so the server sees one shape.

**Tech Stack:** Same as phases 1 and 2. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-04-community-quizzes-design.md` (sections 3 phase 3, 13).

## Global Constraints

- Node runs `.ts` directly. Inside `server/` and `shared/`, every relative import uses an explicit `.ts` extension, and every type-only import uses `import type` or `import { type X }`. No enums, no namespaces, no constructor parameter properties.
- No new dependencies of any kind.
- The editor never produces an object the validator would not accept from an upload: same `Question` shape, ids `Q001`, `Q002`, ... by position, `explanation` omitted when blank.
- `validateQuizData` gains one rule that applies to uploads too: multiple-choice options must not be blank.
- The frontend keeps the phase 1 and 2 patterns: `ErrorBox` for errors, explicit extensions on imports, react-router 7 from `"react-router"`, `verbatimModuleSyntax` and `erasableSyntaxOnly` on.
- Server tests use `node:test` under `server/test/`.
- Commit messages: imperative subject, no prefix. End every commit message with:
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BxXovJBHEBSQVrspo5Wc4G
  ```
- Work continues on the `community` branch.
- Prose in comments and docs: no em dashes, say what the code does.

---

## File structure

```
shared/editor.ts             new: questionId, renumber, blankQuestion, switchType, move,
                             withOption, addOption, removeOption
shared/validate.ts           reject blank multiple-choice options
server/test/editor.test.ts   new
server/test/validate.test.ts one more case
src/components/Editor.tsx    new
src/pages/Publish.tsx        Upload | Editor tabs, Download YAML
```

---

### Task 1: Question model and the blank-option rule

**Files:**
- Create: `shared/editor.ts`, `server/test/editor.test.ts`
- Modify: `shared/validate.ts`, `server/test/validate.test.ts`

**Interfaces:**
- Produces: `questionId(index): string`, `renumber(questions): Question[]`, `blankQuestion(index): MCQuestion`, `switchType(q, type): Question`, `move<T>(items, from, delta): T[]`, `withOption(q, index, text): MCQuestion`, `addOption(q): MCQuestion`, `removeOption(q, index): MCQuestion`.

- [ ] **Step 1: Write the failing tests**

Create `server/test/editor.test.ts`:

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { addOption, blankQuestion, move, questionId, removeOption, renumber, switchType, withOption } from "../../shared/editor.ts";
import type { MCQuestion, Question } from "../../shared/types.ts";

const mc: MCQuestion = { id: "X", type: "mc", prompt: "p", options: ["a", "b", "c"], answer: 2, explanation: "why" };

describe("editor model", () => {
  it("numbers ids by position", () => {
    assert.equal(questionId(0), "Q001");
    assert.equal(questionId(41), "Q042");
    const out = renumber([{ ...mc, id: "zzz" }, { id: "1", type: "tf", prompt: "t", answer: true }]);
    assert.deepEqual(out.map((q) => q.id), ["Q001", "Q002"]);
  });

  it("makes a blank multiple-choice question", () => {
    assert.deepEqual(blankQuestion(2), { id: "Q003", type: "mc", prompt: "", options: ["", ""], answer: 0 });
  });

  it("switches type while keeping prompt and explanation", () => {
    const tf = switchType(mc, "tf");
    assert.deepEqual(tf, { id: "X", prompt: "p", explanation: "why", type: "tf", answer: true });
    const back = switchType(tf, "mc");
    assert.deepEqual(back, { id: "X", prompt: "p", explanation: "why", type: "mc", options: ["", ""], answer: 0 });
    assert.equal(switchType(mc, "mc"), mc);
  });

  it("moves items and clamps at the ends", () => {
    const items: Question[] = [mc, { ...mc, id: "Y" }, { ...mc, id: "Z" }];
    assert.deepEqual(move(items, 2, -1).map((q) => q.id), ["X", "Z", "Y"]);
    assert.deepEqual(move(items, 0, -1).map((q) => q.id), ["X", "Y", "Z"]);
    assert.deepEqual(move(items, 2, 5).map((q) => q.id), ["X", "Y", "Z"]);
    assert.equal(move(items, 1, 0), items);
  });

  it("edits options and keeps the answer pointing at the same text", () => {
    assert.deepEqual(withOption(mc, 1, "B").options, ["a", "B", "c"]);
    assert.deepEqual(addOption(mc).options, ["a", "b", "c", ""]);
    const dropFirst = removeOption(mc, 0);
    assert.deepEqual(dropFirst.options, ["b", "c"]);
    assert.equal(dropFirst.answer, 1);
    const dropAnswer = removeOption(mc, 2);
    assert.deepEqual(dropAnswer.options, ["a", "b"]);
    assert.equal(dropAnswer.answer, 0);
    const two: MCQuestion = { ...mc, options: ["a", "b"], answer: 1 };
    assert.equal(removeOption(two, 0), two);
  });
});
```

Add to `server/test/validate.test.ts`, inside the `parseQuestionsFromText` describe:

```ts
  it("rejects blank multiple-choice options", () => {
    assert.throws(
      () => parseQuestionsFromText(`- metadata:\n    name: x\n- id: Q1\n  type: mc\n  prompt: p\n  options: ["a", " "]\n  answer: 0`),
      /options must not be blank/
    );
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test server/test/editor.test.ts server/test/validate.test.ts`
Expected: `editor.test.ts` fails to load (module missing); the new validate case fails because no error is thrown.

- [ ] **Step 3: Create shared/editor.ts**

```ts
import type { MCQuestion, Question } from "./types.ts";

export function questionId(index: number): string {
  return `Q${String(index + 1).padStart(3, "0")}`;
}

/** Ids follow position: Q001, Q002, ... */
export function renumber(questions: Question[]): Question[] {
  return questions.map((q, i) => ({ ...q, id: questionId(i) }));
}

export function blankQuestion(index: number): MCQuestion {
  return { id: questionId(index), type: "mc", prompt: "", options: ["", ""], answer: 0 };
}

/** Changes a question's type. Keeps id, prompt, and explanation; the answer starts over. */
export function switchType(q: Question, type: "mc" | "tf"): Question {
  if (q.type === type) return q;
  const base = { id: q.id, prompt: q.prompt, explanation: q.explanation };
  return type === "mc" ? { ...base, type: "mc", options: ["", ""], answer: 0 } : { ...base, type: "tf", answer: true };
}

/** Moves the item at `from` by `delta` positions, clamped to the array. Returns the same array when nothing moves. */
export function move<T>(items: T[], from: number, delta: number): T[] {
  const to = Math.min(Math.max(from + delta, 0), items.length - 1);
  if (to === from) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function withOption(q: MCQuestion, index: number, text: string): MCQuestion {
  return { ...q, options: q.options.map((o, i) => (i === index ? text : o)) };
}

export function addOption(q: MCQuestion): MCQuestion {
  return { ...q, options: [...q.options, ""] };
}

/** Drops an option and keeps `answer` on the same text. Refuses to go below two options. */
export function removeOption(q: MCQuestion, index: number): MCQuestion {
  if (q.options.length <= 2) return q;
  const options = q.options.filter((_, i) => i !== index);
  const answer = q.answer === index ? 0 : q.answer > index ? q.answer - 1 : q.answer;
  return { ...q, options, answer };
}
```

- [ ] **Step 4: Add the blank-option rule to shared/validate.ts**

In `validateQuizData`, inside the `q.type === "mc"` branch, after the `q.options.length < 2` check and before the `typeof q.answer !== "number"` check, add:

```ts
      if (q.options.some((o: unknown) => String(o).trim() === "")) {
        errors.push(`MC Question ${questionNum}: options must not be blank`);
        continue;
      }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, every suite. Then `npx tsc -p tsconfig.server.json` and `npx tsc -p tsconfig.json` clean.

- [ ] **Step 6: Commit**

```bash
git add shared/editor.ts shared/validate.ts server/test/editor.test.ts server/test/validate.test.ts
git commit -m "Add the question editor model and reject blank options

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BxXovJBHEBSQVrspo5Wc4G"
```

---

### Task 2: Editor component and publish page tabs

**Files:**
- Create: `src/components/Editor.tsx`
- Modify: `src/pages/Publish.tsx`

**Interfaces:**
- Consumes: everything from `shared/editor.ts`, `parseQuestionsFromText`, `validateQuizInput`, `dump`.
- Produces: `Editor` with props `{ value: Question[]; onChange: (questions: Question[]) => void }`.

- [ ] **Step 1: Create src/components/Editor.tsx**

```tsx
import type { Question } from "../../shared/types.ts";
import { addOption, blankQuestion, move, removeOption, renumber, switchType, withOption } from "../../shared/editor.ts";

const field = "w-full bg-neutral-950 border border-neutral-800 rounded-xl p-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40";
const small = "rounded-lg px-2 py-1 text-xs bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40";

export function Editor({ value, onChange }: { value: Question[]; onChange: (questions: Question[]) => void }) {
  const emit = (next: Question[]) => onChange(renumber(next));
  const replace = (index: number, q: Question) => emit(value.map((x, j) => (j === index ? q : x)));

  return (
    <div className="space-y-4">
      {value.map((q, i) => (
        <div key={q.id} className="bg-neutral-950 border border-neutral-800 rounded-xl p-4" data-question={q.id}>
          <div className="flex items-center justify-between gap-2 mb-3">
            <span className="text-xs text-neutral-400">{q.id}</span>
            <div className="flex gap-1">
              <select
                value={q.type}
                onChange={(e) => replace(i, switchType(q, e.target.value as "mc" | "tf"))}
                aria-label="Question type"
                className="rounded-lg bg-neutral-800 px-2 py-1 text-xs"
              >
                <option value="mc">Multiple choice</option>
                <option value="tf">True / false</option>
              </select>
              <button type="button" onClick={() => emit(move(value, i, -1))} disabled={i === 0} aria-label="Move up" className={small}>
                ↑
              </button>
              <button type="button" onClick={() => emit(move(value, i, 1))} disabled={i === value.length - 1} aria-label="Move down" className={small}>
                ↓
              </button>
              <button type="button" onClick={() => emit(value.filter((_, j) => j !== i))} aria-label="Delete question" className={`${small} text-red-300`}>
                Delete
              </button>
            </div>
          </div>
          <textarea
            value={q.prompt}
            onChange={(e) => replace(i, { ...q, prompt: e.target.value })}
            placeholder="Question prompt"
            aria-label="Prompt"
            rows={2}
            className={field}
          />
          {q.type === "mc" ? (
            <div className="mt-2 space-y-2">
              {q.options.map((opt, k) => (
                <div key={k} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name={`correct-${q.id}`}
                    checked={q.answer === k}
                    onChange={() => replace(i, { ...q, answer: k })}
                    aria-label={`Option ${k + 1} is correct`}
                    className="accent-emerald-500"
                  />
                  <input
                    value={opt}
                    onChange={(e) => replace(i, withOption(q, k, e.target.value))}
                    placeholder={`Option ${k + 1}`}
                    aria-label={`Option ${k + 1}`}
                    className={field}
                  />
                  <button type="button" onClick={() => replace(i, removeOption(q, k))} disabled={q.options.length <= 2} aria-label={`Remove option ${k + 1}`} className={small}>
                    ×
                  </button>
                </div>
              ))}
              <button type="button" onClick={() => replace(i, addOption(q))} className={small}>
                Add option
              </button>
            </div>
          ) : (
            <div className="mt-2 flex gap-4 text-sm">
              {[true, false].map((v) => (
                <label key={String(v)} className="flex items-center gap-2">
                  <input type="radio" name={`tf-${q.id}`} checked={q.answer === v} onChange={() => replace(i, { ...q, answer: v })} className="accent-emerald-500" />
                  {v ? "True" : "False"}
                </label>
              ))}
            </div>
          )}
          <input
            value={q.explanation ?? ""}
            onChange={(e) => replace(i, { ...q, explanation: e.target.value || undefined })}
            placeholder="Explanation (optional)"
            aria-label="Explanation"
            className={`${field} mt-2`}
          />
        </div>
      ))}
      <button type="button" onClick={() => emit([...value, blankQuestion(value.length)])} className="rounded-xl px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-sm">
        Add question
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Add the tabs, editor, and download to src/pages/Publish.tsx**

Change the imports at the top to:

```tsx
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { dump } from "js-yaml";
import type { Question } from "../../shared/types.ts";
import { parseQuestionsFromText, validateQuizInput, type QuizInput } from "../../shared/validate.ts";
import { blankQuestion } from "../../shared/editor.ts";
import { createQuiz, getQuiz, publishQuiz, updateQuiz } from "../api.ts";
import { getTemplate } from "../templates.ts";
import { useMe } from "../me.tsx";
import { ErrorBox } from "../components/ErrorBox.tsx";
import { TagInput } from "../components/TagInput.tsx";
import { Editor } from "../components/Editor.tsx";
```

Add two state lines after `const [count, setCount] = useState<number | null>(null);`:

```tsx
  const [mode, setMode] = useState<"upload" | "editor">("upload");
  const [questions, setQuestions] = useState<Question[]>([]);
```

In the edit-load effect, after `setText(dump(...))`, add `setQuestions(q.questions);`.

Add these functions after `onFile`:

```tsx
  /** The full document: metadata first, then the questions. Used for the upload tab and the download. */
  function documentFor(qs: Question[]): unknown[] {
    const metadata: Record<string, unknown> = { name: title.trim() || "Untitled quiz" };
    if (description.trim()) metadata.description = description.trim();
    if (tags.length) metadata.tags = tags;
    return [{ metadata }, ...qs];
  }

  function switchMode(next: "upload" | "editor") {
    if (next === mode) return;
    setError(null);
    if (next === "editor") {
      if (text.trim()) {
        try {
          const parsed = parseQuestionsFromText(text);
          setQuestions(parsed.questions);
          if (!title) setTitle(parsed.metadata.name);
        } catch (e) {
          setError((e as Error).message);
          return;
        }
      } else if (questions.length === 0) {
        setQuestions([blankQuestion(0)]);
      }
    } else {
      setText(dump(documentFor(questions), { lineWidth: -1 }));
      setCount(questions.length);
    }
    setMode(next);
  }

  function downloadYaml() {
    const blob = new Blob([dump(documentFor(questions), { lineWidth: -1 })], { type: "application/yaml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(title.trim() || "quiz").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "quiz"}.yaml`;
    a.click();
    URL.revokeObjectURL(url);
  }
```

Replace `buildInput` with:

```tsx
  function buildInput(): QuizInput | null {
    try {
      if (mode === "editor") {
        return validateQuizInput({ title, description, tags, questions });
      }
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
```

Replace the block from the `Questions (YAML or JSON)` label through the closing `</div>` of the upload-buttons row with:

```tsx
      <div className="mt-4 flex items-center gap-2">
        <span className="text-sm text-neutral-300">Questions</span>
        <div className="ml-auto flex rounded-xl bg-neutral-950 border border-neutral-800 p-0.5 text-sm">
          {(["upload", "editor"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => switchMode(m)}
              aria-pressed={mode === m}
              className={`rounded-lg px-3 py-1 ${mode === m ? "bg-neutral-800 text-white" : "text-neutral-400 hover:text-neutral-200"}`}
            >
              {m === "upload" ? "Upload" : "Editor"}
            </button>
          ))}
        </div>
      </div>

      {mode === "upload" ? (
        <>
          <p className="text-xs text-neutral-500 mt-2 mb-2">
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
        </>
      ) : (
        <div className="mt-2">
          <Editor
            value={questions}
            onChange={(qs) => {
              setQuestions(qs);
              setError(null);
            }}
          />
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
            <button type="button" onClick={downloadYaml} disabled={questions.length === 0} className={`${btn} bg-neutral-800 hover:bg-neutral-700`}>
              Download YAML
            </button>
            <span className="text-neutral-400">
              {questions.length} question{questions.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>
      )}
```

Everything else on the page (title, description, tags, error box, save buttons) stays as it is.

- [ ] **Step 3: Build and lint**

Run: `npm run build` (clean) and `npm run lint` (zero errors).

- [ ] **Step 4: Commit**

```bash
git add src/components/Editor.tsx src/pages/Publish.tsx
git commit -m "Add the in-app question editor with YAML download

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BxXovJBHEBSQVrspo5Wc4G"
```

---

### Task 3: Phase 3 checklist

Run by the controller with the headless checklist script. Each must pass before the phase is called done:

1. On New quiz, insert the YAML template and switch to Editor: two rows appear, `Q001` and `Q002`, with the template's prompts and options loaded.
2. Add question: a third row `Q003` appears with two blank options. Fill the prompt and options, add a third option, mark it correct.
3. Move `Q003` up: it becomes `Q002` and the old second question becomes `Q003`. Delete `Q001`: the rows renumber to `Q001`, `Q002`.
4. Switch to Upload: the textarea holds YAML that contains the edited prompt. Switch back to Editor: the same rows come back.
5. Download YAML: the file name ends in `.yaml` and the content contains the edited prompt.
6. With a blank option, Publish shows "options must not be blank". Fix it, set a title, Publish: the quiz page shows the question count and the quiz plays in the edited order.
7. Editing a published quiz opens with its questions in the editor tab after switching.
8. `npm test` passes, `npm run build` and `npm run lint` are clean.
