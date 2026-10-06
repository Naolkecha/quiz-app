"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAuth, useHeaderAction } from "@/components/app-shell";
import { ApiError, listChallenges, listRecentResults, myAttempt, myChallengeEntry } from "@/lib/api";
import { getCategoryMeta } from "@/lib/categories";
import { useI18n, type Language } from "@/lib/i18n";
import type { AttemptView, ChallengeEntry, TodayChallenge } from "@/lib/types";

const REFRESH_MS = 5000;

type HomeRow = {
  challenge: TodayChallenge;
  entry: ChallengeEntry | null;
  attempt: AttemptView | null;
};

function formatEtb(value: string): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return value;
  }
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(amount);
}

function localizedGreeting(name: string | null, lang: Language): string {
  const hour = new Date().getHours();
  if (lang === "am") {
    const timeGreeting = hour < 12 ? "እንደምን አደሩ" : hour < 17 ? "እንደምን ዋሉ" : "እንደምን አመሹ";
    return name ? `${timeGreeting}፣ ${name}` : timeGreeting;
  }
  if (lang === "om") {
    const timeGreeting = hour < 12 ? "Akkam bultan" : hour < 17 ? "Akkam ooltan" : "Akkam bultan";
    return name ? `${timeGreeting}, ${name}` : timeGreeting;
  }
  const hello = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  return name ? `${hello}, ${name}` : hello;
}

export default function HomePage() {
  const { state, devAuthEnabled, signInDevelopment, error: authError } = useAuth();
  const { t, language } = useI18n();
  const sessionToken = state.status === "ready" ? state.sessionToken : null;
  const [rows, setRows] = useState<HomeRow[] | null>(null);
  const [completedRows, setCompletedRows] = useState<HomeRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const inFlight = useRef(false);

  const reload = useCallback(
    async (manual: boolean) => {
      if (inFlight.current) {
        return;
      }
      inFlight.current = true;
      if (manual) {
        setRefreshing(true);
      }
      try {
        const [challenges, completedChallenges] = await Promise.all([
          listChallenges(),
          listRecentResults().catch(() => []),
        ]);
        const detailed = await Promise.all(
          challenges.map(async (challenge) => {
            const [entry, attempt] = sessionToken
              ? await Promise.all([
                  myChallengeEntry(challenge.id, sessionToken),
                  myAttempt(challenge.id, sessionToken),
                ])
              : [null, null];
            return { challenge, entry, attempt };
          }),
        );
        const detailedCompleted = await Promise.all(
          completedChallenges.map(async (challenge) => {
            const [entry, attempt] = sessionToken
              ? await Promise.all([
                  myChallengeEntry(challenge.id, sessionToken),
                  myAttempt(challenge.id, sessionToken),
                ])
              : [null, null];
            return { challenge, entry, attempt };
          }),
        );
        setRows(detailed);
        setCompletedRows(detailedCompleted);
        setError(null);
      } catch (caught: unknown) {
        setError(caught instanceof ApiError ? caught.message : "Could not load the challenges.");
        setRows((current) => current ?? []);
        setCompletedRows((current) => current ?? []);
      } finally {
        inFlight.current = false;
        if (manual) {
          setRefreshing(false);
        }
      }
    },
    [sessionToken],
  );

  const refresh = useCallback(() => {
    void reload(true);
  }, [reload]);

  useHeaderAction({
    label: refreshing ? t("header.updating") : t("header.refresh"),
    disabled: refreshing,
    onClick: refresh,
  });

  useEffect(() => {
    if (state.status === "loading") {
      return;
    }
    const run = () => {
      if (document.visibilityState !== "hidden") {
        void reload(false);
      }
    };
    run();
    const id = window.setInterval(run, REFRESH_MS);
    document.addEventListener("visibilitychange", run);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", run);
    };
  }, [reload, state.status]);

  const firstName = state.status === "ready" ? state.user.first_name : null;
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  const availableCategories = useMemo(() => {
    const set = new Set<string>(["all"]);
    for (const r of rows ?? []) {
      if (r.challenge.category) {
        set.add(r.challenge.category.toLowerCase().trim());
      } else {
        set.add("general");
      }
    }
    return Array.from(set);
  }, [rows]);

  const filteredRows = useMemo(() => {
    if (selectedCategory === "all") return rows ?? [];
    return (rows ?? []).filter((r) => {
      const cat = (r.challenge.category || "general").toLowerCase().trim();
      return cat === selectedCategory.toLowerCase();
    });
  }, [rows, selectedCategory]);

  const filteredCompleted = useMemo(() => {
    if (selectedCategory === "all") return completedRows ?? [];
    return (completedRows ?? []).filter((r) => {
      const cat = (r.challenge.category || "general").toLowerCase().trim();
      return cat === selectedCategory.toLowerCase();
    });
  }, [completedRows, selectedCategory]);

  const free = filteredRows
    .filter((row) => row.challenge.is_free)
    .sort((a, b) => (a.challenge.max_participants ?? 0) - (b.challenge.max_participants ?? 0));
  const paid = filteredRows.filter((row) => !row.challenge.is_free);
  const firstChallenge = (paid[0] ?? free[0])?.challenge;
  const heroFacts = {
    questions: firstChallenge ? String(firstChallenge.question_count) : "10",
    duration: firstChallenge ? `${firstChallenge.duration_seconds}s` : "30s",
  };

  return (
    <div className="space-y-6">
      <section className="game-hero rise relative overflow-hidden rounded-[2rem] bg-[var(--foreground)] px-5 py-5 text-[var(--background)] shadow-[0_20px_50px_rgba(28,25,21,0.16)]">
        <div className="absolute -right-7 -top-9 h-28 w-28 rounded-full border border-white/10" />
        <div className="absolute -right-1 top-4 h-14 w-14 rounded-full border border-white/10" />
        <p className="text-xs font-medium opacity-65">{localizedGreeting(firstName, language)}</p>
        <div className="relative mt-3 flex items-end justify-between gap-4">
          <div>
            <h2 className="max-w-56 text-2xl font-semibold leading-7 tracking-tight">
              {t("home.heroTitle")}
            </h2>
            <p className="mt-2 text-sm leading-5 opacity-65">
              {t("home.heroSubtitle")}
            </p>
          </div>
          <div className="float-token flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-2xl shadow-lg">
            ✦
          </div>
        </div>
        <div className="relative mt-5 grid grid-cols-3 gap-2 text-center">
          <HeroFact value={heroFacts.questions} label={t("home.questions")} />
          <HeroFact value={heroFacts.duration} label={t("home.onTheClock")} />
          <HeroFact value="1st" label={t("home.takesPrize")} />
        </div>
      </section>

      {/* Daily Lucky Spin Banner */}
      <Link
        href="/spin"
        className="press relative flex items-center justify-between gap-3 overflow-hidden rounded-3xl bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 p-4 text-white shadow-md transition-all"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-md text-2xl shadow-inner">
            🎡
          </div>
          <div>
            <span className="inline-block rounded-full bg-white/25 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
              {t("spin.freeDaily")}
            </span>
            <h3 className="text-sm font-bold leading-tight mt-0.5">{t("spin.bannerTitle")}</h3>
            <p className="text-[11px] text-white/85 line-clamp-1">{t("spin.bannerSub")}</p>
          </div>
        </div>
        <div className="shrink-0 flex h-7 w-7 items-center justify-center rounded-full bg-white text-gray-900 font-bold text-xs shadow">
          →
        </div>
      </Link>

      {/* Category selector filter pills */}
      {availableCategories.length > 1 ? (
        <section className="-mx-5 flex gap-1.5 overflow-x-auto px-5 pb-1">
          {availableCategories.map((catKey) => {
            const meta = getCategoryMeta(catKey);
            const active = selectedCategory === catKey;
            return (
              <button
                key={catKey}
                type="button"
                onClick={() => setSelectedCategory(catKey)}
                className={`press flex items-center gap-1.5 shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
                  active
                    ? "bg-[var(--foreground)] text-[var(--background)] shadow-sm"
                    : "bg-[var(--card)] text-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
              >
                <span>{meta.icon}</span>
                <span>{meta.name[language] || meta.name.en}</span>
              </button>
            );
          })}
        </section>
      ) : null}

      {state.status === "anonymous" && devAuthEnabled ? (
        <section className="rounded-2xl bg-[var(--card)] px-4 py-4">
          <p className="text-sm leading-6">
            You are outside Telegram. You can look around as the sample player.
          </p>
          <button
            type="button"
            onClick={() => void signInDevelopment()}
            className="press mt-3 h-10 rounded-full bg-[var(--foreground)] px-4 text-sm font-medium text-[var(--background)]"
          >
            Continue
          </button>
        </section>
      ) : null}
      {authError ? <p className="text-sm text-[var(--accent)]">{authError}</p> : null}
      {error ? <p className="text-sm text-[var(--accent)]">{error}</p> : null}

      {rows === null ? (
        <div className="space-y-3">
          <div className="h-36 animate-pulse rounded-3xl bg-black/5" />
          <div className="h-44 animate-pulse rounded-3xl bg-black/5" />
        </div>
      ) : rows.length === 0 ? (
        <section className="rounded-3xl bg-[var(--card)] px-5 py-8">
          <h2 className="text-xl font-semibold">{t("home.nothingOpen")}</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            {t("home.checkBack")}
          </p>
        </section>
      ) : (
        <>
          {free.length > 0 ? (
            <section>
              <div className="flex items-end justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight">{t("home.pickPrize")}</h2>
                  <p className="mt-0.5 text-sm text-[var(--muted)]">{t("home.freeToEnter")}</p>
                </div>
                <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-800">
                  {t("home.live")}
                </span>
              </div>
              <ul className="mt-3 grid grid-cols-3 gap-2">
                {free.map((row, index) => (
                  <li
                    key={row.challenge.id}
                    className="rise"
                    style={{ animationDelay: `${index * 70}ms` }}
                  >
                    <FreeRoundLink row={row} index={index} />
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-center text-xs leading-5 text-[var(--muted)]">
                {t("home.highestScoreWins")}
              </p>
            </section>
          ) : null}

          {paid.length > 0 ? (
            <section>
              <h2 className="text-base font-semibold">{t("home.mainChallenge")}</h2>
              <p className="mt-1 text-sm leading-5 text-[var(--muted)]">
                {t("home.readyForMore")}
              </p>
              <ul className="mt-3 space-y-3">
                {paid.map((row) => (
                  <li key={row.challenge.id}>
                    <ChallengeLink
                      challenge={row.challenge}
                      entry={row.entry}
                      attempt={row.attempt}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {filteredCompleted && filteredCompleted.length > 0 ? (
            <section className="space-y-3 pt-1">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold flex items-center gap-1.5">
                    <span>🏆</span> {t("home.recentResults")}
                  </h2>
                  <p className="mt-0.5 text-xs text-[var(--muted)]">
                    {t("home.recentResultsSubtitle")}
                  </p>
                </div>
                <span className="rounded-full bg-black/5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[var(--muted)]">
                  {t("home.completed")}
                </span>
              </div>
              <ul className="space-y-2.5">
                {filteredCompleted.map((row) => (
                  <li key={row.challenge.id}>
                    <CompletedChallengeLink row={row} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

function CompletedChallengeLink({ row }: { row: HomeRow }) {
  const { t, language } = useI18n();
  const { challenge, entry, attempt } = row;
  const winner = challenge.winner_name;
  const categoryMeta = challenge.category ? getCategoryMeta(challenge.category) : null;

  return (
    <Link
      href={`/challenges/${challenge.id}`}
      onPointerDown={tapFeedback}
      className="press block rounded-3xl bg-[var(--card)] p-4 shadow-[0_8px_24px_rgba(28,25,21,0.05)] border border-black/5 hover:border-[var(--accent)] transition-all"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h3 className="truncate text-sm font-semibold">{challenge.title}</h3>
            {categoryMeta ? (
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${categoryMeta.accentBg} ${categoryMeta.accentText}`}>
                {categoryMeta.icon} {categoryMeta.name[language] || categoryMeta.name.en}
              </span>
            ) : null}
            <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-800">
              {t("home.completed")}
            </span>
          </div>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {winner ? (
              <span className="font-semibold text-emerald-700">🏆 {t("challenge.wonBy", { name: winner })}</span>
            ) : (
              <span>Concluded</span>
            )}
            {" · "}
            {challenge.participant_count} {t("home.players")}
          </p>
        </div>
        <div className="text-right shrink-0">
          <span className="text-sm font-bold tabular-nums text-[var(--foreground)]">
            {formatEtb(challenge.current_prize_etb)} {t("common.etb")}
          </span>
          <p className="text-[10px] text-[var(--muted)]">{t("home.prizePool")}</p>
        </div>
      </div>

      {attempt?.status === "finished" ? (
        <div className="mt-3 flex items-center justify-between rounded-2xl bg-amber-500/10 px-3 py-2 text-xs">
          <span className="font-medium text-amber-900">Your standing</span>
          <span className="font-bold text-amber-950">
            {attempt.rank ? `#${attempt.rank} Rank` : "Finished"} · {attempt.score ?? 0}/{attempt.question_count}
          </span>
        </div>
      ) : entry ? (
        <div className="mt-3 flex items-center justify-between rounded-2xl bg-black/5 px-3 py-2 text-xs text-[var(--muted)]">
          <span>You joined this challenge</span>
          <span className="font-semibold text-[var(--accent)]">View Leaderboard →</span>
        </div>
      ) : (
        <div className="mt-2.5 flex items-center justify-end text-[11px] font-semibold text-[var(--accent)]">
          <span>View final standings →</span>
        </div>
      )}
    </Link>
  );
}

function HeroFact({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl bg-white/8 px-1 py-2.5">
      <p className="text-sm font-semibold">{value}</p>
      <p className="mt-0.5 text-[9px] font-medium uppercase tracking-wide opacity-55">{label}</p>
    </div>
  );
}

function tapFeedback() {
  navigator.vibrate?.(12);
}

function FreeRoundLink({ row, index }: { row: HomeRow; index: number }) {
  const { t } = useI18n();
  const { challenge, entry, attempt } = row;
  const seats = challenge.max_participants ?? 0;
  const taken = challenge.participant_count;
  const left = challenge.spots_left ?? Math.max(seats - taken, 0);
  const progress = Math.max(5, Math.min(100, (taken / Math.max(seats, 1)) * 100));
  const status =
    attempt?.status === "finished"
      ? t("home.done")
      : attempt?.status === "in_progress"
        ? t("home.resume")
        : entry
          ? t("home.play")
          : left === 0
            ? t("home.full")
            : t("home.play");
  const themes = [
    "from-emerald-50 to-teal-100 text-emerald-950",
    "from-amber-50 to-orange-100 text-amber-950",
    "from-violet-50 to-fuchsia-100 text-violet-950",
  ];
  const barThemes = ["bg-emerald-500", "bg-amber-500", "bg-violet-500"];

  return (
    <Link
      href={`/challenges/${challenge.id}`}
      onPointerDown={tapFeedback}
      className={`press prize-card flex min-h-40 flex-col overflow-hidden rounded-3xl bg-gradient-to-br p-3 ${themes[index % themes.length]}`}
    >
      <div className="flex items-start justify-between gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide opacity-55">{t("home.win")}</span>
        <span className="text-xs opacity-45">✦</span>
      </div>
      <p className="mt-1 text-2xl font-bold tracking-tight tabular-nums">
        {formatEtb(challenge.current_prize_etb)}
      </p>
      <p className="text-[10px] font-semibold uppercase tracking-wide opacity-55">{t("common.etb")}</p>
      <div className="mt-auto pt-4">
        <div className="h-1 overflow-hidden rounded-full bg-black/10">
          <div
            className={`h-full rounded-full transition-[width] duration-500 ${barThemes[index % barThemes.length]}`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="mt-1.5 truncate text-[10px] opacity-60">
          {left === 0 ? t("home.roundFull") : t("home.seatsLeft", { left, total: seats })}
        </p>
        <span className="mt-2 flex h-7 items-center justify-center rounded-full bg-white/65 text-[11px] font-bold shadow-sm">
          {status} <span className="ml-1">→</span>
        </span>
      </div>
    </Link>
  );
}

function ChallengeLink({
  challenge,
  entry,
  attempt,
}: {
  challenge: TodayChallenge;
  entry: ChallengeEntry | null;
  attempt: AttemptView | null;
}) {
  const { t, language } = useI18n();
  const categoryMeta = challenge.category ? getCategoryMeta(challenge.category) : null;
  const note =
    attempt?.status === "finished"
      ? `Score: ${attempt.score ?? 0} / ${attempt.question_count}.`
      : attempt?.status === "in_progress"
        ? t("challenge.resumeQuestions")
        : entry
          ? t("challenge.startQuestions")
          : `${formatEtb(challenge.entry_fee_etb)} ${t("common.etb")} · ${challenge.minimum_participants} ${t("home.needPlayers")}`;
  const joined = challenge.participant_count;
  const needed = challenge.minimum_participants;

  return (
    <Link
      href={`/challenges/${challenge.id}`}
      onPointerDown={tapFeedback}
      className="press relative block overflow-hidden rounded-[2rem] bg-[var(--accent)] px-5 py-5 text-[var(--accent-text)] shadow-[0_18px_40px_rgba(79,70,229,0.18)]"
    >
      <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-white/8" />
      <div className="relative flex items-center justify-between gap-3">
        <p className="text-sm font-medium opacity-85 truncate">{challenge.title}</p>
        <div className="flex items-center gap-1.5 shrink-0">
          {categoryMeta ? (
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold text-white">
              {categoryMeta.icon} {categoryMeta.name[language] || categoryMeta.name.en}
            </span>
          ) : null}
          <span className="rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide">
            {t("home.bigPrize")}
          </span>
        </div>
      </div>
      <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">
        {formatEtb(challenge.current_prize_etb)}
        <span className="ml-1.5 text-base font-medium opacity-65">{t("common.etb")}</span>
      </p>
      <div className="mt-4 h-1 overflow-hidden rounded-full bg-black/15">
        <div
          className="h-full rounded-full bg-white/80 transition-[width] duration-500"
          style={{ width: `${Math.max(joined > 0 ? 6 : 0, Math.min(100, (joined / needed) * 100))}%` }}
        />
      </div>
      <p className="mt-2 text-xs opacity-65">
        {joined} / {needed} {t("home.players")}
      </p>
      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-sm leading-5">{note}</p>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15 text-lg">
          →
        </span>
      </div>
    </Link>
  );
}
