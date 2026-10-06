"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { useAuth, useHeaderAction } from "@/components/app-shell";
import { ChallengeCard } from "@/components/challenge-card";
import { JoinDialog } from "@/components/join-dialog";
import { Leaderboard, YourResult } from "@/components/leaderboard";
import {
  ApiError,
  challengeLeaderboard,
  getChallenge,
  myAttempt,
  myChallengeEntry,
} from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type {
  AttemptView,
  ChallengeEntry,
  LeaderboardEntry,
  TodayChallenge,
} from "@/lib/types";

const REFRESH_MS = 5000;

export default function ChallengePage() {
  const params = useParams<{ id: string }>();
  const challengeId = params.id;
  const router = useRouter();
  const { state } = useAuth();
  const { t } = useI18n();
  const sessionToken = state.status === "ready" ? state.sessionToken : null;
  const [challenge, setChallenge] = useState<TodayChallenge | null | undefined>(undefined);
  const [entry, setEntry] = useState<ChallengeEntry | null>(null);
  const [attempt, setAttempt] = useState<AttemptView | null>(null);
  const [board, setBoard] = useState<LeaderboardEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const inFlight = useRef(false);

  const reload = useCallback(
    async (manual: boolean) => {
      if (!challengeId || inFlight.current) {
        return;
      }
      inFlight.current = true;
      if (manual) {
        setRefreshing(true);
      }
      try {
        const today = await getChallenge(challengeId);
        setChallenge(today);
        setError(null);
        if (!today) {
          setBoard([]);
          setAttempt(null);
          return;
        }
        const [rows, mine, membership] = await Promise.all([
          challengeLeaderboard(today.id),
          sessionToken ? myAttempt(today.id, sessionToken) : Promise.resolve(null),
          sessionToken ? myChallengeEntry(today.id, sessionToken) : Promise.resolve(null),
        ]);
        setBoard(rows);
        setAttempt(mine);
        setEntry(membership);
      } catch (caught: unknown) {
        setError(caught instanceof ApiError ? caught.message : "Could not load this challenge.");
        setChallenge((current) => (current === undefined ? null : current));
      } finally {
        inFlight.current = false;
        if (manual) {
          setRefreshing(false);
        }
      }
    },
    [challengeId, sessionToken],
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

  const you = state.status === "ready" ? state.user.id : null;

  return (
    <div className="space-y-4">
      {error ? <p className="text-sm text-[var(--accent)]">{error}</p> : null}
      {challenge === undefined ? (
        <div className="h-56 animate-pulse rounded-3xl bg-black/5" />
      ) : challenge === null ? (
        <section className="rounded-3xl bg-[var(--card)] px-5 py-8">
          <h1 className="text-2xl font-semibold">{t("challenge.notOpen")}</h1>
        </section>
      ) : (
        <>
          <ChallengeCard
            challenge={challenge}
            action={
              <ChallengeAction
                challenge={challenge}
                signedIn={sessionToken !== null}
                joined={entry !== null}
                attempt={attempt}
                onJoin={() => setJoining(true)}
              />
            }
          />
          <Leaderboard rows={board} you={you} />
        </>
      )}
      {joining && challenge && sessionToken ? (
        <JoinDialog
          challenge={challenge}
          sessionToken={sessionToken}
          onClose={() => setJoining(false)}
          onJoined={(id) => {
            setJoining(false);
            router.push(`/play/${id}`);
          }}
        />
      ) : null}
    </div>
  );
}

function ChallengeAction({
  challenge,
  signedIn,
  joined,
  attempt,
  onJoin,
}: {
  challenge: TodayChallenge;
  signedIn: boolean;
  joined: boolean;
  attempt: AttemptView | null;
  onJoin: () => void;
}) {
  const { t } = useI18n();

  if (!signedIn) {
    return (
      <p className="border-t border-black/10 pt-4 text-sm leading-6 text-[var(--muted)]">
        {t("challenge.openFromBot")}
      </p>
    );
  }
  if (attempt?.status === "finished") {
    return <YourResult attempt={attempt} />;
  }
  if (challenge.status === "completed" || challenge.status === "cancelled") {
    return (
      <div className="border-t border-black/10 pt-4 text-center">
        <span className="inline-flex items-center rounded-full bg-black/5 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
          {challenge.status === "completed" ? t("challenge.completed") : t("challenge.closed")}
        </span>
      </div>
    );
  }
  if (attempt?.status === "in_progress") {
    return (
      <Link
        href={`/play/${challenge.id}`}
        className="press flex h-12 w-full items-center justify-center rounded-full bg-[var(--accent)] text-sm font-semibold text-[var(--accent-text)]"
      >
        {t("challenge.resumeQuestions")}
      </Link>
    );
  }
  if (joined) {
    return (
      <Link
        href={`/play/${challenge.id}`}
        className="press flex h-12 w-full items-center justify-center rounded-full bg-[var(--accent)] text-sm font-semibold text-[var(--accent-text)]"
      >
        {t("challenge.startQuestions")}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={onJoin}
      className="press flex h-12 w-full items-center justify-center rounded-full bg-[var(--accent)] text-sm font-semibold text-[var(--accent-text)]"
    >
      {t("challenge.join")}
    </button>
  );
}
