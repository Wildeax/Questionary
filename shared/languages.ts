/** Languages a quiz can be written in. Keys are ISO 639-1 codes, values are the names shown in the UI. */
export const LANGUAGES: Record<string, string> = {
  en: "English",
  es: "Español",
  pt: "Português",
  fr: "Français",
  de: "Deutsch",
  it: "Italiano",
  nl: "Nederlands",
  pl: "Polski",
  tr: "Türkçe",
  ru: "Русский",
  uk: "Українська",
  ja: "日本語",
  ko: "한국어",
  zh: "中文",
  ar: "العربية",
  hi: "हिन्दी",
};

export const DEFAULT_LANGUAGE = "en";

export function isLanguage(code: unknown): code is string {
  return typeof code === "string" && Object.prototype.hasOwnProperty.call(LANGUAGES, code);
}

export function languageName(code: string): string {
  return isLanguage(code) ? LANGUAGES[code] : code;
}
