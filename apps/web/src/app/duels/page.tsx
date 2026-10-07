"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { useAuth } from "@/components/app-shell";
import { ApiError, createDuel, getWallet, listDuelCategories, listMyDuels, listOpenDuels } from "@/lib/api";
import type { DuelCategory, DuelView, Wallet } from "@/lib/types";

const STAKE_OPTIONS = [
  { stake: 0, label: "Free (Demo)", prize: "0 ETB" },
  { stake: 1, label: "1 ETB", prize: "1.80 ETB" },
  { stake: 5, label: "5 ETB", prize: "9.00 ETB" },
  { stake: 10, label: "10 ETB", prize: "18.00 ETB" },
  { stake: 25, label: "25 ETB", prize: "45.00 ETB" },
  { stake: 50, label: "50 ETB", prize: "90.00 ETB" },
];

export default function DuelsHubPage() {
  const router = useRouter();
  const { state } = useAuth();
  const sessionToken = state.status === "ready" ? state.sessionToken : null;
  const currentUserId = state.status === "ready" ? state.user.id : null;

  const [activeTab, setActiveTab] = useState<"lobby" | "my">("lobby");
  const [openDuels, setOpenDuels] = useState<DuelView[] | null>(null);
  const [myDuels, setMyDuels] = useState<DuelView[] | null>(null);
  const [categories, setCategories] = useState<DuelCategory[]>([]);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create Duel modal state
  const [showCreate, setShowCreate] = useState(false);
  const [selectedStake, setSelectedStake] = useState(1);
  const [selectedCategory, setSelectedCategory] = useState("general");
  const [inviteType, setInviteType] = useState<"link" | "username" | "public">("link");
  const [targetUsername, setTargetUsername] = useState("");
  const [creating, setCreating] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [open, mine, userWallet, cats] = await Promise.all([
        listOpenDuels(sessionToken ?? undefined),
        sessionToken ? listMyDuels(sessionToken) : Promise.resolve([]),
        sessionToken ? getWallet(sessionToken).catch(() => null) : Promise.resolve(null),
        listDuelCategories().catch(() => []),
      ]);
      setOpenDuels(open);
      setMyDuels(mine);
      if (userWallet) {
        setWallet(userWallet);
      }
      setCategories(cats);
      if (cats.length > 0 && !cats.some((c) => c.id === selectedCategory)) {
        setSelectedCategory(cats[0].id);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }, [sessionToken, selectedCategory]);

  useEffect(() => {
    void loadData();
    const interval = setInterval(() => void loadData(), 8000);
    return () => clearInterval(interval);
  }, [loadData]);

  const handleCreateDuel = async () => {
    if (!sessionToken) {
      setModalError("Please open Challenge from Telegram to create a duel.");
      return;
    }
    if (inviteType === "username" && !targetUsername.trim()) {
      setModalError("Please enter your friend's Telegram username (e.g. john_doe).");
      return;
    }

    setCreating(true);
    setModalError(null);
    try {
      const isPublic = inviteType === "public";
      const invitedUsername = inviteType === "username" ? targetUsername.trim() : undefined;
      const created = await createDuel(
        {
          stake_etb: selectedStake,
          category: selectedCategory,
          is_public: isPublic,
          invited_username: invitedUsername,
        },
        sessionToken,
      );
      setShowCreate(false);
      router.push(`/duels/${created.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        setModalError(err.message);
      } else {
        setModalError("Failed to create duel.");
      }
    } finally {
      setCreating(false);
    }
  };

  const shareDuel = (duel: DuelView, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const stakeText = Number(duel.stake_etb) > 0 ? `${duel.stake_etb} ETB` : "Free";
    const text = `⚔️ I created a 1v1 Quiz Duel (${stakeText})! Can you beat my score? Tap below to battle:`;
    const inviteLink = `https://t.me/Ethioquiz_bot?start=duel_${duel.id}`;
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(inviteLink)}&text=${encodeURIComponent(text)}`;

    const tg = typeof window !== "undefined" ? (window as unknown as { Telegram?: { WebApp?: { openTelegramLink?: (url: string) => void } } }).Telegram?.WebApp : null;
    if (tg?.openTelegramLink) {
      tg.openTelegramLink(shareUrl);
    } else {
      window.open(shareUrl, "_blank");
    }
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
              const currentUsername = state.status === "ready" && state.user.username ? state.user.username.toLowerCase() : null;
              const isInvitedForMe = currentUsername && (
                (duel.invited_usernames && duel.invited_usernames.includes(currentUsername)) ||
                (duel.invited_username && duel.invited_username.toLowerCase() === currentUsername)
              );
              const stakeAmount = Number(duel.stake_etb);
              return (
                <Link
                  key={duel.id}
                  href={`/duels/${duel.id}`}
                  className={`press flex items-center justify-between gap-3 rounded-2xl bg-[var(--card)] p-4 shadow-sm border transition-all ${
                    isInvitedForMe ? "border-amber-400 bg-amber-500/5 ring-1 ring-amber-400/50" : "border-black/5 hover:border-black/10"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-black text-sm shadow">
                      ⚔️
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-bold truncate">{duel.creator.first_name}</span>
                        {isMine ? (
                          <span className="rounded bg-indigo-100 px-1.5 py-0.2 text-[9px] font-bold text-indigo-700">
                            YOU
                          </span>
                        ) : null}
                        {isInvitedForMe ? (
                          <span className="rounded bg-amber-100 px-1.5 py-0.2 text-[9px] font-black text-amber-800">
                            🎯 FOR YOU
                          </span>
                        ) : duel.invited_username ? (
                          <span className="rounded bg-black/5 px-1.5 py-0.2 text-[9px] font-semibold text-[var(--muted)]">
                            @{duel.invited_username}
                          </span>
                        ) : duel.is_public ? (
                          <span className="rounded bg-emerald-100 px-1.5 py-0.2 text-[9px] font-bold text-emerald-800">
                            PUBLIC
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

            {/* Wallet Balance Display */}
            <div className="flex items-center justify-between rounded-2xl bg-black/5 px-3.5 py-2.5 text-xs">
              <span className="text-[var(--muted)] font-medium">Your Balance:</span>
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-emerald-600">
                  {wallet ? `${wallet.balance_etb} ETB` : "..."}
                </span>
                <Link
                  href="/wallet"
                  className="rounded-full bg-emerald-600/10 px-2 py-0.5 text-[10px] font-bold text-emerald-700 hover:bg-emerald-600/20"
                >
                  + Top Up
                </Link>
              </div>
            </div>

            {/* Stake selection */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold text-[var(--muted)] uppercase tracking-wider">
                  Choose Stake
                </label>
                {selectedStake > Number(wallet?.balance_etb ?? 0) ? (
                  <Link href="/wallet" className="text-[11px] font-bold text-amber-600 underline">
                    Deposit via Telebirr
                  </Link>
                ) : null}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {STAKE_OPTIONS.map((opt) => {
                  const active = selectedStake === opt.stake;
                  const canAfford = opt.stake === 0 || (wallet && Number(wallet.balance_etb) >= opt.stake);
                  return (
                    <button
                      key={opt.stake}
                      type="button"
                      onClick={() => setSelectedStake(opt.stake)}
                      className={`press p-2.5 rounded-2xl text-center border transition-all ${
                        active
                          ? "bg-[var(--foreground)] text-[var(--background)] border-transparent shadow"
                          : canAfford
                          ? "bg-[var(--card)] border-black/5 hover:border-black/20"
                          : "bg-black/5 border-dashed border-black/10 opacity-60"
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
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold text-[var(--muted)] uppercase tracking-wider">
                  Select Category
                </label>
                <span className="text-[10px] text-[var(--muted)]">
                  {categories.length} available
                </span>
              </div>
              {categories.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-amber-500/20 bg-amber-500/5 p-3 text-center">
                  <p className="text-xs font-semibold text-amber-800">No categories ready with questions right now.</p>
                  <p className="text-[10px] text-[var(--muted)] mt-0.5">Categories require at least 5 questions to play duels.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {categories.map((cat) => {
                    const active = selectedCategory === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setSelectedCategory(cat.id)}
                        className={`press flex items-center gap-2 p-2.5 rounded-2xl text-left border transition-all ${
                          active
                            ? "bg-indigo-50 border-indigo-500 text-indigo-950 font-bold shadow-sm"
                            : "bg-[var(--card)] border-black/5 text-xs font-medium hover:border-black/20"
                        }`}
                      >
                        <span className="text-lg shrink-0">{cat.icon || "🎯"}</span>
                        <div className="min-w-0">
                          <span className="block text-xs truncate font-semibold">{cat.name}</span>
                          <span className="block text-[10px] text-[var(--muted)] font-normal">{cat.question_count} Qs</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Challenge Mode: Link vs Username vs Public */}
            <div>
              <label className="block text-xs font-bold text-[var(--muted)] uppercase tracking-wider mb-2">
                Challenge Mode
              </label>
              <div className="grid grid-cols-3 gap-1 rounded-2xl bg-black/5 p-1">
                <button
                  type="button"
                  onClick={() => setInviteType("link")}
                  className={`h-8 rounded-xl text-[11px] font-bold transition-all ${
                    inviteType === "link"
                      ? "bg-[var(--card)] text-[var(--foreground)] shadow-sm"
                      : "text-[var(--muted)]"
                  }`}
                >
                  🔗 Link Only
                </button>
                <button
                  type="button"
                  onClick={() => setInviteType("username")}
                  className={`h-8 rounded-xl text-[11px] font-bold transition-all ${
                    inviteType === "username"
                      ? "bg-[var(--card)] text-[var(--foreground)] shadow-sm"
                      : "text-[var(--muted)]"
                  }`}
                >
                  👤 @Username
                </button>
                <button
                  type="button"
                  onClick={() => setInviteType("public")}
                  className={`h-8 rounded-xl text-[11px] font-bold transition-all ${
                    inviteType === "public"
                      ? "bg-[var(--card)] text-[var(--foreground)] shadow-sm"
                      : "text-[var(--muted)]"
                  }`}
                >
                  🌐 Public
                </button>
              </div>

              {inviteType === "link" ? (
                <p className="mt-2 text-[11px] text-[var(--muted)] leading-relaxed">
                  🔒 Private: Only the friend you send the link to can enter and play.
                </p>
              ) : inviteType === "username" ? (
                <div className="mt-2 space-y-1.5">
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-xs text-[var(--muted)] font-mono">@</span>
                    <input
                      type="text"
                      placeholder="friend_username (e.g. john_doe)"
                      value={targetUsername}
                      onChange={(e) => setTargetUsername(e.target.value.replace(/^@/, ""))}
                      className="w-full rounded-2xl border border-black/10 bg-[var(--card)] py-2 pl-7 pr-3 text-xs font-medium focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                  <p className="text-[11px] text-[var(--muted)] leading-relaxed">
                    🎯 Only this username can accept. The Telegram bot will also send them a direct challenge card!
                  </p>
                </div>
              ) : (
                <p className="mt-2 text-[11px] text-[var(--muted)] leading-relaxed">
                  🌐 Open match: Appears on the public lobby board for any online player to battle.
                </p>
              )}
            </div>

            {selectedStake > Number(wallet?.balance_etb ?? 0) ? (
              <div className="rounded-2xl bg-gradient-to-br from-amber-500/15 to-orange-500/15 p-3.5 text-xs text-amber-900 border border-amber-500/30 space-y-2.5">
                <div className="flex items-start gap-2">
                  <span className="text-base">⚠️</span>
                  <div className="flex-1">
                    <p className="font-bold text-amber-950">Insufficient Balance</p>
                    <p className="text-[11px] text-amber-900/90 mt-0.5">
                      You need <b>{selectedStake} ETB</b> to create this duel. Your balance is <b>{wallet?.balance_etb ?? "0.00"} ETB</b> (short by {(selectedStake - Number(wallet?.balance_etb ?? 0)).toFixed(2)} ETB).
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <Link
                    href="/wallet"
                    className="press flex-1 flex h-8 items-center justify-center gap-1 rounded-xl bg-amber-500 font-bold text-gray-950 text-[11px] shadow-sm"
                  >
                    <span>💳</span> Deposit via Telebirr
                  </Link>
                  <button
                    type="button"
                    onClick={() => setSelectedStake(0)}
                    className="press h-8 px-3 rounded-xl bg-black/5 text-[11px] font-semibold text-[var(--foreground)]"
                  >
                    Play Free (0 ETB)
                  </button>
                </div>
              </div>
            ) : null}

            {modalError ? (
              <div className="rounded-2xl bg-rose-500/10 p-3 text-xs text-rose-600 border border-rose-500/20">
                {modalError}
              </div>
            ) : null}

            {selectedStake > Number(wallet?.balance_etb ?? 0) ? (
              <Link
                href="/wallet"
                className="press flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 font-bold text-gray-950 text-sm shadow-lg"
              >
                <span>💳</span> Deposit {(selectedStake - Number(wallet?.balance_etb ?? 0)).toFixed(2)} ETB to Play
              </Link>
            ) : (
              <button
                type="button"
                disabled={creating}
                onClick={() => void handleCreateDuel()}
                className="press w-full h-12 rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 font-bold text-gray-950 text-sm shadow-lg flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {creating ? "Setting up..." : "⚡ Play My Turn (5 Questions)"}
              </button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
