"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { useAuth } from "@/components/app-shell";
import {
  ApiError,
  finishAttempt,
  myAttempt,
  myChallengeEntry,
  startAttempt,
} from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { AttemptView, TodayChallenge } from "@/lib/types";

type Phase = "loading" | "idle" | "playing";

export function QuizPanel({
  challenge,
  onFinished,
}: {
  challenge: TodayChallenge;
  onFinished: () => void;
}) {
  const { state } = useAuth();
  const sessionToken = state.status === "ready" ? state.sessionToken : null;
  const [phase, setPhase] = useState<Phase>("loading");
  const [attempt, setAttempt] = useState<AttemptView | null>(null);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const answers = useRef<Record<string, string>>({});
  const submitted = useRef(false);

  const { t } = useI18n();

  const apply = useCallback(
    (value: AttemptView) => {
      if (value.status === "finished") {
        onFinished();
        return;
      }
      setAttempt(value);
      setPhase("playing");
    },
    [onFinished],
  );

  useEffect(() => {
    if (state.status === "loading" || !sessionToken) {
      return;
    }
    let cancelled = false;

    async function load(token: string) {
      try {
        const existing = await myAttempt(challenge.id, token);
        if (cancelled) {
          return;
        }
        if (existing) {
          apply(existing);
          return;
        }
        const entry = await myChallengeEntry(challenge.id, token);
        if (!entry) {
          setPhase("idle");
          return;
        }
        const started = await startAttempt(challenge.id, token);
        if (!cancelled) {
          apply(started);
        }
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof ApiError ? caught.message : "Could not load the round.");
          setPhase("idle");
        }
      }
    }

    void load(sessionToken);
    return () => {
      cancelled = true;
    };
  }, [apply, challenge.id, sessionToken, state.status]);

  const submit = useCallback(async () => {
    if (!sessionToken || !attempt || submitted.current) {
      return;
    }
    submitted.current = true;
    setSubmitting(true);
    setError(null);
    const payload = Object.entries(answers.current).map(([questionId, choiceId]) => ({
      question_id: questionId,
      choice_id: choiceId,
    }));
    try {
      apply(await finishAttempt(challenge.id, sessionToken, payload));
    } catch (caught) {
      submitted.current = false;
      setError(caught instanceof ApiError ? caught.message : "Could not save your score.");
    } finally {
      setSubmitting(false);
    }
  }, [apply, attempt, challenge.id, sessionToken]);

  const shown: Phase = state.status !== "loading" && !sessionToken ? "idle" : phase;

  function choose(questionId: string, choiceId: string) {
    answers.current[questionId] = choiceId;
    const questions = attempt?.questions ?? [];
    if (index >= questions.length - 1) {
      void submit();
      return;
    }
    setIndex((current) => current + 1);
  }

  return (
    <section className="space-y-4">
      {error ? <p className="text-sm text-[var(--accent)]">{error}</p> : null}
      {state.status === "loading" || shown === "loading" ? (
        <div className="h-48 animate-pulse rounded-3xl bg-black/5" />
      ) : null}
      {state.status !== "loading" && shown === "idle" ? (
        <div className="rounded-3xl bg-[var(--card)] px-5 py-6">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
            {t("quiz.notJoined")}
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">{challenge.title}</h1>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            {t("quiz.notJoinedDesc")}
          </p>
          <Link
            href={`/challenges/${challenge.id}`}
            className="mt-5 flex h-12 w-full items-center justify-center rounded-full bg-[var(--foreground)] text-sm font-semibold text-[var(--background)]"
          >
            {t("quiz.backToChallenge")}
          </Link>
        </div>
      ) : null}
      {shown === "playing" && attempt?.questions ? (
        <Playing
          attempt={attempt}
          index={index}
          submitting={submitting}
          onChoose={choose}
          onBack={() => setIndex((current) => Math.max(0, current - 1))}
          onSubmit={() => void submit()}
        />
      ) : null}
    </section>
  );
}

function Playing({
  attempt,
  index,
  submitting,
  onChoose,
  onBack,
  onSubmit,
}: {
  attempt: AttemptView;
  index: number;
  submitting: boolean;
  onChoose: (questionId: string, choiceId: string) => void;
  onBack: () => void;
  onSubmit: () => void;
}) {
  const { t } = useI18n();
  const questions = attempt.questions ?? [];
  const question = questions[index];
  const remaining = useRemaining(attempt.started_at, attempt.server_now, attempt.duration_seconds);
  const fired = useRef(false);

  useEffect(() => {
    if (remaining > 0 || fired.current) {
      return;
    }
    fired.current = true;
    onSubmit();
  }, [onSubmit, remaining]);

  if (!question) {
    return null;
  }

  const secondsLeft = Math.ceil(remaining / 1000);
  const ratio = Math.min(1, remaining / (attempt.duration_seconds * 1000));

  return (
    <div className="space-y-4 rounded-3xl bg-[var(--card)] px-5 py-5 shadow-[0_16px_40px_rgba(28,25,21,0.06)]">
      <div className="flex items-center justify-between text-sm">
        <p className="font-medium">
          {t("quiz.questionOf", { current: index + 1, total: questions.length })}
        </p>
        <p
          className={`rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ${
            secondsLeft <= 5 ? "animate-pulse bg-[var(--accent)] text-[var(--accent-text)]" : "bg-[#f7f4ee]"
          }`}
        >
          {t("quiz.secondsLeft", { seconds: secondsLeft })}
        </p>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-black/10">
        <div
          className="h-full bg-[var(--accent)] transition-[width] duration-200"
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
      <div key={question.id} className="ask space-y-3">
        <h2 className="text-xl font-semibold leading-7">{question.prompt}</h2>
        <div className="space-y-2">
          {question.choices.map((choice, choiceIndex) => (
            <ChoiceButton
              key={choice.id}
              label={choice.label}
              letter={String.fromCharCode(65 + choiceIndex)}
              disabled={submitting}
              onChoose={() => onChoose(question.id, choice.id)}
            />
          ))}
        </div>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={index === 0 || submitting}
          onClick={onBack}
          className="press h-11 flex-1 rounded-full text-sm font-medium disabled:opacity-40"
        >
          {t("quiz.back")}
        </button>
        <button
          type="button"
          disabled={submitting}
          onClick={onSubmit}
          className="press h-11 flex-1 rounded-full bg-[var(--foreground)] text-sm font-medium text-[var(--background)]"
        >
          {submitting ? t("quiz.saving") : t("quiz.finish")}
        </button>
      </div>
    </div>
  );
}

function ChoiceButton({
  label,
  letter,
  disabled,
  onChoose,
}: {
  label: string;
  letter: string;
  disabled: boolean;
  onChoose: () => void;
}) {
  const [picked, setPicked] = useState(false);

  return (
    <button
      type="button"
      disabled={disabled || picked}
      onClick={() => {
        setPicked(true);
        window.setTimeout(onChoose, 140);
      }}
      className={`press flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm font-medium ${
        picked ? "bg-[var(--accent)] text-[var(--accent-text)]" : "bg-[#f7f4ee]"
      }`}
    >
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
          picked ? "bg-white/20" : "bg-white text-[var(--muted)]"
        }`}
      >
        {letter}
      </span>
      {label}
    </button>
  );
}

function useRemaining(startedAt: string, serverNow: string, durationSeconds: number): number {
  const serverTime = new Date(serverNow).getTime();
  const end = new Date(startedAt).getTime() + durationSeconds * 1000;
  const [remaining, setRemaining] = useState(() => Math.max(0, end - serverTime));

  useEffect(() => {
    // The phone clock may be wrong; count from the server's time instead.
    const offset = serverTime - Date.now();
    const tick = () => {
      setRemaining(Math.max(0, end - (Date.now() + offset)));
    };
    const id = window.setInterval(tick, 200);
    return () => window.clearInterval(id);
  }, [end, serverTime]);

  return remaining;
}
