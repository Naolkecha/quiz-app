"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { useAuth } from "@/components/app-shell";
import { ApiError, createDuel, listMyDuels, listOpenDuels } from "@/lib/api";
import type { DuelView } from "@/lib/types";

const STAKE_OPTIONS = [
  { stake: 0, label: "Free (Demo)", prize: "0 ETB" },
  { stake: 5, label: "5 ETB", prize: "9.00 ETB" },
  { stake: 10, label: "10 ETB", prize: "18.00 ETB" },
  { stake: 25, label: "25 ETB", prize: "45.00 ETB" },
  { stake: 50, label: "50 ETB", prize: "90.00 ETB" },
];

const CATEGORIES = [
  { key: "general", label: "General Knowledge", icon: "🧠" },
  { key: "football", label: "Football Mania", icon: "⚽" },
  { key: "history", label: "History & Culture", icon: "🏛️" },
  { key: "science", label: "Science & Tech", icon: "🔬" },
];

export default function DuelsHubPage() {
  const router = useRouter();
  const { state } = useAuth();
  const sessionToken = state.status === "ready" ? state.sessionToken : null;
  const currentUserId = state.status === "ready" ? state.user.id : null;

  const [activeTab, setActiveTab] = useState<"lobby" | "my">("lobby");
  const [openDuels, setOpenDuels] = useState<DuelView[] | null>(null);
  const [myDuels, setMyDuels] = useState<DuelView[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create Duel modal state
  const [showCreate, setShowCreate] = useState(false);
  const [selectedStake, setSelectedStake] = useState(5);
  const [selectedCategory, setSelectedCategory] = useState("general");
  const [creating, setCreating] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [open, mine] = await Promise.all([
        listOpenDuels(sessionToken ?? undefined),
        sessionToken ? listMyDuels(sessionToken) : Promise.resolve([]),
      ]);
      setOpenDuels(open);
      setMyDuels(mine);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }, [sessionToken]);

  useEffect(() => {
    void loadData();
    const interval = setInterval(() => void loadData(), 8000);
    return () => clearInterval(interval);
  }, [loadData]);

  const handleCreateDuel = async () => {
    if (!sessionToken) {
      setError("Please open Challenge from Telegram to create a duel.");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const created = await createDuel(
        { stake_etb: selectedStake, category: selectedCategory },
        sessionToken,
      );
      setShowCreate(false);
      router.push(`/duels/${created.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to create duel.");
      }
    } finally {
      setCreating(false);
    }
  };

  const shareDuel = (duel: DuelView, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const stakeText = Number(duel.stake_etb) > 0 ? `${duel.stake_etb} ETB` : "Free";
    const text = `⚔️ I created a 1v1 Quiz Duel (${stakeText})! Can you beat my score? Tap to battle:`;
    const shareUrl = `https://t.me/share/url?url=https://t.me/Ethioquiz_bot/app?startapp=duel_${duel.id}&text=${encodeURIComponent(text)}`;
    window.open(shareUrl, "_blank");
  };

  return (
    <div className="space-y-5 pb-8">
      {/* Header Banner */}
      <section className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-indigo-900 via-purple-900 to-slate-900 p-5 text-white shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-[11px] font-bold tracking-wide uppercase text-amber-300">
              <span>⚔️</span> 1v1 Battle Arena
            </span>
            <h1 className="mt-2 text-2xl font-black tracking-tight">Challenge a Friend</h1>
            <p className="mt-1 text-xs text-white/80 leading-relaxed max-w-xs">
              Pick your stake, answer 5 fast questions, and challenge a friend or the lobby. Winner takes the pot!
            </p>
          </div>
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/10 backdrop-blur-md text-3xl shadow-inner">
            ⚡
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="press mt-4 w-full h-11 rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 font-bold text-gray-950 text-sm shadow-lg flex items-center justify-center gap-2"
        >
          <span>⚔️</span> Create New Duel
        </button>
      </section>

      {error ? (
        <div className="rounded-2xl bg-rose-500/10 p-3 text-xs text-rose-500 border border-rose-500/20">
          {error}
        </div>
      ) : null}

      {/* Tabs */}
      <div className="grid grid-cols-2 gap-1 rounded-2xl bg-black/5 p-1">
        <button
          type="button"
          onClick={() => setActiveTab("lobby")}
          className={`h-9 rounded-xl text-xs font-bold transition-all ${
            activeTab === "lobby"
              ? "bg-[var(--card)] text-[var(--foreground)] shadow-sm"
              : "text-[var(--muted)] hover:text-[var(--foreground)]"
          }`}
        >
          Open Lobby ({openDuels?.length ?? 0})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("my")}
          className={`h-9 rounded-xl text-xs font-bold transition-all ${
            activeTab === "my"
              ? "bg-[var(--card)] text-[var(--foreground)] shadow-sm"
              : "text-[var(--muted)] hover:text-[var(--foreground)]"
          }`}
        >
          My Duels ({myDuels?.length ?? 0})
        </button>
      </div>

      {/* Content */}
      {activeTab === "lobby" ? (
        <div className="space-y-3">
          {openDuels === null ? (
            <div className="space-y-2">
              <div className="h-20 animate-pulse rounded-2xl bg-black/5" />
              <div className="h-20 animate-pulse rounded-2xl bg-black/5" />
            </div>
          ) : openDuels.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-black/10 p-8 text-center">
              <span className="text-3xl">⚔️</span>
              <h3 className="mt-2 text-sm font-bold">No Open Duels Right Now</h3>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Be the first to create a duel and challenge other players!
              </p>
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="press mt-3 h-9 px-4 rounded-full bg-[var(--foreground)] text-[var(--background)] text-xs font-semibold"
              >
                Create Duel
              </button>
            </div>
          ) : (
            openDuels.map((duel) => {
              const isMine = currentUserId && duel.creator.id === currentUserId;
              const stakeAmount = Number(duel.stake_etb);
              return (
                <Link
                  key={duel.id}
                  href={`/duels/${duel.id}`}
                  className="press flex items-center justify-between gap-3 rounded-2xl bg-[var(--card)] p-4 shadow-sm border border-black/5 hover:border-black/10 transition-all"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-black text-sm shadow">
                      ⚔️
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold truncate">{duel.creator.first_name}</span>
                        {isMine ? (
                          <span className="rounded bg-indigo-100 px-1.5 py-0.2 text-[9px] font-bold text-indigo-700">
                            YOU
                          </span>
                        ) : null}
                      </div>
                      <p className="text-[11px] text-[var(--muted)] capitalize">
                        {duel.category} • 5 Questions
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="block text-xs font-black text-emerald-600">
                      {stakeAmount > 0 ? `Win ${duel.prize_etb} ETB` : "Free Play"}
                    </span>
                    <span className="inline-block mt-1 rounded-full bg-[var(--foreground)] px-3 py-1 text-[10px] font-bold text-[var(--background)]">
                      {isMine ? "View" : "Accept ⚔️"}
                    </span>
                  </div>
                </Link>
              );
            })
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {myDuels === null ? (
            <div className="space-y-2">
              <div className="h-20 animate-pulse rounded-2xl bg-black/5" />
            </div>
          ) : myDuels.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-black/10 p-8 text-center">
              <span className="text-3xl">🛡️</span>
              <h3 className="mt-2 text-sm font-bold">No Duels Played Yet</h3>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Create a duel and send the link to your friends!
              </p>
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="press mt-3 h-9 px-4 rounded-full bg-[var(--foreground)] text-[var(--background)] text-xs font-semibold"
              >
                Start a Duel
              </button>
            </div>
          ) : (
            myDuels.map((duel) => {
              const isCreator = currentUserId && duel.creator.id === currentUserId;
              const hasOpponent = duel.opponent !== null;
              const isWinner = currentUserId && duel.winner && duel.winner.id === currentUserId;
              const isLoser = duel.status === "completed" && !duel.is_tie && !isWinner;

              return (
                <Link
                  key={duel.id}
                  href={`/duels/${duel.id}`}
                  className="press block rounded-2xl bg-[var(--card)] p-4 shadow-sm border border-black/5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold capitalize">{duel.category} Duel</span>
                      {duel.status === "completed" ? (
                        isWinner ? (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                            🏆 WON
                          </span>
                        ) : duel.is_tie ? (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                            🤝 TIE
                          </span>
                        ) : (
                          <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-800">
                            ❌ LOST
                          </span>
                        )
                      ) : (
                        <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-800 animate-pulse">
                          ⏳ WAITING OPPONENT
                        </span>
                      )}
                    </div>
                    <span className="text-xs font-bold text-[var(--muted)]">
                      Stake: {Number(duel.stake_etb) > 0 ? `${duel.stake_etb} ETB` : "Free"}
                    </span>
                  </div>

                  <div className="mt-3 flex items-center justify-between text-xs border-t border-black/5 pt-2">
                    <div>
                      <span className="text-[var(--muted)] text-[10px]">Opponent: </span>
                      <span className="font-semibold">
                        {hasOpponent
                          ? isCreator
                            ? duel.opponent?.first_name
                            : duel.creator.first_name
                          : "Waiting for someone to join..."}
                      </span>
                    </div>

                    {duel.status === "waiting_opponent" ? (
                      <button
                        type="button"
                        onClick={(e) => shareDuel(duel, e)}
                        className="press rounded-full bg-indigo-600 px-3 py-1 text-[10px] font-bold text-white shadow"
                      >
                        📲 Share Link
                      </button>
                    ) : (
                      <span className="font-bold text-xs">
                        {isCreator
                          ? `${duel.creator_score}/5 vs ${duel.opponent_score}/5`
                          : `${duel.opponent_score}/5 vs ${duel.creator_score}/5`}
                      </span>
                    )}
                  </div>
                </Link>
              );
            })
          )}
        </div>
      )}

      {/* Create Duel Modal */}
      {showCreate ? (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-[2rem] bg-[var(--background)] p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black tracking-tight">Create 1v1 Duel</h2>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="h-8 w-8 rounded-full bg-black/5 text-xs font-bold"
              >
                ✕
              </button>
            </div>

            {/* Stake selection */}
            <div>
              <label className="block text-xs font-bold text-[var(--muted)] uppercase tracking-wider mb-2">
                Choose Stake
              </label>
              <div className="grid grid-cols-3 gap-2">
                {STAKE_OPTIONS.map((opt) => {
                  const active = selectedStake === opt.stake;
                  return (
                    <button
                      key={opt.stake}
                      type="button"
                      onClick={() => setSelectedStake(opt.stake)}
                      className={`press p-2.5 rounded-2xl text-center border transition-all ${
                        active
                          ? "bg-[var(--foreground)] text-[var(--background)] border-transparent shadow"
                          : "bg-[var(--card)] border-black/5 hover:border-black/20"
                      }`}
                    >
                      <span className="block text-xs font-bold">{opt.label}</span>
                      <span className="block text-[10px] opacity-75 mt-0.5">Win {opt.prize}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Category selection */}
            <div>
              <label className="block text-xs font-bold text-[var(--muted)] uppercase tracking-wider mb-2">
                Select Category
              </label>
              <div className="grid grid-cols-2 gap-2">
                {CATEGORIES.map((cat) => {
                  const active = selectedCategory === cat.key;
                  return (
                    <button
                      key={cat.key}
                      type="button"
                      onClick={() => setSelectedCategory(cat.key)}
                      className={`press flex items-center gap-2 p-2.5 rounded-2xl text-left border transition-all ${
                        active
                          ? "bg-indigo-50 border-indigo-500 text-indigo-950 font-bold"
                          : "bg-[var(--card)] border-black/5 text-xs font-medium"
                      }`}
                    >
                      <span className="text-base">{cat.icon}</span>
                      <span className="text-xs truncate">{cat.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              type="button"
              disabled={creating}
              onClick={() => void handleCreateDuel()}
              className="press w-full h-12 rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 font-bold text-gray-950 text-sm shadow-lg flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {creating ? "Setting up..." : "⚡ Play My Turn (5 Questions)"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
