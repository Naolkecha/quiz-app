"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { useAuth } from "@/components/app-shell";
import { ApiError, getDuel, playCreatorDuel, playOpponentDuel } from "@/lib/api";
import type { DuelAnswerInput, DuelView } from "@/lib/types";

export default function DuelDetailPage() {
  const params = useParams();
  const router = useRouter();
  const duelId = String(params.id);

  const { state } = useAuth();
  const sessionToken = state.status === "ready" ? state.sessionToken : null;
  const currentUserId = state.status === "ready" ? state.user.id : null;

  const [duel, setDuel] = useState<DuelView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Gameplay state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<DuelAnswerInput[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const startTimeRef = useRef<number>(0);
  const [elapsed, setElapsed] = useState(0);

  const loadDuel = useCallback(async () => {
    if (!sessionToken) return;
    try {
      const data = await getDuel(duelId, sessionToken);
      setDuel(data);
      // If creator and hasn't played, auto-start quiz
      if (data.my_role === "creator" && !data.has_played) {
        setIsPlaying(true);
        startTimeRef.current = Date.now();
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to load duel.");
      }
    } finally {
      setLoading(false);
    }
  }, [duelId, sessionToken]);

  useEffect(() => {
    void loadDuel();
  }, [loadDuel]);

  // Polling for completed duel if waiting
  useEffect(() => {
    if (!duel || duel.status !== "waiting_opponent" || isPlaying) return;
    const interval = setInterval(() => {
      void loadDuel();
    }, 4000);
    return () => clearInterval(interval);
  }, [duel, isPlaying, loadDuel]);

  // Timer loop during gameplay
  useEffect(() => {
    if (!isPlaying) return;
    const timer = setInterval(() => {
      setElapsed((Date.now() - startTimeRef.current) / 1000);
    }, 100);
    return () => clearInterval(timer);
  }, [isPlaying]);

  const handleSelectChoice = async (choiceId: string) => {
    if (!duel) return;
    const currentQ = duel.questions[currentIndex];
    const newAnswers = [...answers, { question_id: currentQ.id, selected_choice_id: choiceId }];
    setAnswers(newAnswers);

    if (currentIndex + 1 < duel.questions.length) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      // Finished all 5 questions -> submit!
      setIsPlaying(false);
      setSubmitting(true);
      const totalTime = Math.max(1, Math.round(((Date.now() - startTimeRef.current) / 1000) * 100) / 100);

      try {
        if (!sessionToken) throw new Error("No session");
        let updated: DuelView;
        if (duel.my_role === "creator") {
          updated = await playCreatorDuel(duel.id, { answers: newAnswers, time_seconds: totalTime }, sessionToken);
        } else {
          updated = await playOpponentDuel(duel.id, { answers: newAnswers, time_seconds: totalTime }, sessionToken);
        }
        setDuel(updated);
      } catch (err) {
        if (err instanceof ApiError) {
          setError(err.message);
        } else {
          setError("Failed to submit answers.");
        }
      } finally {
        setSubmitting(false);
      }
    }
  };

  const startOpponentPlay = () => {
    setIsPlaying(true);
    setCurrentIndex(0);
    setAnswers([]);
    startTimeRef.current = Date.now();
  };

  const shareDuel = () => {
    if (!duel) return;
    const stakeText = Number(duel.stake_etb) > 0 ? `${duel.stake_etb} ETB` : "Free";
    const text = `⚔️ I scored ${duel.creator_score}/5 in a 1v1 Quiz Duel (${stakeText})! Can you beat me? Tap to battle:`;
    const shareUrl = `https://t.me/share/url?url=https://t.me/Ethioquiz_bot/app?startapp=duel_${duel.id}&text=${encodeURIComponent(text)}`;
    window.open(shareUrl, "_blank");
  };

  if (loading) {
    return (
      <div className="space-y-4 pt-10 text-center">
        <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
        <p className="text-xs text-[var(--muted)] font-medium">Entering Duel Arena...</p>
      </div>
    );
  }

  if (error && !duel) {
    return (
      <div className="space-y-4 pt-10 text-center">
        <span className="text-4xl">⚠️</span>
        <h2 className="text-base font-bold">{error}</h2>
        <Link href="/duels" className="inline-block rounded-full bg-[var(--foreground)] px-4 py-2 text-xs font-bold text-[var(--background)]">
          Back to Lobby
        </Link>
      </div>
    );
  }

  if (!duel) return null;

  // Active Quiz Playing Screen
  if (isPlaying) {
    const q = duel.questions[currentIndex];
    const progressPercent = ((currentIndex + 1) / duel.questions.length) * 100;

    return (
      <div className="space-y-5 pt-2 pb-8">
        {/* Progress & Timer Bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-bold">
            <span className="text-[var(--muted)]">Question {currentIndex + 1} of {duel.questions.length}</span>
            <span className="flex items-center gap-1 text-amber-500 font-mono text-sm">
              ⏱ {elapsed.toFixed(1)}s
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-black/10">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 to-amber-500 transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Question Card */}
        <div className="rounded-3xl bg-[var(--card)] p-6 shadow-md border border-black/5 min-h-36 flex items-center justify-center text-center">
          <h2 className="text-lg font-bold leading-snug tracking-tight">{q.prompt}</h2>
        </div>

        {/* Choices */}
        <div className="space-y-2.5">
          {q.choices.map((c, idx) => {
            const letter = String.fromCharCode(65 + idx);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => void handleSelectChoice(c.id)}
                className="press flex w-full items-center gap-3 rounded-2xl bg-[var(--card)] p-4 text-left border border-black/5 hover:border-indigo-500 shadow-sm transition-all"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-black/5 text-xs font-bold">
                  {letter}
                </span>
                <span className="text-sm font-semibold flex-1">{c.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (submitting) {
    return (
      <div className="space-y-4 pt-16 text-center">
        <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" />
        <h2 className="text-base font-bold">Calculating Scores & Settle...</h2>
      </div>
    );
  }

  // Completed Duel: Head-to-Head Celebration
  if (duel.status === "completed") {
    const isWinner = currentUserId && duel.winner && duel.winner.id === currentUserId;
    const isLoser = !duel.is_tie && !isWinner;

    return (
      <div className="space-y-6 pt-4 pb-8">
        <div className="text-center space-y-1">
          {isWinner ? (
            <>
              <span className="text-5xl">🏆</span>
              <h1 className="text-2xl font-black text-emerald-600">VICTORY!</h1>
              <p className="text-xs text-[var(--muted)]">You won this 1v1 battle!</p>
              {Number(duel.prize_etb) > 0 ? (
                <div className="inline-block mt-2 rounded-2xl bg-emerald-100 px-4 py-1.5 text-sm font-black text-emerald-800">
                  +{duel.prize_etb} ETB Credited to Wallet
                </div>
              ) : null}
            </>
          ) : duel.is_tie ? (
            <>
              <span className="text-5xl">🤝</span>
              <h1 className="text-2xl font-black text-amber-600">DRAW GAME!</h1>
              <p className="text-xs text-[var(--muted)]">Equal score and time. Stakes were refunded.</p>
            </>
          ) : (
            <>
              <span className="text-5xl">❌</span>
              <h1 className="text-2xl font-black text-rose-600">DEFEATED</h1>
              <p className="text-xs text-[var(--muted)]">Better luck next time! Challenge them to a rematch.</p>
            </>
          )}
        </div>

        {/* Head-to-Head Cards */}
        <div className="grid grid-cols-2 gap-3">
          {/* Creator */}
          <div className={`rounded-2xl p-4 text-center border ${
            duel.winner?.id === duel.creator.id ? "bg-emerald-50 border-emerald-300" : "bg-[var(--card)] border-black/5"
          }`}>
            <div className="text-xs font-bold text-[var(--muted)] truncate">
              {duel.creator.first_name} {duel.creator.id === currentUserId ? "(You)" : ""}
            </div>
            <div className="mt-2 text-3xl font-black">{duel.creator_score}/5</div>
            <div className="mt-1 text-[11px] font-mono text-[var(--muted)]">{duel.creator_time_seconds}s</div>
            {duel.winner?.id === duel.creator.id ? (
              <span className="inline-block mt-2 rounded-full bg-emerald-600 px-2 py-0.5 text-[9px] font-bold text-white">
                WINNER
              </span>
            ) : null}
          </div>

          {/* Opponent */}
          <div className={`rounded-2xl p-4 text-center border ${
            duel.winner?.id === duel.opponent?.id ? "bg-emerald-50 border-emerald-300" : "bg-[var(--card)] border-black/5"
          }`}>
            <div className="text-xs font-bold text-[var(--muted)] truncate">
              {duel.opponent?.first_name} {duel.opponent?.id === currentUserId ? "(You)" : ""}
            </div>
            <div className="mt-2 text-3xl font-black">{duel.opponent_score}/5</div>
            <div className="mt-1 text-[11px] font-mono text-[var(--muted)]">{duel.opponent_time_seconds}s</div>
            {duel.winner?.id === duel.opponent?.id ? (
              <span className="inline-block mt-2 rounded-full bg-emerald-600 px-2 py-0.5 text-[9px] font-bold text-white">
                WINNER
              </span>
            ) : null}
          </div>
        </div>

        <div className="space-y-2 pt-2">
          <Link
            href="/duels"
            className="press flex h-12 w-full items-center justify-center rounded-2xl bg-[var(--foreground)] text-[var(--background)] font-bold text-sm shadow"
          >
            Play Another Duel
          </Link>
        </div>
      </div>
    );
  }

  // Waiting for Opponent Screen (Creator has played)
  if (duel.my_role === "creator" && duel.has_played) {
    return (
      <div className="space-y-6 pt-6 pb-8 text-center">
        <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-full bg-amber-100 text-3xl animate-bounce">
          ⚔️
        </div>

        <div>
          <h1 className="text-xl font-black tracking-tight">Your Score: {duel.creator_score}/5</h1>
          <p className="text-xs font-mono text-amber-600 mt-1">Completed in {duel.creator_time_seconds}s</p>
          <p className="mt-3 text-xs text-[var(--muted)] max-w-xs mx-auto">
            Now send this challenge link to a friend or into a Telegram group. The first person to accept will play the exact same 5 questions!
          </p>
        </div>

        <div className="rounded-3xl bg-[var(--card)] p-5 border border-black/5 text-left space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-[var(--muted)]">Category:</span>
            <span className="font-bold capitalize">{duel.category}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-[var(--muted)]">Stake:</span>
            <span className="font-bold">{Number(duel.stake_etb) > 0 ? `${duel.stake_etb} ETB` : "Free"}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-[var(--muted)]">Prize:</span>
            <span className="font-bold text-emerald-600">{Number(duel.prize_etb) > 0 ? `${duel.prize_etb} ETB` : "Free"}</span>
          </div>
        </div>

        <div className="space-y-2">
          <button
            type="button"
            onClick={shareDuel}
            className="press flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 font-bold text-white text-sm shadow-lg"
          >
            <span>📲</span> Share to Telegram Chat / Group
          </button>
          <Link
            href="/duels"
            className="press flex h-11 w-full items-center justify-center rounded-2xl bg-black/5 font-semibold text-xs text-[var(--muted)]"
          >
            Back to Duel Lobby
          </Link>
        </div>
      </div>
    );
  }

  // Opponent View (Invited player opens the link to accept & battle!)
  return (
    <div className="space-y-6 pt-6 pb-8 text-center">
      <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-3xl text-white shadow-lg">
        ⚔️
      </div>

      <div>
        <h1 className="text-xl font-black tracking-tight">{duel.creator.first_name} Challenged You!</h1>
        <p className="mt-1 text-xs text-[var(--muted)]">
          5 questions • Fastest and highest score wins the pot!
        </p>
      </div>

      <div className="rounded-3xl bg-[var(--card)] p-5 border border-black/5 text-left space-y-3">
        <div className="flex justify-between text-xs">
          <span className="text-[var(--muted)]">Category:</span>
          <span className="font-bold capitalize">{duel.category}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-[var(--muted)]">Stake to Match:</span>
          <span className="font-bold">{Number(duel.stake_etb) > 0 ? `${duel.stake_etb} ETB` : "Free"}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-[var(--muted)]">Winner Takes:</span>
          <span className="font-black text-emerald-600 text-sm">{Number(duel.prize_etb) > 0 ? `${duel.prize_etb} ETB` : "Demo Play"}</span>
        </div>
      </div>

      <button
        type="button"
        onClick={startOpponentPlay}
        className="press flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 font-black text-gray-950 text-base shadow-xl"
      >
        <span>⚔️</span> Accept & Start Battle (5 Qs)
      </button>
    </div>
  );
}
