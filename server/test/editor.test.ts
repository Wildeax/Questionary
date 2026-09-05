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
