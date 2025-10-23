import type { Question } from "./types";
import { isMC, formatCorrectAnswer, formatUserAnswer } from "./utils";

export interface QuizResult {
  questionNumber: number;
  questionId: string;
  questionText: string;
  questionType: "mc" | "tf";
  userAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
  explanation?: string;
}

// Generate quiz results data
export function generateQuizResults(
  questions: Question[],
  answers: Record<string, number | boolean | undefined>
): QuizResult[] {
  return questions.map((q, idx) => {
    const user = answers[q.id];
    const isCorrect = isMC(q)
      ? typeof user === "number" && user === q.answer
      : typeof user === "boolean" && user === q.answer;

    return {
      questionNumber: idx + 1,
      questionId: q.id,
      questionText: q.prompt,
      questionType: q.type,
      userAnswer: formatUserAnswer(q, user),
      correctAnswer: formatCorrectAnswer(q),
      isCorrect,
      explanation: q.explanation,
    };
  });
}

// Export results as JSON
export function exportAsJSON(results: QuizResult[]): void {
  const dataStr = JSON.stringify(results, null, 2);
  const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);

  const exportFileDefaultName = `unity_certification_results_${new Date().toISOString().split('T')[0]}.json`;

  const linkElement = document.createElement('a');
  linkElement.setAttribute('href', dataUri);
  linkElement.setAttribute('download', exportFileDefaultName);
  linkElement.click();
}

// Export results as CSV
export function exportAsCSV(results: QuizResult[]): void {
  const headers = [
    'Question Number',
    'Question ID',
    'Question Text',
    'Question Type',
    'User Answer',
    'Correct Answer',
    'Is Correct',
    'Explanation'
  ];

  const csvContent = [
    headers.join(','),
    ...results.map(result => [
      result.questionNumber,
      `"${result.questionId}"`,
      `"${result.questionText.replace(/"/g, '""')}"`,
      result.questionType,
      `"${result.userAnswer}"`,
      `"${result.correctAnswer}"`,
      result.isCorrect,
      result.explanation ? `"${result.explanation.replace(/"/g, '""')}"` : ''
    ].join(','))
  ].join('\n');

  const dataUri = 'data:text/csv;charset=utf-8,'+ encodeURIComponent(csvContent);
  const exportFileDefaultName = `unity_certification_results_${new Date().toISOString().split('T')[0]}.csv`;

  const linkElement = document.createElement('a');
  linkElement.setAttribute('href', dataUri);
  linkElement.setAttribute('download', exportFileDefaultName);
  linkElement.click();
}
