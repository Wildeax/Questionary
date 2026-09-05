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
  const [mode, setMode] = useState<"upload" | "editor">("upload");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [published, setPublished] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !me) window.location.href = "/api/auth/github";
  }, [loading, me]);

  useEffect(() => {
    if (!editing) return;
    let alive = true;
    getQuiz(id!)
      .then((q) => {
        if (!alive) return;
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
        setQuestions(q.questions);
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
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

      <label className="block text-sm text-neutral-300 mt-4 mb-1">Tags</label>
      <TagInput value={tags} onChange={setTags} />

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
