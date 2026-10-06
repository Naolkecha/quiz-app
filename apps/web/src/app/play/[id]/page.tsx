"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { useAuth } from "@/components/app-shell";
import { QuizPanel } from "@/components/quiz-panel";
import { ApiError, getChallenge } from "@/lib/api";
import type { TodayChallenge } from "@/lib/types";

export default function PlayChallengePage() {
  const params = useParams<{ id: string }>();
  const challengeId = params.id;
  const router = useRouter();
  const { state, devAuthEnabled, signInDevelopment } = useAuth();
  const [challenge, setChallenge] = useState<TodayChallenge | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!challengeId) return;
    let cancelled = false;
    getChallenge(challengeId)
      .then((value) => { if (!cancelled) setChallenge(value); })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof ApiError ? caught.message : "Could not load the challenge.");
          setChallenge(null);
        }
      });
    return () => { cancelled = true; };
  }, [challengeId]);

  const finished = useCallback(
    () => router.replace(`/challenges/${challengeId}`),
    [challengeId, router],
  );

  if (state.status === "loading") {
    return <div className="h-48 animate-pulse rounded-3xl bg-black/5" />;
  }

  if (state.status === "anonymous") {
    return (
      <section className="rounded-3xl bg-[var(--card)] px-5 py-6 space-y-3">
        <p className="text-sm leading-6 text-[var(--muted)]">
          {devAuthEnabled
            ? "Sign in to play this challenge."
            : "Open Challenge from the Telegram bot to play."}
        </p>
        {devAuthEnabled ? (
          <button
            type="button"
            onClick={() => void signInDevelopment()}
            className="press h-11 w-full rounded-full bg-[var(--accent)] text-sm font-semibold text-[var(--accent-text)]"
          >
            Continue as development user
          </button>
        ) : null}
        <Link
          href={challengeId ? `/challenges/${challengeId}` : "/"}
          className="block text-center text-sm font-semibold"
        >
          Back to challenge
        </Link>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      {error ? <p className="text-sm text-[var(--accent)]">{error}</p> : null}
      {challenge === undefined ? (
        <div className="h-48 animate-pulse rounded-3xl bg-black/5" />
      ) : challenge === null ? (
        <section className="rounded-3xl bg-[var(--card)] px-5 py-8">
          <h1 className="text-2xl font-semibold">This challenge is not open</h1>
          <Link href={`/challenges/${challengeId}`} className="mt-4 inline-block text-sm font-semibold">
            Back to challenge
          </Link>
        </section>
      ) : (
        <QuizPanel challenge={challenge} onFinished={finished} />
      )}
    </div>
  );
}
