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
  it("reads an optional language from metadata", () => {
    assert.equal(parseQuestionsFromText(yamlDoc).metadata.language, undefined);
    assert.equal(parseQuestionsFromText(yamlDoc.replace('name: "Sample"', 'name: "Sample"\n    language: PT')).metadata.language, "pt");
    assert.throws(() => parseQuestionsFromText(yamlDoc.replace('name: "Sample"', 'name: "Sample"\n    language: xx')), /Unknown language/);
  });

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

  it("rejects duplicate question ids", () => {
    assert.throws(
      () =>
        parseQuestionsFromText(
          `- metadata:\n    name: x\n- id: Q1\n  type: tf\n  prompt: a\n  answer: true\n- id: Q1\n  type: tf\n  prompt: b\n  answer: false`
        ),
      /duplicate id 'Q1'/
    );
  });

  it("rejects blank multiple-choice options", () => {
    assert.throws(
      () => parseQuestionsFromText(`- metadata:\n    name: x\n- id: Q1\n  type: mc\n  prompt: p\n  options: ["a", " "]\n  answer: 0`),
      /options must not be blank/
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
  it("defaults the language to English and rejects unknown codes", () => {
    assert.equal(validateQuizInput({ title: "t", questions }).language, "en");
    assert.equal(validateQuizInput({ title: "t", questions, language: " ES " }).language, "es");
    assert.throws(() => validateQuizInput({ title: "t", questions, language: "xx" }), /Unknown language/);
  });
});
