"use client";

import { useCallback, useEffect, useState } from "react";

import { useAuth, useHeaderAction } from "@/components/app-shell";
import { CATEGORIES, getCategoryMeta } from "@/lib/categories";
import {
  describeError,
  ErrorNotice,
  LoadingOverlay,
  ResultDialog,
  type Message,
} from "@/components/feedback";
import {
  addAdmin,
  blockAdminPlayer,
  completeAdminWithdrawal,
  createAdminChallenge,
  deleteAdminChallenge,
  getAdminOverview,
  getPaymentAccount,
  importChallengeQuestions,
  listAdminChallenges,
  listAdminPlayers,
  listAdmins,
  adjustPlayerBalance,
  approveAdminDeposit,
  getFinanceSummary,
  listAdminDeposits,
  listAdminTransactions,
  listAdminWithdrawals,
  listChallengeQuestions,
  notifyAdminChallenge,
  rejectAdminWithdrawal,
  removeAdmin,
  unblockAdminPlayer,
  updateAdminChallengeStatus,
  updatePaymentAccount,
  getAdminReferralConfig,
  updateAdminReferralConfig,
  getAdminSpinOverview,
  updateAdminSpinConfig,
  listAdminCategories,
  createAdminCategory,
  updateAdminCategory,
  deleteAdminCategory,
  listAdminBankQuestions,
  createAdminBankQuestion,
  importAdminBankQuestions,
  deleteAdminBankQuestion,
} from "@/lib/api";
import type {
  AdminChallenge,
  AdminDeposit,
  AdminMember,
  AdminOverview,
  AdminPlayer,
  AdminQuestion,
  AdminSpinOverview,
  AdminTransaction,
  AdminWithdrawal,
  FinanceSummary,
  PaymentAccount,
  QuestionInput,
  ReferralConfig,
  SpinSegment,
  AdminQuestionCategory,
  AdminBankQuestion,
} from "@/lib/types";

type Tab =
  | "overview"
  | "finance"
  | "challenges"
  | "questions"
  | "spin"
  | "players"
  | "cashouts"
  | "activity"
  | "account"
  | "admins";
type CashOutFilter = "pending" | "succeeded" | "cancelled";

function etb(value: string | number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

function localPhone(value: string | null): string {
  if (!value) return "";
  const digits = value.replace(/\D/g, "");
  return digits.startsWith("251") && digits.length === 12 ? `0${digits.slice(3)}` : digits;
}

function when(value: string): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function AdminPage() {
  const { state } = useAuth();
  const sessionToken = state.status === "ready" ? state.sessionToken : null;
  const isOwner = state.status === "ready" && state.user.is_owner;
  const [tab, setTab] = useState<Tab>("overview");
  const [reloadKey, setReloadKey] = useState(0);
  const refresh = useCallback(() => setReloadKey((value) => value + 1), []);

  useHeaderAction(sessionToken ? { label: "Refresh", disabled: false, onClick: refresh } : null);

  if (!sessionToken) {
    return <div className="h-40 animate-pulse rounded-3xl bg-black/5" />;
  }

  return (
    <div className="space-y-4">
      <div className="-mx-5 flex gap-1 overflow-x-auto px-5 pb-1">
        {(
          [
            ["overview", "Overview"],
            ["finance", "Finance"],
            ["challenges", "Challenges"],
            ["questions", "Question Bank"],
            ["spin", "Daily Spin"],
            ["players", "Players"],
            ["cashouts", "Cash outs"],
            ["activity", "Activity"],
            ["account", "Settings"],
            ["admins", "Admins"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={`press h-9 shrink-0 rounded-full px-3 text-xs font-semibold ${
              tab === value
                ? "bg-[var(--accent)] text-[var(--accent-text)]"
                : "bg-[var(--card)] text-[var(--muted)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "overview" ? <OverviewTab key={reloadKey} token={sessionToken} onOpen={setTab} /> : null}
      {tab === "finance" ? <FinanceTab key={reloadKey} token={sessionToken} onOpen={setTab} /> : null}
      {tab === "challenges" ? <ChallengesTab key={reloadKey} token={sessionToken} isOwner={isOwner} /> : null}
      {tab === "questions" ? <QuestionBankTab key={reloadKey} token={sessionToken} isOwner={isOwner} /> : null}
      {tab === "spin" ? <SpinTab key={reloadKey} token={sessionToken} /> : null}
      {tab === "players" ? <PlayersTab key={reloadKey} token={sessionToken} isOwner={isOwner} /> : null}
      {tab === "cashouts" ? <CashOutsTab key={reloadKey} token={sessionToken} /> : null}
      {tab === "activity" ? <ActivityTab key={reloadKey} token={sessionToken} /> : null}
      {tab === "account" ? <AccountTab key={reloadKey} token={sessionToken} /> : null}
      {tab === "admins" ? (
        <AdminsTab key={reloadKey} token={sessionToken} canEdit={isOwner} />
      ) : null}
    </div>
  );
}

function useLoad<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Message | null>(null);
  const run = useCallback(async () => {
    try {
      setData(await load());
      setError(null);
    } catch (caught) {
      setError(describeError(caught, "Could not load this section."));
    }
  }, [load]);

  useEffect(() => {
    const id = window.setTimeout(() => void run(), 0);
    return () => window.clearTimeout(id);
  }, [run]);

  return { data, error, reload: run };
}

function OverviewTab({ token, onOpen }: { token: string; onOpen: (tab: Tab) => void }) {
  const load = useCallback(() => getAdminOverview(token), [token]);
  const { data, error, reload } = useLoad<AdminOverview>(load);

  if (error) return <ErrorNotice error={error} onRetry={() => void reload()} />;
  if (!data) return <div className="h-48 animate-pulse rounded-3xl bg-black/5" />;

  return (
    <div className="rise space-y-3">
      {data.pending_cash_outs > 0 ? (
        <button
          type="button"
          onClick={() => onOpen("cashouts")}
          className="press flex w-full items-center justify-between gap-3 overflow-hidden rounded-3xl bg-[var(--accent)] px-4 py-3.5 sm:px-5 sm:py-4 text-left text-[var(--accent-text)]"
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">
              {data.pending_cash_outs} cash out{data.pending_cash_outs === 1 ? "" : "s"} waiting
            </span>
            <span className="block truncate text-xs opacity-80">{etb(data.pending_cash_out_etb)} ETB to send</span>
          </span>
          <span className="shrink-0 text-xs font-semibold sm:text-sm">Review →</span>
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => onOpen("finance")}
        className="press flex w-full items-center justify-between gap-3 overflow-hidden rounded-3xl border border-black/5 bg-[var(--card)] px-4 py-3.5 shadow-[0_8px_24px_rgba(28,25,21,0.05)] hover:border-[var(--accent)] sm:px-5 sm:py-4 text-left"
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-500/10 text-xl">
            💰
          </div>
          <div className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-[var(--foreground)]">
              Treasury & Money Center
            </span>
            <span className="block truncate text-xs text-[var(--muted)]">
              Balances, revenue & deposits
            </span>
          </div>
        </div>
        <span className="shrink-0 text-xs font-semibold text-[var(--accent)] sm:text-sm">
          Manage →
        </span>
      </button>

      <div className="grid grid-cols-2 gap-3">
        <Stat label="Players" value={String(data.players)} note={`+${data.players_today} today`} />
        <Stat label="Live challenges" value={String(data.open_challenges)} />
        <Stat label="Deposits · 24h" value={`${etb(data.deposits_today_etb)} ETB`} />
        <Stat label="Entry fees · 24h" value={`${etb(data.entry_fees_today_etb)} ETB`} />
        <Stat label="Prizes paid · 24h" value={`${etb(data.prizes_today_etb)} ETB`} />
        <Stat label="Your role" value={data.role === "owner" ? "Main admin" : "Admin"} />
      </div>
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="overflow-hidden rounded-3xl bg-[var(--card)] px-4 py-3 shadow-[0_8px_24px_rgba(28,25,21,0.05)]">
      <p className="truncate text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">{label}</p>
      <p className="mt-1 truncate text-lg font-semibold tabular-nums">{value}</p>
      {note ? <p className="truncate text-xs text-emerald-700">{note}</p> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Finance & Treasury Tab
// ---------------------------------------------------------------------------

function FinanceTab({ token, onOpen }: { token: string; onOpen: (tab: Tab) => void }) {
  const [subTab, setSubTab] = useState<"treasury" | "adjust" | "deposits" | "ledger">("treasury");
  const [reloadKey, setReloadKey] = useState(0);
  const refresh = useCallback(() => setReloadKey((v) => v + 1), []);

  return (
    <div className="rise space-y-4">
      {/* Sub-navigation pills */}
      <div className="flex gap-1.5 overflow-x-auto rounded-2xl bg-[var(--card)] p-1 border border-black/5 shadow-[0_4px_12px_rgba(28,25,21,0.03)]">
        {(
          [
            ["treasury", "🏛 Treasury"],
            ["adjust", "⚡ Adjust Balance"],
            ["deposits", "📥 Deposit Orders"],
            ["ledger", "📜 Audit Ledger"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setSubTab(value)}
            className={`press flex-1 min-w-[95px] h-8 rounded-xl px-2.5 text-xs font-semibold transition-all ${
              subTab === value
                ? "bg-[var(--accent)] text-[var(--accent-text)] shadow-sm"
                : "text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {subTab === "treasury" ? (
        <FinanceTreasuryView
          key={reloadKey}
          token={token}
          onOpen={onOpen}
          onAdjust={() => setSubTab("adjust")}
          onDeposits={() => setSubTab("deposits")}
        />
      ) : null}
      {subTab === "adjust" ? (
        <FinanceAdjustView key={reloadKey} token={token} onDone={refresh} />
      ) : null}
      {subTab === "deposits" ? (
        <FinanceDepositsView key={reloadKey} token={token} onDone={refresh} />
      ) : null}
      {subTab === "ledger" ? (
        <FinanceLedgerView key={reloadKey} token={token} />
      ) : null}
    </div>
  );
}

function FinanceTreasuryView({
  token,
  onOpen,
  onAdjust,
  onDeposits,
}: {
  token: string;
  onOpen: (tab: Tab) => void;
  onAdjust: () => void;
  onDeposits: () => void;
}) {
  const load = useCallback(() => getFinanceSummary(token), [token]);
  const { data, error, reload } = useLoad<FinanceSummary>(load);

  if (error) return <ErrorNotice error={error} onRetry={() => void reload()} />;
  if (!data) return <div className="h-64 animate-pulse rounded-3xl bg-black/5" />;

  const netProfit = Number(data.net_platform_profit_etb);
  const isProfitPositive = netProfit >= 0;

  return (
    <div className="space-y-3.5">
      {/* Pending Cashouts Alert banner if any */}
      {data.pending_withdrawals_count > 0 ? (
        <button
          type="button"
          onClick={() => onOpen("cashouts")}
          className="press flex w-full items-center justify-between gap-3 overflow-hidden rounded-3xl bg-[var(--accent)] px-4 py-3.5 text-left text-[var(--accent-text)] shadow-sm sm:px-5"
        >
          <div className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">
              {data.pending_withdrawals_count} pending cash out{data.pending_withdrawals_count === 1 ? "" : "s"}
            </span>
            <span className="block truncate text-xs opacity-90">{etb(data.pending_withdrawals_etb)} ETB awaiting payout</span>
          </div>
          <span className="shrink-0 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold">Pay cash outs →</span>
        </button>
      ) : null}

      {/* Main Treasury Balance Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Total Player Balances (Liability) */}
        <div className="rounded-3xl bg-[var(--card)] p-5 shadow-[0_8px_24px_rgba(28,25,21,0.05)] border border-amber-500/10">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">Platform Liabilities</span>
            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-800">Player Balances</span>
          </div>
          <p className="mt-2 text-2xl font-bold tabular-nums text-[var(--foreground)]">
            {etb(data.total_user_balances_etb)} <span className="text-sm font-normal text-[var(--muted)]">ETB</span>
          </p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Total active funds held across all player wallets in the system.
          </p>
        </div>

        {/* Net Platform Quiz Margin */}
        <div className="rounded-3xl bg-[var(--card)] p-5 shadow-[0_8px_24px_rgba(28,25,21,0.05)] border border-black/5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">Net Quiz Margin</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                isProfitPositive ? "bg-emerald-500/10 text-emerald-800" : "bg-rose-500/10 text-rose-800"
              }`}
            >
              {isProfitPositive ? "Net Profit" : "Net Deficit"}
            </span>
          </div>
          <p
            className={`mt-2 text-2xl font-bold tabular-nums ${
              isProfitPositive ? "text-emerald-700" : "text-rose-600"
            }`}
          >
            {isProfitPositive ? "+" : ""}{etb(data.net_platform_profit_etb)} <span className="text-sm font-normal text-[var(--muted)]">ETB</span>
          </p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {etb(data.total_entry_fees_all_time_etb)} ETB entry fees − {etb(data.total_prizes_paid_all_time_etb)} ETB prizes paid.
          </p>
        </div>
      </div>

      {/* Inflow vs Outflow & Adjustments */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="rounded-3xl bg-[var(--card)] p-4 shadow-[0_8px_24px_rgba(28,25,21,0.05)]">
          <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">All-Time Inflow (Deposits)</span>
          <p className="mt-1 text-lg font-semibold tabular-nums text-emerald-700">+{etb(data.total_deposits_all_time_etb)} ETB</p>
          <p className="mt-0.5 text-[11px] text-[var(--muted)]">Total player deposits verified</p>
        </div>
        <div className="rounded-3xl bg-[var(--card)] p-4 shadow-[0_8px_24px_rgba(28,25,21,0.05)]">
          <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">All-Time Outflow (Cash Outs)</span>
          <p className="mt-1 text-lg font-semibold tabular-nums text-[var(--foreground)]">−{etb(data.total_withdrawals_paid_all_time_etb)} ETB</p>
          <p className="mt-0.5 text-[11px] text-[var(--muted)]">Total cash outs completed</p>
        </div>
        <div className="col-span-2 sm:col-span-1 rounded-3xl bg-[var(--card)] p-4 shadow-[0_8px_24px_rgba(28,25,21,0.05)]">
          <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">Admin Adjustments</span>
          <p className="mt-1 text-lg font-semibold tabular-nums text-amber-700">
            {Number(data.total_adjustments_all_time_etb || 0) >= 0 ? "+" : ""}{etb(data.total_adjustments_all_time_etb || 0)} ETB
          </p>
          <p className="mt-0.5 text-[11px] text-[var(--muted)]">Manual credits & deductions</p>
        </div>
      </div>

      {/* 24-Hour Flows */}
      <div className="rounded-3xl bg-[var(--card)] p-5 shadow-[0_8px_24px_rgba(28,25,21,0.05)]">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)] mb-3">24-Hour Cashflow Breakdown</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="rounded-2xl bg-[#fbf9f5] p-3">
            <span className="text-[10px] text-[var(--muted)]">Deposits (24h)</span>
            <p className="text-sm font-semibold tabular-nums text-emerald-700">+{etb(data.deposits_today_etb)} ETB</p>
          </div>
          <div className="rounded-2xl bg-[#fbf9f5] p-3">
            <span className="text-[10px] text-[var(--muted)]">Fees Collected (24h)</span>
            <p className="text-sm font-semibold tabular-nums text-[var(--foreground)]">+{etb(data.entry_fees_today_etb)} ETB</p>
          </div>
          <div className="rounded-2xl bg-[#fbf9f5] p-3">
            <span className="text-[10px] text-[var(--muted)]">Prizes Awarded (24h)</span>
            <p className="text-sm font-semibold tabular-nums text-rose-700">−{etb(data.prizes_today_etb)} ETB</p>
          </div>
          <div className="rounded-2xl bg-[#fbf9f5] p-3">
            <span className="text-[10px] text-[var(--muted)]">Cash Outs Sent (24h)</span>
            <p className="text-sm font-semibold tabular-nums text-[var(--foreground)]">−{etb(data.withdrawals_paid_today_etb)} ETB</p>
          </div>
        </div>
      </div>

      {/* Settlement Account & Quick Actions */}
      <div className="rounded-3xl bg-[var(--card)] p-5 shadow-[0_8px_24px_rgba(28,25,21,0.05)] space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">Receiving Telebirr Account</h3>
            <p className="mt-1 truncate text-sm font-semibold">{data.telebirr_account_name} · <span className="font-mono">{localPhone(data.telebirr_account_number) || data.telebirr_account_number || "Not set"}</span></p>
          </div>
          <button
            type="button"
            onClick={() => onOpen("account")}
            className="press shrink-0 rounded-full bg-black/5 px-3 py-1.5 text-xs font-semibold hover:bg-black/10"
          >
            Edit Account
          </button>
        </div>

        <div className="border-t border-black/5 pt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onAdjust}
            className="press flex items-center justify-center gap-1.5 h-10 rounded-full bg-[var(--accent)] text-xs font-semibold text-[var(--accent-text)]"
          >
            <span>⚡ Adjust Balance</span>
          </button>
          <button
            type="button"
            onClick={onDeposits}
            className="press flex items-center justify-center gap-1.5 h-10 rounded-full bg-black/5 text-xs font-semibold hover:bg-black/10"
          >
            <span>📥 Review Deposits</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function FinanceAdjustView({ token, onDone }: { token: string; onDone: () => void }) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState<AdminPlayer | null>(null);
  const [direction, setDirection] = useState<"credit" | "debit">("credit");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Message | null>(null);

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedSearch(search), 300);
    return () => window.clearTimeout(id);
  }, [search]);

  const loadPlayers = useCallback(
    () => listAdminPlayers(token, debouncedSearch || undefined),
    [token, debouncedSearch],
  );
  const { data: players } = useLoad<AdminPlayer[]>(loadPlayers);

  const numAmount = Number(amount) || 0;
  const playerBal = Number(selectedPlayer?.balance_etb || 0);
  const isDebitTooHigh = direction === "debit" && numAmount > playerBal;
  const canSubmit =
    selectedPlayer && numAmount > 0 && reason.trim().length >= 3 && !isDebitTooHigh && !busy;

  async function handleAdjust() {
    if (!canSubmit || !selectedPlayer) return;
    setBusy(true);
    try {
      const res = await adjustPlayerBalance(token, {
        user_id: selectedPlayer.id,
        amount_etb: String(numAmount),
        direction,
        reason: reason.trim(),
      });
      setResult({
        tone: "success",
        title: direction === "credit" ? "Money credited" : "Money deducted",
        message: `${selectedPlayer.first_name}'s balance was updated to ${etb(res.balance_etb)} ETB (${
          direction === "credit" ? "+" : "−"
        }${etb(res.amount_etb)} ETB). An instant Telegram notification was sent.`,
      });
      setSelectedPlayer((prev) => (prev ? { ...prev, balance_etb: res.balance_etb } : null));
      setAmount("");
      setReason("");
      onDone();
    } catch (caught) {
      setResult(describeError(caught, "Could not adjust player balance."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rise space-y-4">
      <div className="rounded-3xl bg-[var(--card)] p-5 shadow-[0_8px_24px_rgba(28,25,21,0.05)] space-y-4">
        <div>
          <h2 className="text-sm font-semibold">Adjust Player Balance</h2>
          <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
            Credit or deduct funds from any player. All transactions are recorded in the audit ledger and sent to the player on Telegram.
          </p>
        </div>

        {/* Player Selector */}
        {!selectedPlayer ? (
          <div className="space-y-2">
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
              Step 1: Choose Player
            </label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or @username..."
              className="h-11 w-full rounded-2xl border border-black/10 bg-transparent px-4 text-sm outline-none focus:border-[var(--accent)]"
            />
            {players && players.length > 0 ? (
              <div className="max-h-56 overflow-y-auto rounded-2xl border border-black/10 divide-y divide-black/5 bg-[#fbf9f5]">
                {players.map((p) => {
                  const pName = [p.first_name, p.last_name].filter(Boolean).join(" ");
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setSelectedPlayer(p);
                        setSearch("");
                      }}
                      className="press flex w-full items-center justify-between p-3 text-left hover:bg-black/5 transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold">{pName} {p.username ? `@${p.username}` : ""}</p>
                        <p className="text-[10px] text-[var(--muted)]">ID: {p.telegram_id}</p>
                      </div>
                      <span className="shrink-0 text-xs font-bold tabular-nums text-[var(--foreground)]">
                        {etb(p.balance_etb)} ETB
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="rounded-2xl bg-amber-500/10 p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">Selected Player</p>
              <p className="text-sm font-bold text-[var(--foreground)]">
                {[selectedPlayer.first_name, selectedPlayer.last_name].filter(Boolean).join(" ")}
                {selectedPlayer.username ? ` (@${selectedPlayer.username})` : ""}
              </p>
              <p className="text-xs text-[var(--muted)] mt-0.5">
                Current balance: <span className="font-bold text-[var(--foreground)]">{etb(selectedPlayer.balance_etb)} ETB</span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedPlayer(null)}
              className="press rounded-full bg-black/10 px-3 py-1.5 text-xs font-semibold text-[var(--foreground)] hover:bg-black/15"
            >
              Change
            </button>
          </div>
        )}

        {/* Direction Toggle */}
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
            Step 2: Direction
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setDirection("credit")}
              className={`press h-11 rounded-2xl text-xs font-semibold flex items-center justify-center gap-1.5 border transition-all ${
                direction === "credit"
                  ? "border-emerald-600 bg-emerald-50 text-emerald-800 shadow-sm"
                  : "border-black/10 bg-transparent text-[var(--muted)]"
              }`}
            >
              <span className="text-base">➕</span> Add Money (Credit)
            </button>
            <button
              type="button"
              onClick={() => setDirection("debit")}
              className={`press h-11 rounded-2xl text-xs font-semibold flex items-center justify-center gap-1.5 border transition-all ${
                direction === "debit"
                  ? "border-rose-600 bg-rose-50 text-rose-800 shadow-sm"
                  : "border-black/10 bg-transparent text-[var(--muted)]"
              }`}
            >
              <span className="text-base">➖</span> Deduct Money (Debit)
            </button>
          </div>
        </div>

        {/* Amount Input & Chips */}
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
            Step 3: Amount (ETB)
          </label>
          <input
            type="number"
            min="1"
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="h-11 w-full rounded-2xl border border-black/10 bg-transparent px-4 text-base font-semibold tabular-nums outline-none focus:border-[var(--accent)]"
          />
          <div className="flex flex-wrap gap-1.5 pt-1">
            {[25, 50, 100, 250, 500, 1000].map((val) => (
              <button
                key={val}
                type="button"
                onClick={() => setAmount(String(val))}
                className="press h-7 rounded-lg bg-black/5 px-2.5 text-xs font-medium hover:bg-black/10"
              >
                +{val}
              </button>
            ))}
          </div>
          {isDebitTooHigh ? (
            <p className="text-xs text-rose-600 font-medium">
              Cannot deduct {etb(numAmount)} ETB. Player only has {etb(playerBal)} ETB available.
            </p>
          ) : null}
        </div>

        {/* Reason / Audit Note */}
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
            Step 4: Reason / Audit Note
          </label>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Goodwill bonus, tournament prize correction, dispute resolution"
            className="h-11 w-full rounded-2xl border border-black/10 bg-transparent px-4 text-sm outline-none focus:border-[var(--accent)]"
          />
        </div>

        {/* Submit Button */}
        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => void handleAdjust()}
          className={`press h-12 w-full rounded-full text-sm font-semibold transition-all ${
            direction === "credit"
              ? "bg-emerald-600 text-white"
              : "bg-rose-600 text-white"
          } disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          {direction === "credit"
            ? `Credit Player (+${etb(numAmount || 0)} ETB)`
            : `Deduct from Player (−${etb(numAmount || 0)} ETB)`}
        </button>
      </div>

      {busy ? <LoadingOverlay title="Processing adjustment..." /> : null}
      {result && !busy ? (
        <ResultDialog result={result} onClose={() => setResult(null)} actionLabel="Done" />
      ) : null}
    </section>
  );
}

function FinanceDepositsView({ token, onDone }: { token: string; onDone: () => void }) {
  const [filter, setFilter] = useState<"all" | "pending" | "failed" | "succeeded">("all");
  const load = useCallback(() => listAdminDeposits(token, filter), [token, filter]);
  const { data, error, reload } = useLoad<AdminDeposit[]>(load);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<Message | null>(null);

  async function handleApprove(deposit: AdminDeposit) {
    setBusy(`Crediting ${etb(deposit.amount_etb)} ETB`);
    try {
      await approveAdminDeposit(token, deposit.id);
      setResult({
        tone: "success",
        title: "Deposit Approved",
        message: `${etb(deposit.amount_etb)} ETB has been credited to ${deposit.player_name}'s wallet. They received an instant confirmation on Telegram.`,
      });
      await reload();
      onDone();
    } catch (caught) {
      setResult(describeError(caught, "Could not approve deposit."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rise space-y-3">
      {/* Filter bar */}
      <div className="flex gap-1.5 overflow-x-auto">
        {(
          [
            ["all", "All"],
            ["pending", "Pending"],
            ["failed", "Failed"],
            ["succeeded", "Succeeded"],
          ] as const
        ).map(([val, label]) => (
          <button
            key={val}
            type="button"
            onClick={() => setFilter(val)}
            className={`press h-8 rounded-full px-3.5 text-xs font-semibold transition-all ${
              filter === val
                ? "bg-[var(--foreground)] text-[var(--background)] shadow-sm"
                : "bg-[var(--card)] text-[var(--muted)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error ? <ErrorNotice error={error} onRetry={() => void reload()} /> : null}
      {!data && !error ? <div className="h-40 animate-pulse rounded-3xl bg-black/5" /> : null}
      {data && data.length === 0 ? (
        <p className="rounded-3xl bg-[var(--card)] px-5 py-6 text-sm text-[var(--muted)]">
          No deposits found for this filter.
        </p>
      ) : null}

      {data?.map((deposit) => {
        const isSucceeded = deposit.status === "succeeded";
        const isPending = deposit.status === "pending";

        return (
          <article
            key={deposit.id}
            className="rounded-3xl bg-[var(--card)] p-5 shadow-[0_8px_24px_rgba(28,25,21,0.05)] border border-black/5 space-y-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{deposit.player_name}</p>
                <p className="text-xs text-[var(--muted)]">
                  {deposit.telegram_username ? `@${deposit.telegram_username} · ` : ""}ID: {deposit.telegram_id}
                </p>
              </div>
              <div className="text-right">
                <span className="text-lg font-bold tabular-nums text-emerald-700">
                  +{etb(deposit.amount_etb)} <span className="text-xs font-medium text-[var(--muted)]">ETB</span>
                </span>
                <div>
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                      isSucceeded
                        ? "bg-emerald-100 text-emerald-800"
                        : isPending
                        ? "bg-amber-100 text-amber-800"
                        : "bg-rose-100 text-rose-800"
                    }`}
                  >
                    {deposit.status}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-2xl bg-[#f7f4ee] px-3.5 py-2.5 text-xs">
              <span className="text-[var(--muted)]">Telebirr Ref</span>
              <span className="font-mono font-semibold select-all text-xs bg-white/70 px-2 py-0.5 rounded-lg border border-black/5">
                {deposit.transaction_number || "None"}
              </span>
            </div>

            {deposit.failure_reason ? (
              <p className="text-xs text-rose-600 bg-rose-50 rounded-xl px-3 py-1.5 border border-rose-100">
                ⚠️ {deposit.failure_reason}
              </p>
            ) : null}

            <div className="flex items-center justify-between text-[11px] text-[var(--muted)]">
              <span>{when(deposit.created_at)}</span>
              <span>Player Balance: {etb(deposit.balance_etb)} ETB</span>
            </div>

            {/* Manual Approve button for pending or failed */}
            {!isSucceeded ? (
              <button
                type="button"
                onClick={() => void handleApprove(deposit)}
                className="press flex w-full items-center justify-center gap-1.5 h-10 rounded-full bg-emerald-600 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700"
              >
                <span>✓ Approve & Credit (+{etb(deposit.amount_etb)} ETB)</span>
              </button>
            ) : null}
          </article>
        );
      })}

      {busy ? <LoadingOverlay title={busy} /> : null}
      {result && !busy ? (
        <ResultDialog result={result} onClose={() => setResult(null)} actionLabel="Done" />
      ) : null}
    </section>
  );
}

const FINANCE_LEDGER_FILTERS = [
  ["all", "All"],
  ["adjustment", "Adjustments"],
  ["deposit", "Deposits"],
  ["entry_fee", "Fees"],
  ["prize", "Prizes"],
  ["withdrawal_hold", "Cash outs"],
] as const;

function FinanceLedgerView({ token }: { token: string }) {
  const [filter, setFilter] = useState<(typeof FINANCE_LEDGER_FILTERS)[number][0]>("all");
  const load = useCallback(() => listAdminTransactions(token, filter), [token, filter]);
  const { data, error, reload } = useLoad<AdminTransaction[]>(load);

  return (
    <div className="rise space-y-3">
      <div className="-mx-5 flex gap-2 overflow-x-auto px-5">
        {FINANCE_LEDGER_FILTERS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className={`press h-8 shrink-0 rounded-full px-3 text-xs font-semibold ${
              filter === value
                ? "bg-[var(--foreground)] text-[var(--background)]"
                : "bg-[var(--card)] text-[var(--muted)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error ? <ErrorNotice error={error} onRetry={() => void reload()} /> : null}
      {!data && !error ? <div className="h-40 animate-pulse rounded-3xl bg-black/5" /> : null}
      {data && data.length === 0 ? (
        <p className="rounded-3xl bg-[var(--card)] px-5 py-6 text-sm text-[var(--muted)]">
          No transactions yet.
        </p>
      ) : null}

      {data && data.length > 0 ? (
        <ol className="rounded-3xl bg-[var(--card)] px-5 py-2 shadow-[0_8px_24px_rgba(28,25,21,0.05)]">
          {data.map((item) => {
            const positive = Number(item.amount_etb) > 0;
            return (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 border-t border-black/10 py-3 first:border-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {item.player_name}
                    {item.telegram_username ? (
                      <span className="font-normal text-[var(--muted)]">
                        {" "}
                        @{item.telegram_username}
                      </span>
                    ) : null}
                  </p>
                  <p className="truncate text-xs text-[var(--muted)]">
                    <span className="font-semibold">{activityLabel(item.entry_type)}</span> · {item.description}
                  </p>
                  <p className="text-[11px] text-[var(--muted)]">
                    {when(item.created_at)} · balance after: <span className="font-medium text-[var(--foreground)]">{etb(item.balance_after_etb)} ETB</span>
                  </p>
                </div>
                <p
                  className={`shrink-0 text-sm font-bold tabular-nums ${
                    positive ? "text-emerald-700" : "text-[var(--foreground)]"
                  }`}
                >
                  {positive ? "+" : "−"}
                  {etb(Math.abs(Number(item.amount_etb)))} ETB
                </p>
              </li>
            );
          })}
        </ol>
      ) : null}
    </div>
  );
}

const ACTIVITY_FILTERS = [
  ["all", "All"],
  ["adjustment", "Adjustments"],
  ["deposit", "Deposits"],
  ["entry_fee", "Fees"],
  ["prize", "Prizes"],
  ["referral", "Referrals"],
  ["withdrawal_hold", "Cash outs"],
] as const;

function activityLabel(entryType: AdminTransaction["entry_type"]): string {
  if (entryType === "deposit") return "Deposit";
  if (entryType === "entry_fee") return "Entry fee";
  if (entryType === "prize") return "Prize";
  if (entryType === "referral") return "Referral reward";
  if (entryType === "withdrawal_hold") return "Cash out paid";
  if (entryType === "withdrawal_release") return "Cash out returned";
  return "Adjustment";
}

function ActivityTab({ token }: { token: string }) {
  const [filter, setFilter] = useState<(typeof ACTIVITY_FILTERS)[number][0]>("all");
  const load = useCallback(() => listAdminTransactions(token, filter), [token, filter]);
  const { data, error, reload } = useLoad<AdminTransaction[]>(load);

  return (
    <div className="rise space-y-3">
      <div className="-mx-5 flex gap-2 overflow-x-auto px-5">
        {ACTIVITY_FILTERS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className={`press h-8 shrink-0 rounded-full px-3 text-xs font-semibold ${
              filter === value
                ? "bg-[var(--foreground)] text-[var(--background)]"
                : "bg-[var(--card)] text-[var(--muted)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {error ? <ErrorNotice error={error} onRetry={() => void reload()} /> : null}
      {!data && !error ? <div className="h-40 animate-pulse rounded-3xl bg-black/5" /> : null}
      {data && data.length === 0 ? (
        <p className="rounded-3xl bg-[var(--card)] px-5 py-6 text-sm text-[var(--muted)]">
          No transactions yet.
        </p>
      ) : null}
      {data && data.length > 0 ? (
        <ol className="rounded-3xl bg-[var(--card)] px-5 py-2 shadow-[0_8px_24px_rgba(28,25,21,0.05)]">
          {data.map((item) => {
            const positive = Number(item.amount_etb) > 0;
            return (
              <li
                key={item.id}
                className="flex items-start justify-between gap-3 border-t border-black/10 py-3 first:border-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {item.player_name}
                    {item.telegram_username ? (
                      <span className="font-normal text-[var(--muted)]">
                        {" "}
                        @{item.telegram_username}
                      </span>
                    ) : null}
                  </p>
                  <p className="truncate text-xs text-[var(--muted)]">
                    {activityLabel(item.entry_type)} · {item.description}
                  </p>
                  <p className="text-[11px] text-[var(--muted)]">
                    {when(item.created_at)} · balance {etb(item.balance_after_etb)}
                  </p>
                </div>
                <p
                  className={`shrink-0 text-sm font-semibold tabular-nums ${
                    positive ? "text-emerald-700" : ""
                  }`}
                >
                  {positive ? "+" : "−"}
                  {etb(Math.abs(Number(item.amount_etb)))}
                </p>
              </li>
            );
          })}
        </ol>
      ) : null}
    </div>
  );
}

function CashOutsTab({ token }: { token: string }) {
  const [filter, setFilter] = useState<CashOutFilter>("pending");
  const load = useCallback(() => listAdminWithdrawals(token, filter), [token, filter]);
  const { data, error, reload } = useLoad<AdminWithdrawal[]>(load);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<Message | null>(null);
  const [rejecting, setRejecting] = useState<AdminWithdrawal | null>(null);
  const [reason, setReason] = useState("");

  async function markPaid(order: AdminWithdrawal) {
    setBusy("Marking as paid");
    try {
      await completeAdminWithdrawal(token, order.id);
      setResult({
        tone: "success",
        title: "Marked as paid",
        message: `${etb(order.amount_etb)} ETB was taken from ${order.player_name}'s balance.`,
      });
      await reload();
    } catch (caught) {
      setResult(describeError(caught, "Could not mark this cash out as paid."));
    } finally {
      setBusy(null);
    }
  }

  async function reject() {
    if (!rejecting) return;
    const order = rejecting;
    setRejecting(null);
    setBusy("Rejecting");
    try {
      await rejectAdminWithdrawal(token, order.id, reason);
      setResult({
        tone: "success",
        title: "Cash out rejected",
        message: "The player's balance was not charged.",
      });
      setReason("");
      await reload();
    } catch (caught) {
      setResult(describeError(caught, "Could not reject this cash out."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rise space-y-3">
      <div className="flex gap-2">
        {(
          [
            ["pending", "Waiting"],
            ["succeeded", "Paid"],
            ["cancelled", "Rejected"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className={`press h-8 rounded-full px-3 text-xs font-semibold ${
              filter === value
                ? "bg-[var(--foreground)] text-[var(--background)]"
                : "bg-[var(--card)] text-[var(--muted)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error ? <ErrorNotice error={error} onRetry={() => void reload()} /> : null}
      {!data && !error ? <div className="h-40 animate-pulse rounded-3xl bg-black/5" /> : null}
      {data && data.length === 0 ? (
        <p className="rounded-3xl bg-[var(--card)] px-5 py-6 text-sm text-[var(--muted)]">
          {filter === "pending" ? "No cash outs are waiting." : "Nothing here yet."}
        </p>
      ) : null}

      {data?.map((order) => (
        <article
          key={order.id}
          className="rounded-3xl bg-[var(--card)] px-5 py-4 shadow-[0_8px_24px_rgba(28,25,21,0.05)]"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{order.player_name}</p>
              <p className="text-xs text-[var(--muted)]">
                {order.telegram_username ? `@${order.telegram_username} · ` : ""}
                {when(order.created_at)}
              </p>
            </div>
            <p className="shrink-0 text-lg font-semibold tabular-nums">
              {etb(order.amount_etb)}
              <span className="ml-1 text-xs font-medium text-[var(--muted)]">ETB</span>
            </p>
          </div>
          <div className="mt-3 flex items-center justify-between rounded-2xl bg-[#f7f4ee] px-3 py-2 text-sm">
            <span className="text-[var(--muted)]">Send to Telebirr</span>
            <span className="select-all font-semibold tabular-nums">{localPhone(order.phone_number)}</span>
          </div>
          <p className="mt-2 text-xs text-[var(--muted)]">
            Player balance: {etb(order.balance_etb)} ETB
            {order.failure_reason ? ` · ${order.failure_reason}` : ""}
          </p>
          {order.status === "pending" ? (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setRejecting(order)}
                className="press h-10 rounded-full bg-black/5 text-sm font-semibold"
              >
                Reject
              </button>
              <button
                type="button"
                onClick={() => void markPaid(order)}
                className="press h-10 rounded-full bg-[var(--accent)] text-sm font-semibold text-[var(--accent-text)]"
              >
                Mark paid
              </button>
            </div>
          ) : null}
        </article>
      ))}

      {rejecting ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 sm:items-center">
          <div className="w-full max-w-md rounded-t-3xl bg-[var(--card)] px-5 pt-5 pb-8 sm:rounded-3xl">
            <h2 className="text-lg font-semibold">Reject this cash out?</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {etb(rejecting.amount_etb)} ETB for {rejecting.player_name}. Their balance stays the
              same.
            </p>
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Reason (optional)"
              className="mt-4 h-11 w-full rounded-2xl border border-black/10 bg-transparent px-4 text-base outline-none focus:border-[var(--accent)]"
            />
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setRejecting(null)}
                className="press h-11 rounded-full text-sm font-medium"
              >
                Keep it
              </button>
              <button
                type="button"
                onClick={() => void reject()}
                className="press h-11 rounded-full bg-[var(--accent)] text-sm font-semibold text-[var(--accent-text)]"
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {busy ? <LoadingOverlay title={busy} /> : null}
      {result && !busy ? (
        <ResultDialog result={result} onClose={() => setResult(null)} actionLabel="Done" />
      ) : null}
    </div>
  );
}

function ReferralRewardSection({ token }: { token: string }) {
  const load = useCallback(() => getAdminReferralConfig(token), [token]);
  const { data, error, reload } = useLoad<ReferralConfig>(load);
  const [amount, setAmount] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Message | null>(null);

  if (error) return <ErrorNotice error={error} onRetry={() => void reload()} />;
  if (!data) return <div className="h-44 animate-pulse rounded-3xl bg-black/5" />;

  const shownAmount = amount ?? data.reward_amount_etb;
  const changed = Number(shownAmount) !== Number(data.reward_amount_etb);

  async function save() {
    setBusy(true);
    try {
      const saved = await updateAdminReferralConfig(token, shownAmount);
      setAmount(null);
      await reload();
      setResult({
        tone: "success",
        title: "Saved",
        message: `Referral bonus is now ${saved.reward_amount_etb} ETB per person for new and unique players.`,
      });
    } catch (caught) {
      setResult(describeError(caught, "Could not update the referral reward."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rise rounded-3xl bg-[var(--card)] px-5 py-5 shadow-[0_8px_24px_rgba(28,25,21,0.05)]">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Referral bonus per person</h2>
          <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
            Decide the reward awarded for inviting each new and unique friend who completes their first challenge.
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
          {shownAmount} ETB
        </span>
      </div>

      <label className="mt-4 block text-xs font-medium text-[var(--muted)]">
        Reward amount (ETB)
        <input
          type="number"
          step="0.5"
          min="0"
          value={shownAmount}
          onChange={(event) => setAmount(event.target.value)}
          className="mt-1 h-11 w-full rounded-2xl border border-black/10 bg-transparent px-4 text-base tabular-nums text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
        />
      </label>

      <button
        type="button"
        disabled={!changed || busy}
        onClick={() => void save()}
        className="press mt-4 h-11 w-full rounded-full bg-[var(--accent)] text-sm font-semibold text-[var(--accent-text)] disabled:opacity-40"
      >
        Save referral reward
      </button>

      {busy ? <LoadingOverlay title="Saving" /> : null}
      {result && !busy ? (
        <ResultDialog result={result} onClose={() => setResult(null)} actionLabel="Done" />
      ) : null}
    </section>
  );
}

function AccountTab({ token }: { token: string }) {
  const load = useCallback(() => getPaymentAccount(token), [token]);
  const { data, error, reload } = useLoad<PaymentAccount>(load);
  const [name, setName] = useState<string | null>(null);
  const [number, setNumber] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Message | null>(null);

  if (error) return <ErrorNotice error={error} onRetry={() => void reload()} />;
  if (!data) return <div className="h-48 animate-pulse rounded-3xl bg-black/5" />;

  const shownName = name ?? data.holder_name;
  const shownNumber = number ?? data.account_number;
  const changed = shownName.trim() !== data.holder_name || shownNumber.trim() !== data.account_number;

  async function save() {
    setBusy(true);
    try {
      const saved = await updatePaymentAccount(token, shownName, shownNumber);
      setName(null);
      setNumber(null);
      await reload();
      setResult({
        tone: "success",
        title: "Saved",
        message: `Players now send money to ${saved.holder_name}, ${saved.account_number}.`,
      });
    } catch (caught) {
      setResult(describeError(caught, "Could not save the account."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className="rise rounded-3xl bg-[var(--card)] px-5 py-5 shadow-[0_8px_24px_rgba(28,25,21,0.05)]">
        <h2 className="text-sm font-semibold">Telebirr account players pay into</h2>
        <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
          Shown on the wallet page. Deposits are checked against this number, so change it only after
          the new number can receive money.
        </p>
        <label className="mt-4 block text-xs font-medium text-[var(--muted)]">
          Account name
          <input
            value={shownName}
            onChange={(event) => setName(event.target.value)}
            className="mt-1 h-11 w-full rounded-2xl border border-black/10 bg-transparent px-4 text-base text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
          />
        </label>
        <label className="mt-3 block text-xs font-medium text-[var(--muted)]">
          Telebirr number
          <input
            inputMode="tel"
            value={shownNumber}
            onChange={(event) => setNumber(event.target.value)}
            className="mt-1 h-11 w-full rounded-2xl border border-black/10 bg-transparent px-4 text-base tabular-nums text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
          />
        </label>
        <button
          type="button"
          disabled={!changed || busy}
          onClick={() => void save()}
          className="press mt-4 h-11 w-full rounded-full bg-[var(--accent)] text-sm font-semibold text-[var(--accent-text)] disabled:opacity-40"
        >
          Save account
        </button>
        {busy ? <LoadingOverlay title="Saving" /> : null}
        {result && !busy ? (
          <ResultDialog result={result} onClose={() => setResult(null)} actionLabel="Done" />
        ) : null}
      </section>

      <ReferralRewardSection token={token} />
    </div>
  );
}

function AdminsTab({ token, canEdit }: { token: string; canEdit: boolean }) {
  const load = useCallback(() => listAdmins(token), [token]);
  const { data, error, reload } = useLoad<AdminMember[]>(load);
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Message | null>(null);

  async function add() {
    setBusy(true);
    try {
      const added = await addAdmin(token, username);
      setUsername("");
      await reload();
      setResult({
        tone: "success",
        title: "Admin added",
        message: `@${added.username} opens the admin page next time they open Challenge.`,
      });
    } catch (caught) {
      setResult(describeError(caught, "Could not add this admin."));
    } finally {
      setBusy(false);
    }
  }

  async function remove(member: AdminMember) {
    setBusy(true);
    try {
      await removeAdmin(token, member.username);
      await reload();
    } catch (caught) {
      setResult(describeError(caught, "Could not remove this admin."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rise space-y-3">
      {canEdit ? (
        <div className="rounded-3xl bg-[var(--card)] px-5 py-5 shadow-[0_8px_24px_rgba(28,25,21,0.05)]">
          <h2 className="text-sm font-semibold">Add an admin</h2>
          <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
            Admins manage cash outs and the payment account. They cannot join challenges.
          </p>
          <div className="mt-3 flex gap-2">
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="@username"
              autoCapitalize="none"
              autoCorrect="off"
              className="h-11 min-w-0 flex-1 rounded-2xl border border-black/10 bg-transparent px-4 text-base outline-none focus:border-[var(--accent)]"
            />
            <button
              type="button"
              disabled={username.trim().length < 5 || busy}
              onClick={() => void add()}
              className="press h-11 shrink-0 rounded-full bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-text)] disabled:opacity-40"
            >
              Add
            </button>
          </div>
        </div>
      ) : null}

      {error ? <ErrorNotice error={error} onRetry={() => void reload()} /> : null}
      <ul className="rounded-3xl bg-[var(--card)] px-5 py-2 shadow-[0_8px_24px_rgba(28,25,21,0.05)]">
        {data?.map((member) => (
          <li
            key={member.username}
            className="flex items-center justify-between gap-3 border-t border-black/10 py-3 first:border-0"
          >
            <div>
              <p className="text-sm font-semibold">@{member.username}</p>
              <p className="text-xs text-[var(--muted)]">
                {member.role === "owner" ? "Main admin" : "Admin"}
              </p>
            </div>
            {canEdit && member.role !== "owner" ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void remove(member)}
                className="press h-8 rounded-full bg-black/5 px-3 text-xs font-semibold"
              >
                Remove
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {busy ? <LoadingOverlay title="Saving" /> : null}
      {result && !busy ? (
        <ResultDialog result={result} onClose={() => setResult(null)} actionLabel="Done" />
      ) : null}
    </section>
  );
}

const CHALLENGE_STATUS_STYLES: Record<string, string> = {
  draft: "bg-zinc-100 text-zinc-700",
  registration: "bg-blue-100 text-blue-800",
  ready: "bg-amber-100 text-amber-800",
  live: "bg-emerald-100 text-emerald-800",
  completed: "bg-black/5 text-[var(--muted)]",
  cancelled: "bg-rose-100 text-rose-700",
};

const ALLOWED_STATUS_TRANSITIONS: Record<string, string[]> = {
  draft: ["registration", "cancelled"],
  registration: ["ready", "live", "cancelled"],
  ready: ["live", "cancelled"],
  live: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

const TRANSITION_LABELS: Record<string, string> = {
  registration: "Open registration",
  ready: "Mark ready",
  live: "Start live",
  completed: "Complete",
  cancelled: "Cancel challenge",
};

const SAMPLE_QUESTIONS: QuestionInput[] = [
  {
    prompt: "What is the capital city of Ethiopia?",
    choices: [
      { label: "Nairobi", is_correct: false },
      { label: "Addis Ababa", is_correct: true },
      { label: "Cairo", is_correct: false },
      { label: "Khartoum", is_correct: false },
    ],
  },
  {
    prompt: "How many minutes are in one hour?",
    choices: [
      { label: "30", is_correct: false },
      { label: "60", is_correct: true },
      { label: "90", is_correct: false },
      { label: "45", is_correct: false },
    ],
  },
  {
    prompt: "What is 7 × 8?",
    choices: [
      { label: "54", is_correct: false },
      { label: "64", is_correct: false },
      { label: "48", is_correct: false },
      { label: "56", is_correct: true },
    ],
  },
  {
    prompt: "Which planet is closest to the Sun?",
    choices: [
      { label: "Venus", is_correct: false },
      { label: "Mercury", is_correct: true },
      { label: "Earth", is_correct: false },
      { label: "Mars", is_correct: false },
    ],
  },
  {
    prompt: "What is the chemical formula for water?",
    choices: [
      { label: "Salt", is_correct: false },
      { label: "H2O", is_correct: true },
      { label: "CO2", is_correct: false },
      { label: "O2", is_correct: false },
    ],
  },
  {
    prompt: "How many sides does a triangle have?",
    choices: [
      { label: "4", is_correct: false },
      { label: "3", is_correct: true },
      { label: "5", is_correct: false },
      { label: "6", is_correct: false },
    ],
  },
  {
    prompt: "Which ocean is the largest on Earth?",
    choices: [
      { label: "Atlantic Ocean", is_correct: false },
      { label: "Indian Ocean", is_correct: false },
      { label: "Pacific Ocean", is_correct: true },
      { label: "Arctic Ocean", is_correct: false },
    ],
  },
  {
    prompt: "What is 100 ÷ 4?",
    choices: [
      { label: "20", is_correct: false },
      { label: "25", is_correct: true },
      { label: "40", is_correct: false },
      { label: "50", is_correct: false },
    ],
  },
  {
    prompt: "How many days are in a leap year?",
    choices: [
      { label: "365", is_correct: false },
      { label: "366", is_correct: true },
      { label: "364", is_correct: false },
      { label: "360", is_correct: false },
    ],
  },
  {
    prompt: "Which language is the federal working language of Ethiopia?",
    choices: [
      { label: "Swahili", is_correct: false },
      { label: "Amharic", is_correct: true },
      { label: "Yoruba", is_correct: false },
      { label: "Zulu", is_correct: false },
    ],
  },
];

const SAMPLE_QUESTIONS_AM: QuestionInput[] = [
  {
    prompt: "የኢትዮጵያ ዋና ከተማ ማን ይባላል?",
    choices: [
      { label: "ናይሮቢ", is_correct: false },
      { label: "አዲስ አበባ", is_correct: true },
      { label: "ካይሮ", is_correct: false },
      { label: "ካርቱም", is_correct: false },
    ],
  },
  {
    prompt: "በአንድ ሰዓት ውስጥ ስንት ደቂቃዎች አሉ?",
    choices: [
      { label: "30", is_correct: false },
      { label: "60", is_correct: true },
      { label: "90", is_correct: false },
      { label: "45", is_correct: false },
    ],
  },
  {
    prompt: "የ 7 × 8 ውጤት ስንት ነው?",
    choices: [
      { label: "54", is_correct: false },
      { label: "64", is_correct: false },
      { label: "48", is_correct: false },
      { label: "56", is_correct: true },
    ],
  },
  {
    prompt: "ለፀሐይ በጣም ቅርብ የሆነው ፕላኔት የትኛው ነው?",
    choices: [
      { label: "ቬነስ", is_correct: false },
      { label: "ሜርኩሪ", is_correct: true },
      { label: "መሬት", is_correct: false },
      { label: "ማርስ", is_correct: false },
    ],
  },
  {
    prompt: "የውሃ ኬሚካላዊ ቀመር (Chemical formula) ምን ይባላል?",
    choices: [
      { label: "Salt", is_correct: false },
      { label: "H2O", is_correct: true },
      { label: "CO2", is_correct: false },
      { label: "O2", is_correct: false },
    ],
  },
  {
    prompt: "ባለ ሦስት ማዕዘን ቅርጽ (Triangle) ስንት ጎኖች አሉት?",
    choices: [
      { label: "4", is_correct: false },
      { label: "3", is_correct: true },
      { label: "5", is_correct: false },
      { label: "6", is_correct: false },
    ],
  },
  {
    prompt: "በዓለማችን ላይ ትልቁ ውቅያኖስ የትኛው ነው?",
    choices: [
      { label: "አትላንቲክ ውቅያኖስ", is_correct: false },
      { label: "የህንድ ውቅያኖስ", is_correct: false },
      { label: "ፓስፊክ ውቅያኖስ", is_correct: true },
      { label: "አርክቲክ ውቅያኖስ", is_correct: false },
    ],
  },
  {
    prompt: "100 ሲካፈል ለ 4 ስንት ይሆናል?",
    choices: [
      { label: "20", is_correct: false },
      { label: "25", is_correct: true },
      { label: "40", is_correct: false },
      { label: "50", is_correct: false },
    ],
  },
  {
    prompt: "በኢትዮጵያ ረጅሙ ወንዝ የትኛው ነው?",
    choices: [
      { label: "አዋሽ", is_correct: false },
      { label: "ዓባይ", is_correct: true },
      { label: "ዋቢ ሸበሌ", is_correct: false },
      { label: "ኦሞ", is_correct: false },
    ],
  },
  {
    prompt: "የአፍሪካ ህብረት ዋና መስሪያ ቤት የሚገኘው የት ነው?",
    choices: [
      { label: "ኬንያ", is_correct: false },
      { label: "ኢትዮጵያ (አዲስ አበባ)", is_correct: true },
      { label: "ግብጽ", is_correct: false },
      { label: "ናይጄሪያ", is_correct: false },
    ],
  },
];

const SAMPLE_QUESTIONS_OM: QuestionInput[] = [
  {
    prompt: "Magaalaan guddoon Itoophiyaa eenyu?",
    choices: [
      { label: "Naayiroobii", is_correct: false },
      { label: "Finfinnee", is_correct: true },
      { label: "Kaayiroo", is_correct: false },
      { label: "Kaartuum", is_correct: false },
    ],
  },
  {
    prompt: "Sa'aatii tokko keessa daqiiqaa meeqatu jira?",
    choices: [
      { label: "30", is_correct: false },
      { label: "60", is_correct: true },
      { label: "90", is_correct: false },
      { label: "45", is_correct: false },
    ],
  },
  {
    prompt: "Baay'ifamni 7 × 8 meeqa ta'a?",
    choices: [
      { label: "54", is_correct: false },
      { label: "64", is_correct: false },
      { label: "48", is_correct: false },
      { label: "56", is_correct: true },
    ],
  },
  {
    prompt: "Pilaaneetiin aduutti baay'ee dhihoo ta'e kami?",
    choices: [
      { label: "Veenas", is_correct: false },
      { label: "Meerkurii", is_correct: true },
      { label: "Lafa", is_correct: false },
      { label: "Maars", is_correct: false },
    ],
  },
  {
    prompt: "Foormulaan keemikaalaa bishaanii maali?",
    choices: [
      { label: "Salt", is_correct: false },
      { label: "H2O", is_correct: true },
      { label: "CO2", is_correct: false },
      { label: "O2", is_correct: false },
    ],
  },
  {
    prompt: "Rog-sadeen (Triangle) roga meeqa qaba?",
    choices: [
      { label: "4", is_correct: false },
      { label: "3", is_correct: true },
      { label: "5", is_correct: false },
      { label: "6", is_correct: false },
    ],
  },
  {
    prompt: "Garboota addunyaa keessaa inni guddaan kami?",
    choices: [
      { label: "Garba Atlaantik", is_correct: false },
      { label: "Garba Hindi", is_correct: false },
      { label: "Garba Paasifiik", is_correct: true },
      { label: "Garba Arkitiik", is_correct: false },
    ],
  },
  {
    prompt: "100 yoo afuriif qoodame meeqa ta'a?",
    choices: [
      { label: "20", is_correct: false },
      { label: "25", is_correct: true },
      { label: "40", is_correct: false },
      { label: "50", is_correct: false },
    ],
  },
  {
    prompt: "Laggeen Itoophiyaa keessaa inni dheeraan kami?",
    choices: [
      { label: "Awaash", is_correct: false },
      { label: "Abbayyaa", is_correct: true },
      { label: "Waabee Shabalee", is_correct: false },
      { label: "Oomoo", is_correct: false },
    ],
  },
  {
    prompt: "Teessoon Gamtaa Afrikaa (African Union) eessa jira?",
    choices: [
      { label: "Keeniyaa", is_correct: false },
      { label: "Itoophiyaa (Finfinnee)", is_correct: true },
      { label: "Masrii", is_correct: false },
      { label: "Naayijeeriyaa", is_correct: false },
    ],
  },
];

const PRESETS = [
  {
    label: "Daily Standard (20 ETB)",
    title: "Daily Skill Competition",
    description: "15 fast-paced questions in 30 seconds. Score high and climb the leaderboard!",
    category: "general",
    entry_fee_etb: "20",
    minimum_participants: 100,
    base_prize_etb: "1000",
    extra_prize_per_participant_etb: "10",
    question_count: 10,
    duration_seconds: 30,
    max_participants: "",
  },
  {
    label: "Free Play Round (0 ETB)",
    title: "Free Play Trivia Blitz",
    description: "Free round! Test your speed and knowledge to win prize ETB.",
    category: "general",
    entry_fee_etb: "0",
    minimum_participants: 20,
    base_prize_etb: "300",
    extra_prize_per_participant_etb: "5",
    question_count: 10,
    duration_seconds: 25,
    max_participants: "100",
  },
  {
    label: "Weekend Grand (50 ETB)",
    title: "Weekend Grand Championship",
    description: "High stakes, big prize pool! Test your mastery.",
    category: "general",
    entry_fee_etb: "50",
    minimum_participants: 50,
    base_prize_etb: "3500",
    extra_prize_per_participant_etb: "25",
    question_count: 10,
    duration_seconds: 45,
    max_participants: "150",
  },
  {
    label: "History Round (15 ETB)",
    title: "Ethiopian History & Heritage",
    description: "Ten questions on Ethiopian history, emperors, and Adwa.",
    category: "history",
    entry_fee_etb: "15",
    minimum_participants: 50,
    base_prize_etb: "500",
    extra_prize_per_participant_etb: "8",
    question_count: 10,
    duration_seconds: 30,
    max_participants: "100",
  },
  {
    label: "Football Fever (20 ETB)",
    title: "Premier League & Football Trivia",
    description: "World Cup, Champions League, and African football trivia.",
    category: "football",
    entry_fee_etb: "20",
    minimum_participants: 50,
    base_prize_etb: "750",
    extra_prize_per_participant_etb: "10",
    question_count: 10,
    duration_seconds: 30,
    max_participants: "100",
  },
];

function formatSampleQuestionsForTextarea(questions: QuestionInput[]): string {
  return questions
    .map((q, idx) => {
      const choicesStr = q.choices
        .map((c) => (c.is_correct ? `* ${c.label}` : `- ${c.label}`))
        .join("\n");
      return `${idx + 1}. ${q.prompt}\n${choicesStr}`;
    })
    .join("\n\n");
}

function parsePastedQuestions(text: string): { questions: QuestionInput[]; error: string | null } {
  const trimmed = text.trim();
  if (!trimmed) {
    return { questions: [], error: null };
  }

  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      const questions: QuestionInput[] = [];
      for (let i = 0; i < list.length; i++) {
        const item = list[i];
        if (!item.prompt || typeof item.prompt !== "string") {
          return { questions: [], error: `Question #${i + 1} is missing a prompt.` };
        }
        if (!Array.isArray(item.choices) || item.choices.length < 2 || item.choices.length > 6) {
          return { questions: [], error: `Question #${i + 1} must have between 2 and 6 choices.` };
        }
        const correctCount = item.choices.filter((c: { is_correct?: boolean }) => Boolean(c.is_correct)).length;
        if (correctCount !== 1) {
          return {
            questions: [],
            error: `Question #${i + 1} must have exactly 1 correct answer (found ${correctCount}).`,
          };
        }
        questions.push({
          prompt: item.prompt.trim(),
          choices: item.choices.map((c: { label?: string; is_correct?: boolean }) => ({
            label: String(c.label || "").trim(),
            is_correct: Boolean(c.is_correct),
          })),
        });
      }
      return { questions, error: null };
    } catch {
      return { questions: [], error: "Invalid JSON format." };
    }
  }

  const blocks = trimmed.split(/\n\s*\n+/);
  const questions: QuestionInput[] = [];

  for (let b = 0; b < blocks.length; b++) {
    const lines = blocks[b]
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) continue;

    const rawPrompt = lines[0].replace(/^(?:Q\d+[:.]?|\d+[\.)])\s*/i, "").trim();
    if (!rawPrompt) {
      return { questions: [], error: `Question #${b + 1} has an empty prompt.` };
    }

    const choiceLines = lines.slice(1);
    if (choiceLines.length < 2) {
      return {
        questions: [],
        error: `Question #${b + 1} ("${rawPrompt.slice(0, 25)}...") needs at least 2 choices.`,
      };
    }
    if (choiceLines.length > 6) {
      return {
        questions: [],
        error: `Question #${b + 1} ("${rawPrompt.slice(0, 25)}...") cannot have more than 6 choices.`,
      };
    }

    const choices: { label: string; is_correct: boolean }[] = [];
    for (const cLine of choiceLines) {
      const isMarked =
        cLine.startsWith("*") ||
        cLine.startsWith("+") ||
        /\((?:correct|v|x)\)$/i.test(cLine) ||
        /\[(?:correct|v|x)\]$/i.test(cLine);

      let label = cLine
        .replace(/^[\*\+\-\–\—\•]\s*/, "")
        .replace(/^[A-Da-d][\.\)]\s*/, "")
        .replace(/\s*\((?:correct|v|x)\)$/i, "")
        .replace(/\s*\[(?:correct|v|x)\]$/i, "")
        .trim();

      if (!label) {
        label = cLine;
      }

      choices.push({ label, is_correct: isMarked });
    }

    const correctCount = choices.filter((c) => c.is_correct).length;
    if (correctCount !== 1) {
      return {
        questions: [],
        error: `Question #${b + 1} ("${rawPrompt.slice(0, 25)}...") must have exactly 1 correct choice marked with * (found ${correctCount}).`,
      };
    }

    questions.push({ prompt: rawPrompt, choices });
  }

  if (questions.length === 0) {
    return { questions: [], error: "No questions detected." };
  }

  return { questions, error: null };
}

function QuestionsModal({
  challenge,
  token,
  isOwner,
  onClose,
  onUpdated,
}: {
  challenge: AdminChallenge;
  token: string;
  isOwner: boolean;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [tab, setTab] = useState<"view" | "quick" | "builder">("view");
  const [questions, setQuestions] = useState<AdminQuestion[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<Message | null>(null);
  const [quickText, setQuickText] = useState("");

  // Builder states
  const [builderPrompt, setBuilderPrompt] = useState("");
  const [builderChoices, setBuilderChoices] = useState<string[]>(["", "", "", ""]);
  const [builderCorrectIdx, setBuilderCorrectIdx] = useState(0);
  const [builderList, setBuilderList] = useState<QuestionInput[]>([]);

  const canEdit = isOwner && (challenge.status === "draft" || challenge.status === "registration" || challenge.status === "ready");

  const loadQuestions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await listChallengeQuestions(token, challenge.id);
      setQuestions(rows);
    } catch (caught) {
      setError(describeError(caught, "Could not load questions."));
    } finally {
      setLoading(false);
    }
  }, [token, challenge.id]);

  useEffect(() => {
    void loadQuestions();
  }, [loadQuestions]);

  const quickParsed = parsePastedQuestions(quickText);

  async function handleSaveQuestions(questionsToSave: QuestionInput[]) {
    if (!questionsToSave.length) return;
    setSaving(true);
    try {
      await importChallengeQuestions(token, challenge.id, questionsToSave);
      await loadQuestions();
      onUpdated();
      setTab("view");
      setQuickText("");
      setBuilderList([]);
    } catch (caught) {
      setError(describeError(caught, "Could not save questions."));
    } finally {
      setSaving(false);
    }
  }

  function handleAddBuilderQuestion() {
    if (!builderPrompt.trim()) return;
    const validChoices = builderChoices.map((c) => c.trim()).filter(Boolean);
    if (validChoices.length < 2) return;

    const formattedChoices = validChoices.map((label, idx) => ({
      label,
      is_correct: idx === builderCorrectIdx,
    }));

    setBuilderList((prev) => [
      ...prev,
      {
        prompt: builderPrompt.trim(),
        choices: formattedChoices,
      },
    ]);

    setBuilderPrompt("");
    setBuilderChoices(["", "", "", ""]);
    setBuilderCorrectIdx(0);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[90vh] w-full max-w-xl flex-col rounded-t-3xl bg-[var(--card)] shadow-2xl sm:rounded-3xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-black/10 px-5 py-4">
          <div className="min-w-0 flex-1 pr-3">
            <h2 className="truncate text-base font-semibold">{challenge.title}</h2>
            <p className="text-xs text-[var(--muted)]">
              {questions ? `${questions.length} questions` : "Loading..."} · Status:{" "}
              <span className="font-semibold uppercase">{challenge.status}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="press h-8 rounded-full bg-black/5 px-3 text-xs font-semibold"
          >
            Close
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-2 border-b border-black/10 px-5 py-2.5">
          <button
            type="button"
            onClick={() => setTab("view")}
            className={`press h-8 rounded-full px-3 text-xs font-semibold ${
              tab === "view"
                ? "bg-[var(--foreground)] text-[var(--background)]"
                : "bg-black/5 text-[var(--muted)]"
            }`}
          >
            View ({questions?.length ?? 0})
          </button>
          {canEdit ? (
            <>
              <button
                type="button"
                onClick={() => setTab("quick")}
                className={`press h-8 rounded-full px-3 text-xs font-semibold ${
                  tab === "quick"
                    ? "bg-[var(--foreground)] text-[var(--background)]"
                    : "bg-black/5 text-[var(--muted)]"
                }`}
              >
                📋 Quick Paste / Bulk
              </button>
              <button
                type="button"
                onClick={() => setTab("builder")}
                className={`press h-8 rounded-full px-3 text-xs font-semibold ${
                  tab === "builder"
                    ? "bg-[var(--foreground)] text-[var(--background)]"
                    : "bg-black/5 text-[var(--muted)]"
                }`}
              >
                ✏️ Interactive Builder
              </button>
            </>
          ) : null}
        </div>

        {/* Content body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error ? (
            <div className="mb-4">
              <ErrorNotice error={error} onRetry={() => void loadQuestions()} />
            </div>
          ) : null}

          {/* VIEW TAB */}
          {tab === "view" ? (
            <div className="space-y-3">
              {loading ? (
                <div className="h-40 animate-pulse rounded-2xl bg-black/5" />
              ) : questions && questions.length > 0 ? (
                <div className="space-y-3">
                  {questions.map((q) => (
                    <div
                      key={q.id}
                      className="rounded-2xl border border-black/10 bg-[#faf8f4] p-3.5 text-xs shadow-sm"
                    >
                      <p className="font-semibold text-[var(--foreground)]">
                        <span className="text-[var(--accent)]">#{q.position}</span> {q.prompt}
                      </p>
                      <div className="mt-2.5 grid grid-cols-2 gap-1.5">
                        {q.choices.map((c) => (
                          <div
                            key={c.id}
                            className={`flex items-center justify-between rounded-xl px-2.5 py-1.5 text-xs ${
                              c.is_correct
                                ? "bg-emerald-100 font-semibold text-emerald-900 border border-emerald-300"
                                : "bg-black/5 text-[var(--muted)]"
                            }`}
                          >
                            <span className="truncate">{c.label}</span>
                            {c.is_correct ? (
                              <span className="ml-1 shrink-0 text-[10px] text-emerald-700">
                                ✓ Correct
                              </span>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl bg-[#faf8f4] p-8 text-center text-xs text-[var(--muted)]">
                  <p className="font-semibold text-sm text-[var(--foreground)]">No questions added yet</p>
                  <p className="mt-1">
                    {canEdit
                      ? "Use Quick Paste or Interactive Builder to add questions."
                      : "This challenge has no questions uploaded."}
                  </p>
                  {canEdit ? (
                    <div className="mt-4 flex flex-wrap justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setQuickText(formatSampleQuestionsForTextarea(SAMPLE_QUESTIONS));
                          setTab("quick");
                        }}
                        className="press h-8 rounded-full bg-[var(--accent)] px-3 text-xs font-semibold text-[var(--accent-text)]"
                      >
                        🇬🇧 English Trivia (10 Qs)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setQuickText(formatSampleQuestionsForTextarea(SAMPLE_QUESTIONS_AM));
                          setTab("quick");
                        }}
                        className="press h-8 rounded-full bg-[var(--accent)] px-3 text-xs font-semibold text-[var(--accent-text)]"
                      >
                        🇪🇹 አማርኛ የጥያቄ ጥቅል (10 Qs)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setQuickText(formatSampleQuestionsForTextarea(SAMPLE_QUESTIONS_OM));
                          setTab("quick");
                        }}
                        className="press h-8 rounded-full bg-[var(--accent)] px-3 text-xs font-semibold text-[var(--accent-text)]"
                      >
                        🌳 Afaan Oromoo (10 Qs)
                      </button>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          ) : null}

          {/* QUICK PASTE TAB */}
          {tab === "quick" ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-[var(--muted)]">
                  Use <span className="font-bold text-[var(--foreground)]">*</span> for correct answers and <span className="font-bold text-[var(--foreground)]">-</span> for incorrect ones, or paste JSON.
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-[var(--muted)]">Load:</span>
                  <button
                    type="button"
                    onClick={() => setQuickText(formatSampleQuestionsForTextarea(SAMPLE_QUESTIONS))}
                    className="press rounded-full border border-black/10 bg-black/5 px-2 py-0.5 text-[11px] font-semibold"
                  >
                    English
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuickText(formatSampleQuestionsForTextarea(SAMPLE_QUESTIONS_AM))}
                    className="press rounded-full border border-black/10 bg-black/5 px-2 py-0.5 text-[11px] font-semibold"
                  >
                    አማርኛ
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuickText(formatSampleQuestionsForTextarea(SAMPLE_QUESTIONS_OM))}
                    className="press rounded-full border border-black/10 bg-black/5 px-2 py-0.5 text-[11px] font-semibold"
                  >
                    Oromoo
                  </button>
                </div>
              </div>

              <textarea
                value={quickText}
                onChange={(e) => setQuickText(e.target.value)}
                placeholder={`1. What is the capital of Ethiopia?\n* Addis Ababa\n- Nairobi\n- Cairo\n- Khartoum\n\n2. What is 7 x 8?\n- 54\n* 56\n- 64`}
                rows={12}
                className="w-full font-mono text-xs leading-relaxed rounded-2xl border border-black/10 bg-transparent p-3 outline-none focus:border-[var(--accent)]"
              />

              {/* Status / Validation */}
              {quickText.trim() ? (
                <div
                  className={`rounded-2xl p-3 text-xs ${
                    quickParsed.error
                      ? "bg-rose-50 text-rose-800 border border-rose-200"
                      : "bg-emerald-50 text-emerald-800 border border-emerald-200"
                  }`}
                >
                  {quickParsed.error ? (
                    <p>⚠️ {quickParsed.error}</p>
                  ) : (
                    <p className="font-semibold">
                      ✓ {quickParsed.questions.length} questions parsed and ready to save.
                    </p>
                  )}
                </div>
              ) : null}

              <button
                type="button"
                disabled={!quickParsed.questions.length || Boolean(quickParsed.error) || saving}
                onClick={() => void handleSaveQuestions(quickParsed.questions)}
                className="press h-10 w-full rounded-full bg-[var(--accent)] text-xs font-semibold text-[var(--accent-text)] disabled:opacity-40"
              >
                {saving
                  ? "Saving..."
                  : `Save ${quickParsed.questions.length || ""} Questions to Challenge`}
              </button>
            </div>
          ) : null}

          {/* BUILDER TAB */}
          {tab === "builder" ? (
            <div className="space-y-4">
              <div className="space-y-3 rounded-2xl border border-black/10 bg-[#faf8f4] p-3.5">
                <p className="text-xs font-semibold">New Question</p>
                <input
                  value={builderPrompt}
                  onChange={(e) => setBuilderPrompt(e.target.value)}
                  placeholder="Question prompt, e.g. What is the capital of Ethiopia?"
                  className="h-9 w-full rounded-xl border border-black/10 bg-[var(--card)] px-3 text-xs outline-none focus:border-[var(--accent)]"
                />

                <p className="text-[11px] font-medium text-[var(--muted)]">Choices (select the radio for the correct answer):</p>
                <div className="space-y-2">
                  {builderChoices.map((choice, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="correctChoice"
                        checked={builderCorrectIdx === idx}
                        onChange={() => setBuilderCorrectIdx(idx)}
                        className="h-4 w-4 text-[var(--accent)]"
                      />
                      <input
                        value={choice}
                        onChange={(e) => {
                          const val = e.target.value;
                          setBuilderChoices((prev) => {
                            const next = [...prev];
                            next[idx] = val;
                            return next;
                          });
                        }}
                        placeholder={`Choice ${idx + 1}`}
                        className="h-8 flex-1 rounded-xl border border-black/10 bg-[var(--card)] px-2.5 text-xs outline-none focus:border-[var(--accent)]"
                      />
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  disabled={!builderPrompt.trim() || builderChoices.filter(Boolean).length < 2}
                  onClick={handleAddBuilderQuestion}
                  className="press h-8 w-full rounded-full bg-black/5 text-xs font-semibold disabled:opacity-40"
                >
                  + Add to List
                </button>
              </div>

              {builderList.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs font-semibold">Ready to Save ({builderList.length})</p>
                  {builderList.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between rounded-xl bg-black/5 px-3 py-2 text-xs"
                    >
                      <span className="truncate pr-2 font-medium">
                        {idx + 1}. {item.prompt}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setBuilderList((prev) => prev.filter((_, itemIdx) => itemIdx !== idx))
                        }
                        className="text-rose-600 font-semibold"
                      >
                        Remove
                      </button>
                    </div>
                  ))}

                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void handleSaveQuestions(builderList)}
                    className="press mt-3 h-10 w-full rounded-full bg-[var(--accent)] text-xs font-semibold text-[var(--accent-text)] disabled:opacity-40"
                  >
                    {saving ? "Saving..." : `Save All ${builderList.length} Questions`}
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ChallengesTab({ token, isOwner }: { token: string; isOwner: boolean }) {
  const load = useCallback(() => listAdminChallenges(token), [token]);
  const { data, error, reload } = useLoad<AdminChallenge[]>(load);
  const [creating, setCreating] = useState(false);
  const [questionMode, setQuestionMode] = useState<"starter_en" | "starter_am" | "starter_om" | "custom" | "later">("starter_en");
  const [customQuestionsText, setCustomQuestionsText] = useState("");
  const [viewingQuestionsFor, setViewingQuestionsFor] = useState<AdminChallenge | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Message | null>(null);

  const customParsed = parsePastedQuestions(customQuestionsText);

  const [form, setForm] = useState({
    title: "",
    description: "",
    category: "general",
    entry_fee_etb: "20",
    minimum_participants: 100,
    base_prize_etb: "1000",
    extra_prize_per_participant_etb: "10",
    question_count: 10,
    duration_seconds: 30,
    max_participants: "",
  });

  const [formStatus, setFormStatus] = useState<"draft" | "registration" | "live">("registration");
  const [formNotifyUsers, setFormNotifyUsers] = useState(true);

  function applyPreset(preset: (typeof PRESETS)[number]) {
    setForm({
      title: preset.title,
      description: preset.description,
      category: preset.category || "general",
      entry_fee_etb: preset.entry_fee_etb,
      minimum_participants: preset.minimum_participants,
      base_prize_etb: preset.base_prize_etb,
      extra_prize_per_participant_etb: preset.extra_prize_per_participant_etb,
      question_count: preset.question_count,
      duration_seconds: preset.duration_seconds,
      max_participants: preset.max_participants,
    });
  }

  async function handleCreate() {
    if (!form.title.trim()) return;

    let initialQuestions: QuestionInput[] | undefined = undefined;
    if (questionMode === "starter_en") {
      initialQuestions = SAMPLE_QUESTIONS;
    } else if (questionMode === "starter_am") {
      initialQuestions = SAMPLE_QUESTIONS_AM;
    } else if (questionMode === "starter_om") {
      initialQuestions = SAMPLE_QUESTIONS_OM;
    } else if (questionMode === "custom") {
      if (customParsed.error || customParsed.questions.length === 0) {
        setResult({
          tone: "error",
          title: "Check questions",
          message: customParsed.error || "Please paste at least one valid question.",
        });
        return;
      }
      initialQuestions = customParsed.questions;
    }

    const effectiveStatus = initialQuestions ? formStatus : "draft";
    const shouldNotify = effectiveStatus !== "draft" && formNotifyUsers;

    setBusy(true);
    try {
      await createAdminChallenge(token, {
        title: form.title.trim(),
        description: form.description.trim() || "Skill competition challenge",
        category: form.category.trim() ? form.category.trim().toLowerCase() : null,
        entry_fee_etb: form.entry_fee_etb || "0",
        minimum_participants: Number(form.minimum_participants) || 1,
        base_prize_etb: form.base_prize_etb || "0",
        extra_prize_per_participant_etb: form.extra_prize_per_participant_etb || "0",
        question_count: initialQuestions ? initialQuestions.length : (Number(form.question_count) || 10),
        duration_seconds: Number(form.duration_seconds) || 30,
        max_participants: form.max_participants ? Number(form.max_participants) : null,
        status: effectiveStatus,
        notify_users: shouldNotify,
        questions: initialQuestions,
      });
      setCreating(false);
      setCustomQuestionsText("");
      setQuestionMode("starter_en");
      setFormStatus("registration");
      setFormNotifyUsers(true);
      setForm({
        title: "",
        description: "",
        category: "general",
        entry_fee_etb: "20",
        minimum_participants: 100,
        base_prize_etb: "1000",
        extra_prize_per_participant_etb: "10",
        question_count: 10,
        duration_seconds: 30,
        max_participants: "",
      });
      await reload();
      setResult({
        tone: "success",
        title: shouldNotify ? "Challenge created & broadcast" : "Challenge created",
        message: shouldNotify
          ? `Challenge created as "${effectiveStatus}" and Telegram notification sent to all registered players!`
          : initialQuestions
          ? `The challenge was created with ${initialQuestions.length} questions attached in ${effectiveStatus} status.`
          : "The challenge was created in draft status. Add questions before taking it live.",
      });
    } catch (caught) {
      setResult(describeError(caught, "Could not create challenge."));
    } finally {
      setBusy(false);
    }
  }

  async function handleStatusChange(challenge: AdminChallenge, nextStatus: string) {
    setBusy(true);
    const shouldNotify = nextStatus === "registration" || nextStatus === "live";
    try {
      await updateAdminChallengeStatus(token, challenge.id, nextStatus, shouldNotify);
      await reload();
      setResult({
        tone: "success",
        title: "Status updated",
        message: shouldNotify
          ? `Challenge moved to "${nextStatus}" and notification sent to players on Telegram.`
          : `Challenge moved to ${nextStatus}.`,
      });
    } catch (caught) {
      setResult(describeError(caught, "Could not update challenge status."));
    } finally {
      setBusy(false);
    }
  }

  async function handleNotifyPlayers(challenge: AdminChallenge) {
    setBusy(true);
    try {
      const res = await notifyAdminChallenge(token, challenge.id);
      setResult({
        tone: "success",
        title: "Notification Sent",
        message: `Sent Telegram notification to ${res.sent} active player(s)! (Failed: ${res.failed})`,
      });
    } catch (caught) {
      setResult(describeError(caught, "Could not notify players."));
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteChallenge(challenge: AdminChallenge) {
    if (!confirm(`Delete "${challenge.title}"? This cannot be undone.`)) {
      return;
    }
    setBusy(true);
    try {
      await deleteAdminChallenge(token, challenge.id);
      await reload();
      setResult({
        tone: "success",
        title: "Challenge deleted",
        message: `"${challenge.title}" has been deleted.`,
      });
    } catch (caught) {
      setResult(describeError(caught, "Could not delete challenge."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rise space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Challenges ({data?.length ?? 0})</h2>
        {isOwner && !creating ? (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="press h-8 rounded-full bg-[var(--accent)] px-3 text-xs font-semibold text-[var(--accent-text)]"
          >
            + New challenge
          </button>
        ) : null}
      </div>

      {creating ? (
        <div className="space-y-3 rounded-3xl bg-[var(--card)] px-5 py-5 shadow-[0_8px_24px_rgba(28,25,21,0.05)]">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Create new challenge</h3>
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="text-xs text-[var(--muted)]"
            >
              Cancel
            </button>
          </div>

          {/* Quick Presets */}
          <div>
            <p className="text-[11px] font-medium text-[var(--muted)]">Quick presets:</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => applyPreset(p)}
                  className="press rounded-full border border-black/10 bg-black/5 px-2.5 py-1 text-[11px] font-medium text-[var(--foreground)] hover:bg-black/10"
                >
                  ⚡ {p.label}
                </button>
              ))}
            </div>
          </div>

          <label className="block text-xs font-medium text-[var(--muted)]">
            Title
            <input
              value={form.title}
              onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
              placeholder="e.g. Daily Tech & Trivia"
              className="mt-1 h-10 w-full rounded-2xl border border-black/10 bg-transparent px-3 text-sm outline-none focus:border-[var(--accent)]"
            />
          </label>

          <label className="block text-xs font-medium text-[var(--muted)]">
            Description
            <input
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="Rules and description"
              className="mt-1 h-10 w-full rounded-2xl border border-black/10 bg-transparent px-3 text-sm outline-none focus:border-[var(--accent)]"
            />
          </label>

          <div className="space-y-1">
            <label className="block text-xs font-medium text-[var(--muted)]">
              Topic / Category
            </label>
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {Object.entries(CATEGORIES)
                .filter(([k]) => k !== "all")
                .map(([catKey, meta]) => {
                  const selected = form.category.toLowerCase() === catKey;
                  return (
                    <button
                      key={catKey}
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, category: catKey }))}
                      className={`press flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold border transition-all ${
                        selected
                          ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-text)] shadow-xs"
                          : "border-black/10 bg-transparent text-[var(--muted)] hover:text-[var(--foreground)]"
                      }`}
                    >
                      <span>{meta.icon}</span>
                      <span>{meta.name.en}</span>
                    </button>
                  );
                })}
            </div>
            <input
              value={form.category}
              onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
              placeholder="Or enter custom category slug (e.g. music, cinema)"
              className="mt-1 h-9 w-full rounded-xl border border-black/10 bg-transparent px-3 text-xs outline-none focus:border-[var(--accent)]"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs font-medium text-[var(--muted)]">
              Entry fee (ETB)
              <input
                type="number"
                value={form.entry_fee_etb}
                onChange={(e) => setForm((prev) => ({ ...prev, entry_fee_etb: e.target.value }))}
                className="mt-1 h-10 w-full rounded-2xl border border-black/10 bg-transparent px-3 text-sm outline-none focus:border-[var(--accent)]"
              />
            </label>

            <label className="block text-xs font-medium text-[var(--muted)]">
              Min players
              <input
                type="number"
                value={form.minimum_participants}
                onChange={(e) => setForm((prev) => ({ ...prev, minimum_participants: Number(e.target.value) }))}
                className="mt-1 h-10 w-full rounded-2xl border border-black/10 bg-transparent px-3 text-sm outline-none focus:border-[var(--accent)]"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs font-medium text-[var(--muted)]">
              Base prize (ETB)
              <input
                type="number"
                value={form.base_prize_etb}
                onChange={(e) => setForm((prev) => ({ ...prev, base_prize_etb: e.target.value }))}
                className="mt-1 h-10 w-full rounded-2xl border border-black/10 bg-transparent px-3 text-sm outline-none focus:border-[var(--accent)]"
              />
            </label>

            <label className="block text-xs font-medium text-[var(--muted)]">
              Extra/player (ETB)
              <input
                type="number"
                value={form.extra_prize_per_participant_etb}
                onChange={(e) => setForm((prev) => ({ ...prev, extra_prize_per_participant_etb: e.target.value }))}
                className="mt-1 h-10 w-full rounded-2xl border border-black/10 bg-transparent px-3 text-sm outline-none focus:border-[var(--accent)]"
              />
            </label>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <label className="block text-xs font-medium text-[var(--muted)]">
              Questions
              <input
                type="number"
                value={form.question_count}
                onChange={(e) => setForm((prev) => ({ ...prev, question_count: Number(e.target.value) }))}
                className="mt-1 h-10 w-full rounded-2xl border border-black/10 bg-transparent px-3 text-sm outline-none focus:border-[var(--accent)]"
              />
            </label>

            <label className="block text-xs font-medium text-[var(--muted)]">
              Seconds
              <input
                type="number"
                value={form.duration_seconds}
                onChange={(e) => setForm((prev) => ({ ...prev, duration_seconds: Number(e.target.value) }))}
                className="mt-1 h-10 w-full rounded-2xl border border-black/10 bg-transparent px-3 text-sm outline-none focus:border-[var(--accent)]"
              />
            </label>

            <label className="block text-xs font-medium text-[var(--muted)]">
              Max seats
              <input
                type="number"
                placeholder="Optional"
                value={form.max_participants}
                onChange={(e) => setForm((prev) => ({ ...prev, max_participants: e.target.value }))}
                className="mt-1 h-10 w-full rounded-2xl border border-black/10 bg-transparent px-3 text-sm outline-none focus:border-[var(--accent)]"
              />
            </label>
          </div>

          <div className="space-y-2 border-t border-black/10 pt-3">
            <p className="text-xs font-semibold text-[var(--foreground)]">Questions setup:</p>
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
              <button
                type="button"
                onClick={() => setQuestionMode("starter_en")}
                className={`press h-8 rounded-xl px-1.5 text-[11px] font-medium ${
                  questionMode === "starter_en"
                    ? "bg-[var(--accent)] text-[var(--accent-text)] font-semibold"
                    : "bg-black/5 text-[var(--muted)]"
                }`}
              >
                🇬🇧 English (10)
              </button>
              <button
                type="button"
                onClick={() => setQuestionMode("starter_am")}
                className={`press h-8 rounded-xl px-1.5 text-[11px] font-medium ${
                  questionMode === "starter_am"
                    ? "bg-[var(--accent)] text-[var(--accent-text)] font-semibold"
                    : "bg-black/5 text-[var(--muted)]"
                }`}
              >
                🇪🇹 አማርኛ (10)
              </button>
              <button
                type="button"
                onClick={() => setQuestionMode("starter_om")}
                className={`press h-8 rounded-xl px-1.5 text-[11px] font-medium ${
                  questionMode === "starter_om"
                    ? "bg-[var(--accent)] text-[var(--accent-text)] font-semibold"
                    : "bg-black/5 text-[var(--muted)]"
                }`}
              >
                🌳 Oromoo (10)
              </button>
              <button
                type="button"
                onClick={() => setQuestionMode("custom")}
                className={`press h-8 rounded-xl px-1.5 text-[11px] font-medium ${
                  questionMode === "custom"
                    ? "bg-[var(--accent)] text-[var(--accent-text)] font-semibold"
                    : "bg-black/5 text-[var(--muted)]"
                }`}
              >
                📋 Custom
              </button>
              <button
                type="button"
                onClick={() => setQuestionMode("later")}
                className={`press h-8 rounded-xl px-1.5 text-[11px] font-medium ${
                  questionMode === "later"
                    ? "bg-[var(--accent)] text-[var(--accent-text)] font-semibold"
                    : "bg-black/5 text-[var(--muted)]"
                }`}
              >
                ⏳ Later
              </button>
            </div>

            {questionMode === "starter_en" ? (
              <p className="rounded-xl bg-emerald-50 p-2.5 text-[11px] text-emerald-800">
                ✓ Challenge will be created with 10 starter English trivia questions ready in draft.
              </p>
            ) : null}

            {questionMode === "starter_am" ? (
              <p className="rounded-xl bg-emerald-50 p-2.5 text-[11px] text-emerald-800">
                ✓ ውድድሩ 10 የአማርኛ አጠቃላይ ዕውቀት ጥያቄዎች ተካተውበት በረቂቅ ዝግጁ ይሆናል።
              </p>
            ) : null}

            {questionMode === "starter_om" ? (
              <p className="rounded-xl bg-emerald-50 p-2.5 text-[11px] text-emerald-800">
                ✓ Dorgommiin kun gaaffilee beekumsa waliigalaa Afaan Oromoo 10 wajjin qophii ta'a.
              </p>
            ) : null}

            {questionMode === "custom" ? (
              <div className="space-y-2 pt-1">
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <p className="text-[11px] text-[var(--muted)]">
                    Paste with <span className="font-bold text-[var(--foreground)]">*</span> for correct answers:
                  </p>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setCustomQuestionsText(formatSampleQuestionsForTextarea(SAMPLE_QUESTIONS))}
                      className="press rounded-full border border-black/10 bg-black/5 px-2 py-0.5 text-[10px] font-semibold"
                    >
                      EN Template
                    </button>
                    <button
                      type="button"
                      onClick={() => setCustomQuestionsText(formatSampleQuestionsForTextarea(SAMPLE_QUESTIONS_AM))}
                      className="press rounded-full border border-black/10 bg-black/5 px-2 py-0.5 text-[10px] font-semibold"
                    >
                      አማርኛ
                    </button>
                    <button
                      type="button"
                      onClick={() => setCustomQuestionsText(formatSampleQuestionsForTextarea(SAMPLE_QUESTIONS_OM))}
                      className="press rounded-full border border-black/10 bg-black/5 px-2 py-0.5 text-[10px] font-semibold"
                    >
                      Oromoo
                    </button>
                  </div>
                </div>
                <textarea
                  value={customQuestionsText}
                  onChange={(e) => setCustomQuestionsText(e.target.value)}
                  placeholder={`1. What is the capital of Ethiopia?\n* Addis Ababa\n- Nairobi\n- Cairo\n- Khartoum\n\n2. What is 7 x 8?\n- 54\n* 56\n- 64`}
                  rows={6}
                  className="w-full font-mono text-xs leading-relaxed rounded-2xl border border-black/10 bg-transparent p-3 outline-none focus:border-[var(--accent)]"
                />
                {customQuestionsText.trim() ? (
                  <div
                    className={`rounded-xl p-2 text-xs ${
                      customParsed.error
                        ? "bg-rose-50 text-rose-800 border border-rose-200"
                        : "bg-emerald-50 text-emerald-800 border border-emerald-200"
                    }`}
                  >
                    {customParsed.error ? (
                      <p>⚠️ {customParsed.error}</p>
                    ) : (
                      <p className="font-semibold">
                        ✓ {customParsed.questions.length} questions parsed and will be saved directly.
                      </p>
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}

            {questionMode === "later" ? (
              <p className="rounded-xl bg-amber-50 p-2.5 text-[11px] text-amber-800">
                ⚠️ Challenge will be created in draft without questions. You can add questions anytime later using the 📝 Questions button.
              </p>
            ) : null}
          </div>

          {/* Publishing & Notification */}
          <div className="space-y-2 border-t border-black/10 pt-3">
            <p className="text-xs font-semibold text-[var(--foreground)]">Publish & Notification:</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label className="block text-xs font-medium text-[var(--muted)]">
                Initial Status
                <select
                  value={questionMode === "later" ? "draft" : formStatus}
                  disabled={questionMode === "later"}
                  onChange={(e) => setFormStatus(e.target.value as "draft" | "registration" | "live")}
                  className="mt-1 h-10 w-full rounded-2xl border border-black/10 bg-transparent px-3 text-xs outline-none focus:border-[var(--accent)] disabled:opacity-40"
                >
                  <option value="registration">Open Registration</option>
                  <option value="live">Live Immediately</option>
                  <option value="draft">Draft (Private)</option>
                </select>
              </label>

              <div className="flex flex-col justify-end">
                <label className="flex items-center gap-2 pb-2 text-xs font-medium text-[var(--foreground)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formNotifyUsers}
                    disabled={questionMode === "later" || formStatus === "draft"}
                    onChange={(e) => setFormNotifyUsers(e.target.checked)}
                    className="h-4 w-4 rounded accent-[var(--accent)]"
                  />
                  <span>📢 Notify players on Telegram</span>
                </label>
              </div>
            </div>
            {questionMode !== "later" && formStatus !== "draft" && formNotifyUsers ? (
              <p className="rounded-xl bg-amber-50 p-2.5 text-[11px] text-amber-800">
                📢 All registered players will automatically receive a Telegram notification with a direct Play button as soon as this challenge is created!
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2">
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="press h-10 rounded-full bg-black/5 text-xs font-semibold"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!form.title.trim() || busy}
              onClick={() => void handleCreate()}
              className="press h-10 rounded-full bg-[var(--accent)] text-xs font-semibold text-[var(--accent-text)] disabled:opacity-40"
            >
              Create challenge
            </button>
          </div>
        </div>
      ) : null}

      {error ? <ErrorNotice error={error} onRetry={() => void reload()} /> : null}
      {!data && !error ? <div className="h-40 animate-pulse rounded-3xl bg-black/5" /> : null}

      {data && data.length === 0 ? (
        <p className="rounded-3xl bg-[var(--card)] px-5 py-6 text-sm text-[var(--muted)]">
          No challenges found.
        </p>
      ) : null}

      {data?.map((challenge) => {
        const statusStyle = CHALLENGE_STATUS_STYLES[challenge.status] ?? "bg-zinc-100 text-zinc-700";
        const transitions = ALLOWED_STATUS_TRANSITIONS[challenge.status] ?? [];
        const isDeletable =
          isOwner &&
          (challenge.status === "draft" || challenge.status === "cancelled") &&
          challenge.participant_count === 0;

        const categoryMeta = challenge.category ? getCategoryMeta(challenge.category) : null;

        return (
          <article
            key={challenge.id}
            className="space-y-3 rounded-3xl bg-[var(--card)] px-5 py-4 shadow-[0_8px_24px_rgba(28,25,21,0.05)]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="text-sm font-semibold">{challenge.title}</p>
                  {categoryMeta ? (
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${categoryMeta.accentBg} ${categoryMeta.accentText}`}>
                      {categoryMeta.icon} {categoryMeta.name.en}
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 line-clamp-1 text-xs text-[var(--muted)]">
                  {challenge.description}
                </p>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${statusStyle}`}>
                {challenge.status}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 rounded-2xl bg-[#f7f4ee] p-2 text-center text-xs">
              <div>
                <p className="text-[10px] uppercase text-[var(--muted)]">Entry</p>
                <p className="font-semibold">{Number(challenge.entry_fee_etb) > 0 ? `${etb(challenge.entry_fee_etb)} ETB` : "Free"}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-[var(--muted)]">Players</p>
                <p className="font-semibold">{challenge.participant_count} / {challenge.max_participants ?? challenge.minimum_participants}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-[var(--muted)]">Base Prize</p>
                <p className="font-semibold">{etb(challenge.base_prize_etb)} ETB</p>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-[var(--muted)]">
              <span>{challenge.question_count} questions · {challenge.duration_seconds}s</span>
              <span>{when(challenge.created_at)}</span>
            </div>

            {/* Questions toolbar & actions */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-black/5 pt-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setViewingQuestionsFor(challenge)}
                  className="press inline-flex items-center gap-1.5 rounded-full bg-black/5 px-3 py-1.5 text-xs font-semibold text-[var(--foreground)] hover:bg-black/10"
                >
                  <span>📝 Questions ({challenge.question_count})</span>
                  <span className="text-[10px] text-[var(--muted)]">View & Edit →</span>
                </button>

                {isOwner && (challenge.status === "registration" || challenge.status === "ready" || challenge.status === "live") ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleNotifyPlayers(challenge)}
                    className="press inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-200 disabled:opacity-40"
                    title="Send a Telegram notification broadcast about this challenge"
                  >
                    <span>📢 Notify Players</span>
                  </button>
                ) : null}
              </div>

              {isDeletable ? (
                <button
                  type="button"
                  onClick={() => void handleDeleteChallenge(challenge)}
                  className="press rounded-full bg-rose-50 px-3 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100"
                >
                  Delete
                </button>
              ) : null}
            </div>

            {isOwner && transitions.length > 0 ? (
              <div className="flex flex-wrap gap-2 border-t border-black/10 pt-3">
                {transitions.map((next) => (
                  <button
                    key={next}
                    type="button"
                    disabled={busy}
                    onClick={() => void handleStatusChange(challenge, next)}
                    className={`press h-8 rounded-full px-3 text-xs font-semibold ${
                      next === "cancelled"
                        ? "bg-rose-100 text-rose-700 hover:bg-rose-200"
                        : "bg-[var(--accent)] text-[var(--accent-text)]"
                    } disabled:opacity-40`}
                  >
                    → {TRANSITION_LABELS[next] ?? next}
                  </button>
                ))}
              </div>
            ) : null}
          </article>
        );
      })}

      {viewingQuestionsFor ? (
        <QuestionsModal
          challenge={viewingQuestionsFor}
          token={token}
          isOwner={isOwner}
          onClose={() => setViewingQuestionsFor(null)}
          onUpdated={() => void reload()}
        />
      ) : null}

      {busy ? <LoadingOverlay title="Updating challenge" /> : null}
      {result && !busy ? (
        <ResultDialog result={result} onClose={() => setResult(null)} actionLabel="Done" />
      ) : null}
    </section>
  );
}

function PlayersTab({ token, isOwner }: { token: string; isOwner: boolean }) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const load = useCallback(() => listAdminPlayers(token, debouncedSearch || undefined), [token, debouncedSearch]);
  const { data, error, reload } = useLoad<AdminPlayer[]>(load);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Message | null>(null);

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedSearch(search), 350);
    return () => window.clearTimeout(id);
  }, [search]);

  async function handleToggleBlock(player: AdminPlayer) {
    setBusy(true);
    try {
      if (player.is_blocked) {
        await unblockAdminPlayer(token, player.id);
        setResult({
          tone: "success",
          title: "Player unblocked",
          message: `${player.first_name} is now unblocked.`,
        });
      } else {
        await blockAdminPlayer(token, player.id);
        setResult({
          tone: "success",
          title: "Player blocked",
          message: `${player.first_name} has been blocked.`,
        });
      }
      await reload();
    } catch (caught) {
      setResult(describeError(caught, "Could not update player block status."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rise space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Players ({data?.length ?? 0})</h2>
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by name or @username..."
        className="h-11 w-full rounded-2xl border border-black/10 bg-[var(--card)] px-4 text-sm outline-none focus:border-[var(--accent)]"
      />

      {error ? <ErrorNotice error={error} onRetry={() => void reload()} /> : null}
      {!data && !error ? <div className="h-40 animate-pulse rounded-3xl bg-black/5" /> : null}

      {data && data.length === 0 ? (
        <p className="rounded-3xl bg-[var(--card)] px-5 py-6 text-sm text-[var(--muted)]">
          No players found.
        </p>
      ) : null}

      {data && data.length > 0 ? (
        <ul className="rounded-3xl bg-[var(--card)] px-5 py-2 shadow-[0_8px_24px_rgba(28,25,21,0.05)]">
          {data.map((player) => {
            const fullName = [player.first_name, player.last_name].filter(Boolean).join(" ");
            return (
              <li
                key={player.id}
                className="flex items-center justify-between gap-3 border-t border-black/10 py-3.5 first:border-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold">{fullName}</p>
                    {player.is_blocked ? (
                      <span className="shrink-0 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold uppercase text-rose-700">
                        Blocked
                      </span>
                    ) : null}
                  </div>
                  <p className="text-xs text-[var(--muted)]">
                    {player.username ? `@${player.username} · ` : ""}ID: {player.telegram_id}
                  </p>
                  <p className="mt-0.5 text-xs font-medium text-[var(--muted)]">
                    Balance: <span className="font-semibold text-[var(--foreground)]">{etb(player.balance_etb)} ETB</span> · Joined {when(player.created_at)}
                  </p>
                </div>

                {isOwner ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleToggleBlock(player)}
                    className={`press shrink-0 h-8 rounded-full px-3 text-xs font-semibold ${
                      player.is_blocked
                        ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                        : "bg-rose-100 text-rose-700 hover:bg-rose-200"
                    } disabled:opacity-40`}
                  >
                    {player.is_blocked ? "Unblock" : "Block"}
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {busy ? <LoadingOverlay title="Updating player" /> : null}
      {result && !busy ? (
        <ResultDialog result={result} onClose={() => setResult(null)} actionLabel="Done" />
      ) : null}
    </section>
  );
}

function SpinTab({ token }: { token: string }) {
  const load = useCallback(() => getAdminSpinOverview(token), [token]);
  const { data, error, reload } = useLoad<AdminSpinOverview>(load);

  const [isEnabled, setIsEnabled] = useState<boolean | null>(null);
  const [cooldownHours, setCooldownHours] = useState<number | null>(null);
  const [segments, setSegments] = useState<SpinSegment[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Message | null>(null);

  useEffect(() => {
    if (data) {
      setIsEnabled(data.is_enabled);
      setCooldownHours(data.cooldown_hours);
      setSegments(data.segments);
    }
  }, [data]);

  if (error) return <ErrorNotice error={error} onRetry={() => void reload()} />;
  if (!data) {
    return <div className="h-44 animate-pulse rounded-3xl bg-black/5" />;
  }

  const currentSegments = segments ?? data.segments;
  const currentEnabled = isEnabled ?? data.is_enabled;
  const currentCooldown = cooldownHours ?? data.cooldown_hours;

  const hasChanges =
    currentEnabled !== data.is_enabled ||
    currentCooldown !== data.cooldown_hours ||
    JSON.stringify(currentSegments) !== JSON.stringify(data.segments);

  function handleSegmentChange(index: number, field: keyof SpinSegment, value: string | number) {
    setSegments((prev) => {
      const base = prev ?? data?.segments ?? [];
      const updated = [...base];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  }

  function handleAddSegment() {
    setSegments((prev) => {
      const base = prev ?? data?.segments ?? [];
      const newId = base.length > 0 ? Math.max(...base.map((s) => s.id)) + 1 : 1;
      return [
        ...base,
        {
          id: newId,
          label: "New Prize",
          amount_etb: "1.00",
          weight: 10,
          color: "#10b981",
        },
      ];
    });
  }

  function handleRemoveSegment(index: number) {
    const base = segments ?? data?.segments ?? [];
    if (base.length <= 2) {
      setResult({
        tone: "error",
        title: "Minimum segments",
        message: "The wheel requires at least 2 segments.",
      });
      return;
    }
    setSegments(base.filter((_, i) => i !== index));
  }

  async function handleSave() {
    if (currentSegments.length < 2) {
      setResult({
        tone: "error",
        title: "Minimum segments",
        message: "The wheel requires at least 2 segments.",
      });
      return;
    }
    setBusy(true);
    try {
      await updateAdminSpinConfig(token, {
        is_enabled: currentEnabled,
        cooldown_hours: currentCooldown,
        segments: currentSegments,
      });
      await reload();
      setResult({
        tone: "success",
        title: "Saved",
        message: "Daily spin configuration and wheel prizes updated successfully.",
      });
    } catch (caught) {
      setResult(describeError(caught, "Could not save spin configuration."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Overview Stats */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-3xl bg-[var(--card)] p-4 shadow-[0_8px_24px_rgba(28,25,21,0.05)]">
          <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]">Wheel Status</span>
          <p className="mt-1 flex items-center gap-1.5 text-base font-bold">
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${currentEnabled ? "bg-emerald-500" : "bg-rose-500"}`} />
            {currentEnabled ? "Active" : "Disabled"}
          </p>
          <p className="mt-0.5 text-[10px] text-[var(--muted)]">{currentCooldown}h cooldown</p>
        </div>
        <div className="rounded-3xl bg-[var(--card)] p-4 shadow-[0_8px_24px_rgba(28,25,21,0.05)]">
          <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]">Spins Today</span>
          <p className="mt-1 text-lg font-bold tabular-nums text-[var(--foreground)]">{data.spins_today}</p>
          <p className="mt-0.5 text-[10px] text-[var(--muted)]">Last 24 hours</p>
        </div>
        <div className="rounded-3xl bg-[var(--card)] p-4 shadow-[0_8px_24px_rgba(28,25,21,0.05)]">
          <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]">Total Spins</span>
          <p className="mt-1 text-lg font-bold tabular-nums text-[var(--foreground)]">{data.total_spins}</p>
          <p className="mt-0.5 text-[10px] text-[var(--muted)]">All-time spins</p>
        </div>
        <div className="rounded-3xl bg-[var(--card)] p-4 shadow-[0_8px_24px_rgba(28,25,21,0.05)]">
          <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]">Total Payout</span>
          <p className="mt-1 text-lg font-bold tabular-nums text-emerald-600">{etb(data.total_payout_etb)} ETB</p>
          <p className="mt-0.5 text-[10px] text-[var(--muted)]">All-time cash won</p>
        </div>
      </div>

      {/* Main Settings Card */}
      <section className="rise rounded-3xl bg-[var(--card)] p-5 shadow-[0_8px_24px_rgba(28,25,21,0.05)] space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">Daily Spin Availability & Cooldown</h2>
            <p className="text-xs text-[var(--muted)]">Control whether players can spin and how often.</p>
          </div>
          <button
            type="button"
            onClick={() => setIsEnabled(!currentEnabled)}
            className={`press h-8 rounded-full px-3.5 text-xs font-semibold ${
              currentEnabled ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
            }`}
          >
            {currentEnabled ? "Enabled ✓" : "Disabled ✕"}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          <label className="block text-xs font-medium text-[var(--muted)]">
            Cooldown Period (Hours)
            <input
              type="number"
              min="1"
              max="168"
              value={currentCooldown}
              onChange={(e) => setCooldownHours(Math.max(1, Number(e.target.value)))}
              className="mt-1 h-11 w-full rounded-2xl border border-black/10 bg-transparent px-4 text-sm font-semibold tabular-nums text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
            />
            <span className="text-[10px] text-[var(--muted)] mt-0.5 block">Default is 24 hours (1 spin per day)</span>
          </label>
        </div>
      </section>

      {/* Wheel Prize Segments Card */}
      <section className="rise rounded-3xl bg-[var(--card)] p-5 shadow-[0_8px_24px_rgba(28,25,21,0.05)] space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">Lucky Wheel Prize Segments ({currentSegments.length})</h2>
            <p className="text-xs text-[var(--muted)]">
              Customize wheel labels, cash prize amounts, and probability weights.
            </p>
          </div>
          <button
            type="button"
            onClick={handleAddSegment}
            className="press h-8 rounded-full bg-black/5 px-3 text-xs font-semibold hover:bg-black/10"
          >
            + Add Segment
          </button>
        </div>

        <div className="space-y-2.5 pt-2">
          {currentSegments.map((seg, idx) => (
            <div
              key={seg.id || idx}
              className="flex flex-col sm:flex-row items-start sm:items-center gap-2.5 rounded-2xl bg-[#fbf9f5] p-3 border border-black/5"
            >
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-black/10 text-[10px] font-bold">
                  {idx + 1}
                </span>
                <input
                  type="color"
                  value={seg.color || "#3b82f6"}
                  onChange={(e) => handleSegmentChange(idx, "color", e.target.value)}
                  className="h-7 w-7 cursor-pointer rounded-lg border-0 bg-transparent p-0"
                  title="Segment color"
                />
                <input
                  type="text"
                  placeholder="Prize Label (e.g. 5 ETB)"
                  value={seg.label}
                  onChange={(e) => handleSegmentChange(idx, "label", e.target.value)}
                  className="h-9 flex-1 sm:w-36 rounded-xl border border-black/10 bg-white px-2.5 text-xs font-semibold outline-none focus:border-[var(--accent)]"
                />
              </div>

              <div className="flex items-center gap-2 w-full sm:flex-1 justify-between sm:justify-start">
                <label className="flex items-center gap-1 text-[11px] text-[var(--muted)]">
                  ETB:
                  <input
                    type="number"
                    step="0.25"
                    min="0"
                    value={seg.amount_etb}
                    onChange={(e) => handleSegmentChange(idx, "amount_etb", e.target.value)}
                    className="h-9 w-20 rounded-xl border border-black/10 bg-white px-2 text-xs font-semibold tabular-nums outline-none focus:border-[var(--accent)]"
                  />
                </label>

                <label className="flex items-center gap-1 text-[11px] text-[var(--muted)]" title="Relative probability weight">
                  Weight:
                  <input
                    type="number"
                    min="1"
                    max="1000"
                    value={seg.weight}
                    onChange={(e) => handleSegmentChange(idx, "weight", Math.max(1, Number(e.target.value)))}
                    className="h-9 w-16 rounded-xl border border-black/10 bg-white px-2 text-xs font-semibold tabular-nums outline-none focus:border-[var(--accent)]"
                  />
                </label>

                <button
                  type="button"
                  onClick={() => handleRemoveSegment(idx)}
                  className="press flex h-8 w-8 items-center justify-center rounded-full text-xs text-rose-500 hover:bg-rose-50"
                  title="Remove segment"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          disabled={!hasChanges || busy}
          onClick={() => void handleSave()}
          className="press mt-3 h-11 w-full rounded-full bg-[var(--accent)] text-sm font-semibold text-[var(--accent-text)] disabled:opacity-40"
        >
          Save All Spin Settings
        </button>
      </section>

      {busy ? <LoadingOverlay title="Saving spin configuration" /> : null}
      {result && !busy ? (
        <ResultDialog result={result} onClose={() => setResult(null)} actionLabel="Done" />
      ) : null}
    </div>
  );
}

function QuestionBankTab({ token, isOwner }: { token: string; isOwner: boolean }) {
  const [categories, setCategories] = useState<AdminQuestionCategory[] | null>(null);
  const [selectedCat, setSelectedCat] = useState<string>("all");
  const [questions, setQuestions] = useState<AdminBankQuestion[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Message | null>(null);

  // Modals
  const [modal, setModal] = useState<"none" | "new_category" | "new_question" | "import_questions">("none");

  // New Category Form
  const [newCatSlug, setNewCatSlug] = useState("");
  const [newCatName, setNewCatName] = useState("");
  const [newCatIcon, setNewCatIcon] = useState("🎯");
  const [newCatDesc, setNewCatDesc] = useState("");

  // New Question Form
  const [qCat, setQCat] = useState("general");
  const [qPrompt, setQPrompt] = useState("");
  const [qChoices, setQChoices] = useState<string[]>(["", "", "", ""]);
  const [qCorrectIdx, setQCorrectIdx] = useState<number>(0);

  // Import JSON Form
  const [importCat, setImportCat] = useState("general");
  const [importJson, setImportJson] = useState("");

  const loadCategories = useCallback(async () => {
    try {
      const cats = await listAdminCategories(token);
      setCategories(cats);
      if (cats.length > 0 && !cats.some((c) => c.id === qCat)) {
        setQCat(cats[0].id);
        setImportCat(cats[0].id);
      }
    } catch (err) {
      setResult(describeError(err, "Failed to load question categories."));
    }
  }, [token, qCat]);

  const loadQuestions = useCallback(
    async (catId: string) => {
      try {
        const qs = await listAdminBankQuestions(token, catId === "all" ? undefined : catId, 150);
        setQuestions(qs);
      } catch (err) {
        setResult(describeError(err, "Failed to load questions."));
      }
    },
    [token],
  );

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    void loadQuestions(selectedCat);
  }, [selectedCat, loadQuestions]);

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatSlug.trim() || !newCatName.trim()) {
      setResult({ tone: "error", title: "Missing fields", message: "Category ID and Name are required." });
      return;
    }
    setBusy(true);
    try {
      await createAdminCategory(token, {
        id: newCatSlug.trim().toLowerCase(),
        name: newCatName.trim(),
        icon: newCatIcon.trim() || "🎯",
        description: newCatDesc.trim() || undefined,
      });
      setResult({ tone: "success", title: "Category Created", message: `Successfully added ${newCatName}.` });
      setNewCatSlug("");
      setNewCatName("");
      setNewCatIcon("🎯");
      setNewCatDesc("");
      setModal("none");
      await loadCategories();
    } catch (err) {
      setResult(describeError(err, "Could not create category."));
    } finally {
      setBusy(false);
    }
  };

  const handleToggleCategoryActive = async (cat: AdminQuestionCategory) => {
    setBusy(true);
    try {
      await updateAdminCategory(token, cat.id, { is_active: !cat.is_active });
      await loadCategories();
    } catch (err) {
      setResult(describeError(err, "Could not update category status."));
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteCategory = async (cat: AdminQuestionCategory) => {
    if (!confirm(`Are you sure you want to delete category "${cat.name}"?`)) return;
    setBusy(true);
    try {
      await deleteAdminCategory(token, cat.id);
      setResult({ tone: "success", title: "Category Deleted", message: `Removed ${cat.name}.` });
      if (selectedCat === cat.id) setSelectedCat("all");
      await loadCategories();
    } catch (err) {
      setResult(describeError(err, "Could not delete category."));
    } finally {
      setBusy(false);
    }
  };

  const handleCreateQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!qPrompt.trim()) {
      setResult({ tone: "error", title: "Missing Prompt", message: "Question prompt cannot be empty." });
      return;
    }
    const filteredChoices = qChoices.map((c) => c.trim());
    if (filteredChoices.some((c) => !c)) {
      setResult({ tone: "error", title: "Incomplete Choices", message: "All 4 choices must be filled in." });
      return;
    }
    setBusy(true);
    try {
      await createAdminBankQuestion(token, {
        category: qCat,
        prompt: qPrompt.trim(),
        choices: filteredChoices.map((label, idx) => ({
          label,
          is_correct: idx === qCorrectIdx,
        })),
      });
      setResult({ tone: "success", title: "Question Added", message: "Question saved to the question bank." });
      setQPrompt("");
      setQChoices(["", "", "", ""]);
      setQCorrectIdx(0);
      setModal("none");
      await loadCategories();
      await loadQuestions(selectedCat);
    } catch (err) {
      setResult(describeError(err, "Could not create question."));
    } finally {
      setBusy(false);
    }
  };

  const handleImportJson = async (e: React.FormEvent) => {
    e.preventDefault();
    let parsed: any;
    try {
      parsed = JSON.parse(importJson.trim());
    } catch {
      setResult({ tone: "error", title: "Invalid JSON", message: "Please enter valid JSON array of questions." });
      return;
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
      setResult({ tone: "error", title: "Empty Questions", message: "JSON must be a non-empty array of questions." });
      return;
    }

    setBusy(true);
    try {
      const res = await importAdminBankQuestions(token, importCat, parsed);
      setResult({ tone: "success", title: "Questions Imported", message: res.message });
      setImportJson("");
      setModal("none");
      await loadCategories();
      await loadQuestions(selectedCat);
    } catch (err) {
      setResult(describeError(err, "Failed to import questions."));
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteQuestion = async (qId: string) => {
    if (!confirm("Are you sure you want to delete this question?")) return;
    setBusy(true);
    try {
      await deleteAdminBankQuestion(token, qId);
      setResult({ tone: "success", title: "Question Deleted", message: "Question removed." });
      await loadCategories();
      await loadQuestions(selectedCat);
    } catch (err) {
      setResult(describeError(err, "Could not delete question."));
    } finally {
      setBusy(false);
    }
  };

  const selectedCategoryMeta = categories?.find((c) => c.id === selectedCat);

  return (
    <div className="space-y-5">
      {/* Header with Quick Actions */}
      <section className="rounded-3xl bg-[var(--card)] p-5 shadow-[0_8px_24px_rgba(28,25,21,0.05)] border border-black/5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-[var(--foreground)]">Question Bank & Categories</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Manage questions and categories used in 1v1 Fast Duels and Challenges. Duels randomly sample from these pools.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isOwner ? (
              <button
                type="button"
                onClick={() => setModal("new_category")}
                className="press h-9 rounded-full bg-black/5 px-3.5 text-xs font-semibold text-[var(--foreground)] hover:bg-black/10"
              >
                + New Category
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setModal("import_questions")}
              className="press h-9 rounded-full bg-black/5 px-3.5 text-xs font-semibold text-[var(--foreground)] hover:bg-black/10"
            >
              📥 Bulk Import
            </button>
            <button
              type="button"
              onClick={() => setModal("new_question")}
              className="press h-9 rounded-full bg-[var(--foreground)] px-4 text-xs font-semibold text-[var(--background)] shadow"
            >
              + Add Question
            </button>
          </div>
        </div>

        {/* Categories Grid / Badges */}
        <div className="mt-5 pt-4 border-t border-black/5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">
              Categories ({categories?.length ?? 0})
            </span>
          </div>

          {!categories ? (
            <div className="h-12 animate-pulse rounded-2xl bg-black/5" />
          ) : (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSelectedCat("all")}
                className={`press flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
                  selectedCat === "all"
                    ? "bg-[var(--accent)] text-[var(--accent-text)] shadow-sm"
                    : "bg-black/5 text-[var(--foreground)] hover:bg-black/10"
                }`}
              >
                <span>✨ All Categories</span>
                <span className="rounded-full bg-black/10 px-1.5 py-0.2 text-[10px]">
                  {categories.reduce((acc, c) => acc + c.question_count, 0)}
                </span>
              </button>

              {categories.map((cat) => {
                const isSelected = selectedCat === cat.id;
                const isReady = cat.question_count >= 5;
                return (
                  <div
                    key={cat.id}
                    className={`inline-flex items-center rounded-full border transition-all ${
                      isSelected
                        ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-text)] shadow-sm"
                        : "border-black/5 bg-[var(--card)] text-[var(--foreground)]"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedCat(cat.id)}
                      className="press flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold"
                    >
                      <span>{cat.icon || "🎯"}</span>
                      <span>{cat.name}</span>
                      <span
                        className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                          isReady
                            ? isSelected
                              ? "bg-white/20 text-white"
                              : "bg-emerald-100 text-emerald-800"
                            : isSelected
                            ? "bg-white/20 text-white"
                            : "bg-amber-100 text-amber-800"
                        }`}
                        title={isReady ? "Ready for duels" : "Needs at least 5 questions for duels"}
                      >
                        {cat.question_count} Qs
                      </span>
                    </button>
                    {isOwner ? (
                      <button
                        type="button"
                        onClick={() => void handleToggleCategoryActive(cat)}
                        className={`press px-2 py-1 text-[10px] font-bold ${
                          cat.is_active ? "text-emerald-600 hover:text-emerald-700" : "text-rose-500 hover:text-rose-600"
                        }`}
                        title={cat.is_active ? "Active in duels (click to deactivate)" : "Inactive (click to activate)"}
                      >
                        {cat.is_active ? "●" : "○"}
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Questions Explorer */}
      <section className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <div>
            <h3 className="text-sm font-bold text-[var(--foreground)]">
              {selectedCat === "all" ? "All Questions" : `${selectedCategoryMeta?.name ?? selectedCat} Questions`}
            </h3>
            <p className="text-xs text-[var(--muted)]">
              {questions ? `${questions.length} questions listed` : "Loading..."}
            </p>
          </div>
        </div>

        {!questions ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-28 animate-pulse rounded-2xl bg-black/5" />
            ))}
          </div>
        ) : questions.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-black/10 bg-[var(--card)] p-8 text-center">
            <span className="text-3xl">📭</span>
            <h4 className="mt-2 text-sm font-bold">No questions found</h4>
            <p className="mt-1 text-xs text-[var(--muted)]">
              {selectedCat === "all"
                ? "No questions in the database yet."
                : `No questions under ${selectedCategoryMeta?.name ?? selectedCat} yet. Add at least 5 to enable duels!`}
            </p>
            <button
              type="button"
              onClick={() => {
                if (selectedCat !== "all") setQCat(selectedCat);
                setModal("new_question");
              }}
              className="press mt-3 h-9 px-4 rounded-full bg-[var(--foreground)] text-[var(--background)] text-xs font-semibold"
            >
              + Add First Question
            </button>
          </div>
        ) : (
          <div className="grid gap-3">
            {questions.map((q, idx) => {
              const catMeta = categories?.find((c) => c.id === q.category);
              return (
                <div
                  key={q.id}
                  className="rounded-2xl border border-black/5 bg-[var(--card)] p-4 shadow-sm space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <span className="inline-flex items-center gap-1 rounded-md bg-black/5 px-2 py-0.5 text-[10px] font-bold text-[var(--foreground)]">
                        <span>{catMeta?.icon || "🎯"}</span>
                        <span className="capitalize">{catMeta?.name || q.category}</span>
                      </span>
                      <p className="text-xs font-bold text-[var(--foreground)] leading-relaxed">
                        {idx + 1}. {q.prompt}
                      </p>
                    </div>

                    {isOwner ? (
                      <button
                        type="button"
                        onClick={() => void handleDeleteQuestion(q.id)}
                        className="press shrink-0 rounded-lg p-1.5 text-xs text-rose-500 hover:bg-rose-50"
                        title="Delete Question"
                      >
                        🗑️
                      </button>
                    ) : null}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
                    {q.choices.map((c) => (
                      <div
                        key={c.id ?? c.label}
                        className={`flex items-center justify-between rounded-xl px-3 py-2 text-xs font-medium border ${
                          c.is_correct
                            ? "bg-emerald-50 border-emerald-300 text-emerald-950 font-bold"
                            : "bg-black/[0.02] border-black/5 text-[var(--muted)]"
                        }`}
                      >
                        <span className="truncate">{c.label}</span>
                        {c.is_correct ? (
                          <span className="rounded bg-emerald-600 px-1.5 py-0.2 text-[9px] font-bold text-white uppercase tracking-wider">
                            ✓ Correct
                          </span>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Modal: New Category */}
      {modal === "new_category" ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="rise w-full max-w-md rounded-3xl bg-[var(--card)] p-5 shadow-2xl border border-black/5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold">Create Question Category</h3>
              <button
                type="button"
                onClick={() => setModal("none")}
                className="h-8 w-8 rounded-full bg-black/5 text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateCategory} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--muted)] mb-1">
                  Category ID (Slug) *
                </label>
                <input
                  value={newCatSlug}
                  onChange={(e) => setNewCatSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))}
                  placeholder="e.g. premier_league, movies, crypto"
                  className="h-10 w-full rounded-2xl border border-black/10 px-3 text-xs outline-none focus:border-[var(--accent)]"
                  required
                />
                <span className="text-[10px] text-[var(--muted)]">Unique identifier (letters, numbers, underscores)</span>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--muted)] mb-1">
                  Display Name *
                </label>
                <input
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  placeholder="e.g. Premier League Football"
                  className="h-10 w-full rounded-2xl border border-black/10 px-3 text-xs outline-none focus:border-[var(--accent)]"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--muted)] mb-1">
                  Icon Emoji
                </label>
                <input
                  value={newCatIcon}
                  onChange={(e) => setNewCatIcon(e.target.value)}
                  placeholder="e.g. ⚽, 🎬, 🚀"
                  className="h-10 w-24 rounded-2xl border border-black/10 px-3 text-base outline-none focus:border-[var(--accent)]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--muted)] mb-1">
                  Description
                </label>
                <input
                  value={newCatDesc}
                  onChange={(e) => setNewCatDesc(e.target.value)}
                  placeholder="Brief summary of topics covered"
                  className="h-10 w-full rounded-2xl border border-black/10 px-3 text-xs outline-none focus:border-[var(--accent)]"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModal("none")}
                  className="press h-10 flex-1 rounded-full bg-black/5 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="press h-10 flex-1 rounded-full bg-[var(--foreground)] text-xs font-semibold text-[var(--background)] shadow"
                >
                  Create Category
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Modal: Add Single Question */}
      {modal === "new_question" ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="rise w-full max-w-lg rounded-3xl bg-[var(--card)] p-5 shadow-2xl border border-black/5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold">Add Question to Question Bank</h3>
              <button
                type="button"
                onClick={() => setModal("none")}
                className="h-8 w-8 rounded-full bg-black/5 text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateQuestion} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--muted)] mb-1">
                  Category *
                </label>
                <select
                  value={qCat}
                  onChange={(e) => setQCat(e.target.value)}
                  className="h-10 w-full rounded-2xl border border-black/10 bg-transparent px-3 text-xs outline-none focus:border-[var(--accent)]"
                >
                  {categories?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.icon} {c.name} ({c.id})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--muted)] mb-1">
                  Question Prompt *
                </label>
                <textarea
                  value={qPrompt}
                  onChange={(e) => setQPrompt(e.target.value)}
                  placeholder="e.g. In which year was the African Union founded?"
                  rows={2}
                  className="w-full rounded-2xl border border-black/10 p-3 text-xs outline-none focus:border-[var(--accent)]"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--muted)] mb-1">
                  Choices (Select which choice is correct) *
                </label>
                <div className="space-y-2">
                  {qChoices.map((choice, idx) => (
                    <div
                      key={idx}
                      className={`flex items-center gap-2 rounded-2xl border p-2 transition-all ${
                        qCorrectIdx === idx ? "border-emerald-500 bg-emerald-50/50" : "border-black/10"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setQCorrectIdx(idx)}
                        className={`h-6 w-6 shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${
                          qCorrectIdx === idx
                            ? "bg-emerald-600 text-white shadow"
                            : "bg-black/10 text-[var(--muted)] hover:bg-black/20"
                        }`}
                        title="Mark as correct answer"
                      >
                        {qCorrectIdx === idx ? "✓" : String.fromCharCode(65 + idx)}
                      </button>
                      <input
                        value={choice}
                        onChange={(e) => {
                          const updated = [...qChoices];
                          updated[idx] = e.target.value;
                          setQChoices(updated);
                        }}
                        placeholder={`Choice ${String.fromCharCode(65 + idx)}`}
                        className="h-8 flex-1 bg-transparent px-2 text-xs outline-none"
                        required
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModal("none")}
                  className="press h-10 flex-1 rounded-full bg-black/5 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="press h-10 flex-1 rounded-full bg-[var(--foreground)] text-xs font-semibold text-[var(--background)] shadow"
                >
                  Save Question
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Modal: Bulk Import JSON */}
      {modal === "import_questions" ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="rise w-full max-w-lg rounded-3xl bg-[var(--card)] p-5 shadow-2xl border border-black/5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold">Bulk Import Questions (JSON)</h3>
              <button
                type="button"
                onClick={() => setModal("none")}
                className="h-8 w-8 rounded-full bg-black/5 text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleImportJson} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--muted)] mb-1">
                  Target Category *
                </label>
                <select
                  value={importCat}
                  onChange={(e) => setImportCat(e.target.value)}
                  className="h-10 w-full rounded-2xl border border-black/10 bg-transparent px-3 text-xs outline-none focus:border-[var(--accent)]"
                >
                  {categories?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.icon} {c.name} ({c.id})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">
                    JSON Array *
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setImportJson(
                        JSON.stringify(
                          [
                            {
                              prompt: "Which club won the 2024 UEFA Champions League?",
                              choices: [
                                { label: "Real Madrid", is_correct: true },
                                { label: "Borussia Dortmund", is_correct: false },
                                { label: "Bayern Munich", is_correct: false },
                                { label: "PSG", is_correct: false },
                              ],
                            },
                          ],
                          null,
                          2,
                        ),
                      );
                    }}
                    className="text-[10px] font-bold text-indigo-600 underline"
                  >
                    Load Sample
                  </button>
                </div>
                <textarea
                  value={importJson}
                  onChange={(e) => setImportJson(e.target.value)}
                  placeholder={`[\n  {\n    "prompt": "...",\n    "choices": [\n      {"label": "A", "is_correct": true},\n      {"label": "B", "is_correct": false}\n    ]\n  }\n]`}
                  rows={8}
                  className="w-full font-mono text-[11px] rounded-2xl border border-black/10 p-3 outline-none focus:border-[var(--accent)]"
                  required
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModal("none")}
                  className="press h-10 flex-1 rounded-full bg-black/5 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="press h-10 flex-1 rounded-full bg-[var(--foreground)] text-xs font-semibold text-[var(--background)] shadow"
                >
                  Import Questions
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {busy ? <LoadingOverlay title="Processing request..." /> : null}
      {result && !busy ? (
        <ResultDialog result={result} onClose={() => setResult(null)} actionLabel="Done" />
      ) : null}
    </div>
  );
}

