import type { Language } from "./i18n";

export type CategoryMeta = {
  id: string;
  icon: string;
  name: Record<Language, string>;
  accentBg: string;
  accentText: string;
};

export const CATEGORIES: Record<string, CategoryMeta> = {
  all: {
    id: "all",
    icon: "✨",
    name: {
      en: "All Topics",
      am: "ሁሉም ርዕሶች",
      om: "Mata-dureewwan Hunda",
    },
    accentBg: "bg-black/5",
    accentText: "text-[var(--foreground)]",
  },
  general: {
    id: "general",
    icon: "🧠",
    name: {
      en: "General",
      am: "አጠቃላይ",
      om: "Waliigala",
    },
    accentBg: "bg-blue-500/10",
    accentText: "text-blue-800",
  },
  history: {
    id: "history",
    icon: "📜",
    name: {
      en: "History",
      am: "ታሪክ",
      om: "Seenaa",
    },
    accentBg: "bg-amber-500/10",
    accentText: "text-amber-800",
  },
  football: {
    id: "football",
    icon: "⚽",
    name: {
      en: "Football",
      am: "እግር ኳስ",
      om: "Kubbaa Miilaa",
    },
    accentBg: "bg-emerald-500/10",
    accentText: "text-emerald-800",
  },
  science: {
    id: "science",
    icon: "🔬",
    name: {
      en: "Science",
      am: "ሳይንስ",
      om: "Saayinsii",
    },
    accentBg: "bg-purple-500/10",
    accentText: "text-purple-800",
  },
  language: {
    id: "language",
    icon: "📚",
    name: {
      en: "Language",
      am: "ቋንቋ",
      om: "Afaan",
    },
    accentBg: "bg-rose-500/10",
    accentText: "text-rose-800",
  },
  geography: {
    id: "geography",
    icon: "🌍",
    name: {
      en: "Geography",
      am: "ጂኦግራፊ",
      om: "Joogiraafii",
    },
    accentBg: "bg-teal-500/10",
    accentText: "text-teal-800",
  },
};

export function getCategoryMeta(categoryId?: string | null): CategoryMeta {
  if (!categoryId) {
    return CATEGORIES.general;
  }
  const key = categoryId.toLowerCase().trim();
  if (CATEGORIES[key]) {
    return CATEGORIES[key];
  }
  // Fallback for custom categories
  const capitalized = key.charAt(0).toUpperCase() + key.slice(1);
  return {
    id: key,
    icon: "🎯",
    name: {
      en: capitalized,
      am: capitalized,
      om: capitalized,
    },
    accentBg: "bg-black/5",
    accentText: "text-[var(--foreground)]",
  };
}
