"use client";

import { useI18n, type Language } from "@/lib/i18n";

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { language, setLanguage } = useI18n();

  const options: { code: Language; label: string; short: string }[] = [
    { code: "en", label: "English", short: "EN" },
    { code: "am", label: "አማርኛ", short: "አማ" },
    { code: "om", label: "Oromoo", short: "ORO" },
  ];

  if (compact) {
    return (
      <div className="flex items-center rounded-full bg-black/5 p-0.5 text-[10px] font-semibold">
        {options.map((opt) => (
          <button
            key={opt.code}
            type="button"
            onClick={() => setLanguage(opt.code)}
            className={`press rounded-full px-2 py-0.5 transition-all ${
              language === opt.code
                ? "bg-[var(--foreground)] text-[var(--background)] shadow-sm"
                : "text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            {opt.short}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      {options.map((opt) => (
        <button
          key={opt.code}
          type="button"
          onClick={() => setLanguage(opt.code)}
          className={`press flex h-11 flex-col items-center justify-center rounded-2xl border text-xs font-semibold transition-all ${
            language === opt.code
              ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-text)] shadow-sm"
              : "border-black/10 bg-[var(--card)] text-[var(--muted)] hover:border-black/20"
          }`}
        >
          <span>{opt.label}</span>
        </button>
      ))}
    </div>
  );
}
