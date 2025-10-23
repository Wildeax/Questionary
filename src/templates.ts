// -------------------- Templates --------------------

export function getTemplate(kind: "json" | "yaml") {
  if (kind === "json") {
    return `[
  {
    "id": "q1",
    "type": "mc",
    "prompt": "<your question here>",
    "options": ["A", "B", "C", "D"],
    "answer": 0,
    "explanation": "<optional explanation>"
  },
  {
    "id": "q2",
    "type": "tf",
    "prompt": "<your true/false statement here>",
    "answer": true
  }
]`;
  }
  return `- id: q1
  type: mc
  prompt: "<your question here>"
  options: ["A", "B", "C", "D"]
  answer: 0
  explanation: "<optional explanation>"
- id: q2
  type: tf
  prompt: "<your true/false statement here>"
  answer: true`;
}
