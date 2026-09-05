import { useEffect, useState } from "react";
import type { TagCount } from "../../shared/types.ts";
import { MAX_TAGS, normalizeTags } from "../../shared/validate.ts";
import { getTags } from "../api.ts";

const chip = "inline-flex items-center gap-1 rounded-md bg-neutral-800 px-2 py-0.5 text-sm";

export function TagInput({ value, onChange }: { value: string[]; onChange: (tags: string[]) => void }) {
  const [text, setText] = useState("");
  const [suggestions, setSuggestions] = useState<TagCount[]>([]);
  const [error, setError] = useState<string | null>(null);
  const full = value.length >= MAX_TAGS;

  useEffect(() => {
    const q = text.trim().toLowerCase();
    if (q.length < 2) {
      setSuggestions([]);
      return;
    }
    let alive = true;
    getTags(q)
      .then((tags) => alive && setSuggestions(tags.filter((t) => !value.includes(t.tag))))
      .catch(() => alive && setSuggestions([]));
    return () => {
      alive = false;
    };
  }, [text, value]);

  function add(raw: string) {
    try {
      onChange(normalizeTags([...value, raw]));
      setText("");
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {value.map((t) => (
            <span key={t} className={chip}>
              {t}
              <button type="button" onClick={() => onChange(value.filter((x) => x !== t))} aria-label={`Remove ${t}`} className="text-neutral-400 hover:text-white">
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        value={text}
        disabled={full}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === ",") && text.trim()) {
            e.preventDefault();
            add(text);
          }
        }}
        placeholder={full ? `Up to ${MAX_TAGS} tags` : "Add a tag and press Enter"}
        aria-label="Add a tag"
        className="w-full bg-neutral-950 border border-neutral-800 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:opacity-50"
      />
      {suggestions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button key={s.tag} type="button" onClick={() => add(s.tag)} className={`${chip} hover:bg-neutral-700`}>
              {s.tag} <span className="text-neutral-500">{s.count}</span>
            </button>
          ))}
        </div>
      )}
      {error && <p className="mt-1 text-sm text-red-400">{error}</p>}
    </div>
  );
}
