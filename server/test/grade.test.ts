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
