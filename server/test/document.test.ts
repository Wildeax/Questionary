import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { dump } from "js-yaml";
import { quizDocument, slugify } from "../../shared/document.ts";
import { parseQuestionsFromText } from "../../shared/validate.ts";
import type { Question } from "../../shared/types.ts";

describe("quiz document", () => {
  it("round-trips through the parser, including a question without an explanation", () => {
    const questions: Question[] = [
      { id: "Q001", type: "mc", prompt: "Pick B", options: ["A", "B"], answer: 1, explanation: "B" },
      { id: "Q002", type: "tf", prompt: "Yes", answer: true, explanation: undefined },
    ];
    const text = dump(quizDocument({ name: "Round trip", description: "d", tags: ["a", "b"] }, questions), { lineWidth: -1 });
    const parsed = parseQuestionsFromText(text);
    assert.equal(parsed.metadata.name, "Round trip");
    assert.equal(parsed.metadata.description, "d");
    assert.deepEqual(parsed.metadata.tags, ["a", "b"]);
    assert.deepEqual(parsed.questions, [
      { id: "Q001", type: "mc", prompt: "Pick B", options: ["A", "B"], answer: 1, explanation: "B" },
      { id: "Q002", type: "tf", prompt: "Yes", answer: true, explanation: undefined },
    ]);
  });

  it("leaves empty optional metadata out of the document", () => {
    const [head] = quizDocument({ name: "n", description: undefined, tags: [] }, []) as [{ metadata: Record<string, unknown> }];
    assert.deepEqual(head.metadata, { name: "n" });
  });

  it("slugifies titles", () => {
    assert.equal(slugify("Unity: Basics!"), "unity-basics");
    assert.equal(slugify("   "), "quiz");
  });
});
