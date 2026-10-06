"use client";

import type { ReactNode } from "react";

import { getCategoryMeta } from "@/lib/categories";
import { useI18n } from "@/lib/i18n";
import type { TodayChallenge } from "@/lib/types";

function formatEtb(value: string): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return value;
  }
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(amount);
}

export function ChallengeCard({
  challenge,
  action,
}: {
  challenge: TodayChallenge;
  action?: ReactNode;
}) {
  const { t, language } = useI18n();
  const categoryMeta = challenge.category ? getCategoryMeta(challenge.category) : null;
  const joined = challenge.participant_count;
  const needed = challenge.max_participants ?? challenge.minimum_participants;
  const progress = Math.min(1, needed === 0 ? 1 : joined / needed);

  const statusText = challenge.winner_name
    ? t("challenge.wonBy", { name: challenge.winner_name })
    : challenge.status === "completed"
      ? t("challenge.completed")
      : challenge.is_free
        ? challenge.spots_left === 0
          ? t("challenge.fullResults")
          : t("challenge.joinedSeatsLeft", { joined, needed, left: challenge.spots_left ?? 0 })
        : challenge.is_confirmed
          ? t("challenge.confirmedWith", { joined })
          : t("challenge.toConfirm", { joined, needed });

  return (
    <article className="rise overflow-hidden rounded-3xl bg-[var(--card)] shadow-[0_16px_40px_rgba(28,25,21,0.08)]">
      <div className="h-1.5 bg-[var(--accent)]" />
      <div className="space-y-5 px-5 py-5">
        <div>
          {categoryMeta ? (
            <div className="mb-2">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${categoryMeta.accentBg} ${categoryMeta.accentText}`}>
                <span>{categoryMeta.icon}</span>
                <span>{categoryMeta.name[language] || categoryMeta.name.en}</span>
              </span>
            </div>
          ) : null}
          <h2 className="text-[1.65rem] font-semibold leading-8 tracking-tight">{challenge.title}</h2>
          <p className="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
            {challenge.is_free ? t("home.winnerGets") : t("home.prizePool")}
          </p>
          <p className="mt-1 text-4xl font-semibold tracking-tight tabular-nums">
            {formatEtb(challenge.current_prize_etb)}
            <span className="ml-1 text-lg font-medium text-[var(--muted)]">{t("common.etb")}</span>
          </p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {statusText}
          </p>
          <div
            className="mt-3 h-1.5 overflow-hidden rounded-full bg-black/10"
            role="meter"
            aria-valuenow={Math.min(joined, needed)}
            aria-valuemin={0}
            aria-valuemax={needed}
            aria-label="Players toward the confirmed prize"
          >
            <div
              className="h-full bg-[var(--accent)] transition-[width] duration-500"
              style={{ width: `${Math.max(progress * 100, joined > 0 ? 4 : 0)}%` }}
            />
          </div>
        </div>

        <ul className="grid grid-cols-3 gap-2 text-center">
          <Fact
            label={t("home.entry")}
            value={
              Number(challenge.entry_fee_etb) > 0
                ? `${formatEtb(challenge.entry_fee_etb)} ${t("common.etb")}`
                : t("common.free")
            }
          />
          <Fact label={t("home.questions")} value={String(challenge.question_count)} />
          <Fact label={t("home.time")} value={`${challenge.duration_seconds}s`} />
        </ul>

        {action}
      </div>
    </article>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <li className="rounded-2xl bg-[#f7f4ee] px-2 py-2.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-sm font-semibold tabular-nums">{value}</p>
    </li>
  );
}
