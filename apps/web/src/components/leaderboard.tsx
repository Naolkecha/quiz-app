"use client";

import { useI18n } from "@/lib/i18n";
import type { AttemptView, LeaderboardEntry } from "@/lib/types";

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

function readableName(displayName: string): string {
  const match = /^(.*) \(@[^)]+\)$/.exec(displayName);
  return match?.[1] || displayName;
}

export function YourResult({ attempt }: { attempt: AttemptView }) {
  const { t } = useI18n();

  return (
    <div className="flex items-end justify-between gap-3 border-t border-black/10 pt-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
          {t("leaderboard.yourScore")}
        </p>
        <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">
          {attempt.score ?? 0}
          <span className="text-lg font-medium text-[var(--muted)]">
            {" "}
            / {attempt.question_count}
          </span>
        </p>
      </div>
      <p className="pb-1 text-right text-sm text-[var(--muted)]">
        <span className="block font-semibold text-[var(--foreground)]">
          {attempt.rank ? `#${attempt.rank}` : "Saved"}
        </span>
        {seconds(attempt.elapsed_ms ?? 0)}
      </p>
    </div>
  );
}

export function Leaderboard({ rows, you }: { rows: LeaderboardEntry[]; you: string | null }) {
  const { t } = useI18n();

  return (
    <section className="rounded-3xl bg-[var(--card)] px-5 py-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
          {t("leaderboard.title")}
        </h2>
        <p className="text-xs text-[var(--muted)]">
          {rows.length === 0 ? t("leaderboard.noFinishes") : t("leaderboard.finishedCount", { count: rows.length })}
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
          {t("leaderboard.emptyDesc")}
        </p>
      ) : (
        <ol className="mt-3">
          {rows.map((row) => {
            const mine = row.user_id === you;
            return (
              <li
                key={row.user_id}
                className={`flex items-center gap-3 border-t border-black/10 py-3 text-sm first:border-t-0 ${
                  mine ? "rounded-2xl bg-[#f7f4ee] px-2" : ""
                }`}
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums ${
                    row.rank === 1
                      ? "bg-amber-100 text-amber-800"
                      : row.rank === 2
                        ? "bg-stone-200 text-stone-700"
                        : row.rank === 3
                          ? "bg-orange-100 text-orange-800"
                          : "text-[var(--muted)]"
                  }`}
                >
                  {row.rank}
                </span>
                <span className={`min-w-0 flex-1 truncate ${mine ? "font-semibold" : ""}`}>
                  {readableName(row.display_name)}
                  {mine ? (
                    <span className="ml-2 text-xs font-medium text-[var(--accent)]">{t("leaderboard.you")}</span>
                  ) : null}
                </span>
                <span className="shrink-0 tabular-nums text-[var(--muted)]">
                  {row.score}
                  <span className="text-[var(--muted)]"> · {seconds(row.elapsed_ms)}</span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
