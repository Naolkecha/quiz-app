"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useAuth, useHeaderAction } from "@/components/app-shell";
import {
  describeError,
  ErrorNotice,
  LoadingOverlay,
  ResultDialog,
  type Message,
} from "@/components/feedback";
import { depositToWallet, getWallet, withdrawFromWallet } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { MoneyOrder, Wallet, WalletTransaction } from "@/lib/types";

type Operation = "deposit" | "withdraw";
type ActivityView = "payments" | "balance";

const MIN_DEPOSIT = 10;
const MIN_PAYOUT = 100;
const PENDING_REFRESH_MS = 5000;
const ACTIVITY_PREVIEW_COUNT = 4;

function etb(value: string | number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

function localPhone(value: string | null): string {
  if (!value) {
    return "";
  }
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("251") && digits.length === 12) {
    return `0${digits.slice(3)}`;
  }
  return digits || value;
}

function spacedPhone(value: string | null): string {
  const phone = localPhone(value);
  if (phone.length === 10) {
    return `${phone.slice(0, 4)} ${phone.slice(4, 7)} ${phone.slice(7)}`;
  }
  return phone || "your Telebirr number";
}

function when(value: string): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function depositProblem(reason: string | null): { title: string; detail: string } {
  const text = (reason ?? "").toLowerCase();
  if (text.includes("not_found") || text.includes("not found")) {
    return {
      title: "Not found",
      detail:
        "We could not find this transaction on Telebirr. Check the number in your SMS and try again.",
    };
  }
  if (text.includes("etb") && (text.includes("not the") || text.includes("does not match"))) {
    return {
      title: "Wrong amount",
      detail: reason ?? "The amount you entered does not match this Telebirr payment.",
    };
  }
  if (text.includes("not sent") || text.includes("wrong")) {
    return {
      title: "Sent to another number",
      detail: "This payment went to a different Telebirr number, so it cannot be added here.",
    };
  }
  return {
    title: "Not confirmed",
    detail:
      reason && !text.startsWith("telebirr verification status")
        ? reason
        : "Telebirr did not confirm this payment. Check the details and try again.",
  };
}

type Status = { label: string; className: string };

function orderStatus(order: MoneyOrder): Status {
  const ok = "bg-emerald-100 text-emerald-800";
  const wait = "bg-amber-100 text-amber-800";
  const bad = "bg-red-100 text-red-800";
  const neutral = "bg-black/5 text-[var(--muted)]";
  if (order.kind === "deposit") {
    if (order.status === "succeeded") return { label: "Added", className: ok };
    if (order.status === "pending") return { label: "Checking", className: wait };
    if (order.status === "failed") return { label: depositProblem(order.failure_reason).title, className: bad };
    return { label: "Cancelled", className: neutral };
  }
  if (order.status === "pending") return { label: "Pending", className: wait };
  if (order.status === "succeeded") return { label: "Paid", className: ok };
  if (order.status === "cancelled") return { label: "Cancelled", className: neutral };
  return { label: "Not sent", className: bad };
}

function orderDetail(order: MoneyOrder): string {
  const stamp = when(order.created_at);
  if (order.kind === "deposit" && order.status === "failed") {
    return depositProblem(order.failure_reason).detail;
  }
  if (order.kind === "withdrawal" && order.status === "pending") {
    return `To ${spacedPhone(order.phone_number)} · Waiting for payout · ${stamp}`;
  }
  if (order.kind === "withdrawal" && order.status === "cancelled") {
    return `Not sent · Your balance was not charged · ${stamp}`;
  }
  if (order.transaction_number) {
    return `${order.transaction_number} · ${stamp}`;
  }
  if (order.phone_number) {
    return `To ${spacedPhone(order.phone_number)} · ${stamp}`;
  }
  return stamp;
}

function movementTitle(transaction: WalletTransaction): string {
  if (transaction.entry_type === "deposit") return "Money added";
  if (transaction.entry_type === "withdrawal_hold") return "Cash out paid";
  if (transaction.entry_type === "withdrawal_release") return "Cash out returned";
  if (transaction.entry_type === "prize") return transaction.description || "Prize won";
  if (transaction.entry_type === "entry_fee") return transaction.description || "Challenge entry";
  if (transaction.entry_type === "referral") return transaction.description || "Referral reward";
  if (transaction.entry_type === "daily_spin") return transaction.description || "Daily lucky spin";
  return "Balance correction";
}

function checkFields(
  operation: Operation,
  amount: string,
  transactionNumber: string,
  phone: string,
  balance: number,
): string | null {
  const value = Number(amount.replace(/,/g, ""));
  if (!amount.trim()) {
    return operation === "deposit"
      ? "Enter the amount you sent."
      : "Enter how much you want to cash out.";
  }
  if (!Number.isFinite(value) || value <= 0) {
    return "Enter the amount as a number, for example 100.";
  }
  if (operation === "deposit") {
    if (value < MIN_DEPOSIT) {
      return `The smallest deposit is ${MIN_DEPOSIT} ETB.`;
    }
    if (transactionNumber.replace(/[^a-z0-9]/gi, "").length < 6) {
      return "Paste the transaction number from your Telebirr SMS.";
    }
    return null;
  }
  if (value < MIN_PAYOUT) {
    return `The smallest cash out is ${MIN_PAYOUT} ETB.`;
  }
  if (value > balance) {
    return `You can cash out up to ${etb(balance)} ETB.`;
  }
  if (!/^(\+?251|0)?9\d{8}$/.test(phone.replace(/[\s-]/g, ""))) {
    return "Enter a Telebirr number like 0912 345 678.";
  }
  return null;
}

export default function WalletPage() {
  const { state } = useAuth();
  const sessionToken = state.status === "ready" ? state.sessionToken : null;
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [operation, setOperation] = useState<Operation>("deposit");
  const [amount, setAmount] = useState("");
  const [phone, setPhone] = useState("");
  const [transactionNumber, setTransactionNumber] = useState("");
  const [activityView, setActivityView] = useState<ActivityView>("payments");
  const [showAllActivity, setShowAllActivity] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loadError, setLoadError] = useState<Message | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [result, setResult] = useState<Message | null>(null);
  const { t } = useI18n();
  const inFlight = useRef(false);

  const load = useCallback(
    async (manual = false) => {
      if (!sessionToken || inFlight.current) {
        return;
      }
      inFlight.current = true;
      if (manual) {
        setRefreshing(true);
      }
      try {
        setWallet(await getWallet(sessionToken));
        setLoadError(null);
      } catch (caught) {
        setLoadError(describeError(caught, "We could not load your wallet."));
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
    void load(true);
  }, [load]);

  useHeaderAction(
    sessionToken
      ? { label: refreshing ? t("header.updating") : t("header.refresh"), disabled: refreshing, onClick: refresh }
      : null,
  );

  useEffect(() => {
    const id = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(id);
  }, [load]);

  const hasPending =
    wallet?.orders.some((order) => order.kind === "deposit" && order.status === "pending") ?? false;

  useEffect(() => {
    if (!hasPending) {
      return;
    }
    const id = window.setInterval(() => {
      if (document.visibilityState !== "hidden") {
        void load();
      }
    }, PENDING_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [hasPending, load]);

  async function copyNumber(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setFieldError("Copying is not available here. Press and hold the number to copy it.");
    }
  }

  function switchTo(next: Operation) {
    setOperation(next);
    setFieldError(null);
    setAmount("");
  }

  async function submit() {
    if (!sessionToken || !wallet || busy) {
      return;
    }
    const problem = checkFields(
      operation,
      amount,
      transactionNumber,
      phone,
      Number(wallet.available_etb),
    );
    if (problem) {
      setFieldError(problem);
      return;
    }
    setBusy(true);
    setFieldError(null);
    setResult(null);
    const cleanAmount = amount.replace(/,/g, "").trim();
    try {
      const idempotencyKey = crypto.randomUUID();
      if (operation === "deposit") {
        const order = await depositToWallet(
          sessionToken,
          cleanAmount,
          transactionNumber.trim(),
          idempotencyKey,
        );
        if (order.status === "succeeded") {
          setResult({
            tone: "success",
            title: "Money added",
            message: `${etb(order.amount_etb)} ETB is now in your balance.`,
          });
          setAmount("");
          setTransactionNumber("");
        } else if (order.status === "pending") {
          setResult({
            tone: "waiting",
            title: "Still checking",
            message:
              "Telebirr is taking a little longer. Your balance updates by itself once the payment is confirmed.",
          });
          setAmount("");
          setTransactionNumber("");
        } else {
          const failure = depositProblem(order.failure_reason);
          setResult({ tone: "error", title: failure.title, message: failure.detail });
        }
      } else {
        await withdrawFromWallet(sessionToken, cleanAmount, phone, idempotencyKey);
        setResult({
          tone: "waiting",
          title: "Cash out pending",
          message: `We will send ${etb(cleanAmount)} ETB to ${spacedPhone(phone)}. It shows as pending until the payout is done, then it comes off your balance.`,
        });
        setAmount("");
      }
      await load();
    } catch (caught) {
      setResult(describeError(caught, "That did not work. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  if (state.status === "loading") {
    return <div className="h-56 animate-pulse rounded-3xl bg-black/5" />;
  }
  if (!sessionToken) {
    return (
      <section className="rounded-3xl bg-[var(--card)] px-5 py-6 text-sm leading-6">
        Open Challenge from the Telegram bot to use your wallet.
      </section>
    );
  }
  if (!wallet) {
    return (
      <div className="space-y-3">
        {loadError ? (
          <ErrorNotice error={loadError} onRetry={refresh} />
        ) : (
          <div className="h-56 animate-pulse rounded-3xl bg-black/5" />
        )}
      </div>
    );
  }

  const payTo = localPhone(wallet.settlement_account);
  const depositsOpen = wallet.deposits_enabled || wallet.deposit_mode === "verify_et";
  const available = operation === "deposit" ? depositsOpen : wallet.withdrawals_enabled;
  const pendingPayout = Number(wallet.pending_withdrawals_etb);

  return (
    <div className="space-y-4">
      <ErrorNotice error={loadError} onRetry={refresh} />

      <section className="overflow-hidden rounded-3xl bg-[var(--foreground)] px-5 py-4 text-[var(--background)] shadow-[0_16px_40px_rgba(28,25,21,0.12)]">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] opacity-65">{t("wallet.balance")}</p>
        <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">
          {etb(wallet.balance_etb)}
          <span className="ml-1.5 text-sm font-medium opacity-65">{t("common.etb")}</span>
        </p>
        {pendingPayout > 0 ? (
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/15 pt-3 text-xs">
            <div>
              <p className="opacity-65">{t("wallet.pendingCashOut")}</p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums">{etb(pendingPayout)} {t("common.etb")}</p>
            </div>
            <div>
              <p className="opacity-65">{t("wallet.available")}</p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums">
                {etb(wallet.available_etb)} {t("common.etb")}
              </p>
            </div>
          </div>
        ) : null}
        {hasPending ? (
          <p className="mt-3 flex items-center gap-2 text-xs opacity-75">
            <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
            {t("wallet.paymentChecking")}
          </p>
        ) : null}
      </section>

      <section className="rounded-3xl bg-[var(--card)] px-5 py-5 shadow-[0_16px_40px_rgba(28,25,21,0.06)]">
        <div className="grid grid-cols-2 rounded-full bg-[#f7f4ee] p-1">
          {(
            [
              ["deposit", t("wallet.addMoney")],
              ["withdraw", t("wallet.cashOut")],
            ] as const
          ).map(([item, label]) => (
            <button
              key={item}
              type="button"
              onClick={() => switchTo(item)}
              className={`h-10 rounded-full text-sm font-medium transition-colors ${
                operation === item
                  ? "bg-[var(--accent)] text-[var(--accent-text)]"
                  : "text-[var(--muted)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {operation === "deposit" ? (
          <div className="mt-5">
            <Step number={1} title={t("wallet.telebirrTitle")} />
            <div className="mt-2 flex items-center justify-between gap-3 rounded-2xl bg-[#f7f4ee] px-4 py-3">
              <div className="min-w-0">
                <p className="text-xs text-[var(--muted)]">{t("wallet.sendTo")}</p>
                <p className="mt-0.5 text-sm font-semibold">
                  {wallet.settlement_account_name || "Telebirr"}
                </p>
                <p className="select-all text-lg font-semibold tracking-tight tabular-nums">
                  {payTo ? spacedPhone(payTo) : "Not available"}
                </p>
              </div>
              {payTo ? (
                <button
                  type="button"
                  onClick={() => void copyNumber(payTo)}
                  className="press h-9 shrink-0 rounded-full bg-[var(--foreground)] px-4 text-xs font-semibold text-[var(--background)]"
                >
                  {copied ? t("common.copied") : t("common.copy")}
                </button>
              ) : null}
            </div>
            <div className="mt-5">
              <Step number={2} title={t("wallet.telebirrStep2")} />
            </div>
          </div>
        ) : (
          <p className="mt-5 rounded-2xl bg-[#f7f4ee] px-4 py-3 text-sm leading-6 text-[var(--muted)]">
            {t("wallet.cashOutInfo", { amount: etb(wallet.available_etb) })}
          </p>
        )}

        <Field
          label={operation === "deposit" ? t("wallet.amountSent") : t("wallet.amountToCashOut")}
          hint={operation === "deposit" ? `At least ${MIN_DEPOSIT} ${t("common.etb")}` : `At least ${MIN_PAYOUT} ${t("common.etb")}`}
        >
          <div className="relative">
            <input
              inputMode="decimal"
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value);
                setFieldError(null);
              }}
              placeholder="0"
              className="h-11 w-full rounded-2xl border border-black/10 bg-transparent pl-4 pr-14 text-base outline-none focus:border-[var(--accent)]"
            />
            <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm text-[var(--muted)]">
              ETB
            </span>
          </div>
        </Field>

        {operation === "deposit" ? (
          <Field label="Transaction number" hint="Find it in the SMS Telebirr sent you">
            <input
              value={transactionNumber}
              onChange={(event) => {
                setTransactionNumber(event.target.value.toUpperCase());
                setFieldError(null);
              }}
              placeholder="e.g. DET8FJGUJ4"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              className="h-11 w-full rounded-2xl border border-black/10 bg-transparent px-4 text-base uppercase tracking-wide outline-none focus:border-[var(--accent)]"
            />
          </Field>
        ) : (
          <Field label="Send to Telebirr number" hint="The number that should receive the money">
            <input
              inputMode="tel"
              value={phone}
              onChange={(event) => {
                setPhone(event.target.value);
                setFieldError(null);
              }}
              placeholder="0912 345 678"
              className="h-11 w-full rounded-2xl border border-black/10 bg-transparent px-4 text-base outline-none focus:border-[var(--accent)]"
            />
          </Field>
        )}

        {fieldError ? (
          <p role="alert" className="mt-3 flex items-start gap-2 text-sm leading-6 text-red-700">
            <span aria-hidden>⚠</span>
            {fieldError}
          </p>
        ) : null}
        {!available ? (
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
            {operation === "deposit"
              ? "Adding money is paused right now. Please try again later."
              : "Cash out is paused right now. Please try again later."}
          </p>
        ) : null}

        <button
          type="button"
          onClick={() => void submit()}
          disabled={!available || busy}
          className="press mt-4 h-11 w-full rounded-full bg-[var(--accent)] text-sm font-semibold text-[var(--accent-text)] disabled:opacity-40"
        >
          {busy
            ? t("common.loading")
            : operation === "deposit"
              ? t("wallet.confirmDeposit")
              : t("wallet.confirmWithdraw")}
        </button>
      </section>

      <section className="rounded-3xl bg-[var(--card)] px-5 py-5">
        <h2 className="text-sm font-semibold">Activity</h2>
        <div className="mt-3 grid grid-cols-2 rounded-full bg-[#f7f4ee] p-1">
          {(
            [
              ["payments", "Payments"],
              ["balance", "Balance"],
            ] as const
          ).map(([view, label]) => (
            <button
              key={view}
              type="button"
              onClick={() => {
                setActivityView(view);
                setShowAllActivity(false);
              }}
              className={`h-9 rounded-full text-xs font-semibold transition-colors ${
                activityView === view
                  ? "bg-[var(--foreground)] text-[var(--background)]"
                  : "text-[var(--muted)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {activityView === "payments" && wallet.orders.length === 0 ? (
          <p className="mt-4 text-sm leading-6 text-[var(--muted)]">
            Your deposits and cash outs will show here.
          </p>
        ) : null}
        {activityView === "payments" && wallet.orders.length > 0 ? (
          <ol className="mt-2">
            {(showAllActivity
              ? wallet.orders
              : wallet.orders.slice(0, ACTIVITY_PREVIEW_COUNT)
            ).map((order) => {
              const status = orderStatus(order);
              return (
                <li
                  key={order.id}
                  className="flex items-start justify-between gap-3 border-t border-black/10 py-3 first:border-0"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">
                        {order.kind === "deposit" ? "Add money" : "Cash out"}
                      </p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${status.className}`}
                      >
                        {status.label}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs leading-5 text-[var(--muted)]">
                      {orderDetail(order)}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold tabular-nums">
                    {etb(order.amount_etb)}
                  </p>
                </li>
              );
            })}
          </ol>
        ) : null}

        {activityView === "balance" && wallet.transactions.length === 0 ? (
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
            Money you add, cash outs, and prizes will show here.
          </p>
        ) : null}
        {activityView === "balance" && wallet.transactions.length > 0 ? (
          <ol className="mt-2">
            {(showAllActivity
              ? wallet.transactions
              : wallet.transactions.slice(0, ACTIVITY_PREVIEW_COUNT)
            ).map((transaction) => {
              const positive = Number(transaction.amount_etb) > 0;
              return (
                <li
                  key={transaction.id}
                  className="flex items-center justify-between gap-3 border-t border-black/10 py-3 first:border-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{movementTitle(transaction)}</p>
                    <p className="text-xs text-[var(--muted)]">{when(transaction.created_at)}</p>
                  </div>
                  <p
                    className={`shrink-0 text-sm font-semibold tabular-nums ${
                      positive ? "text-emerald-700" : "text-[var(--foreground)]"
                    }`}
                  >
                    {positive ? "+" : "−"}
                    {etb(Math.abs(Number(transaction.amount_etb)))}
                  </p>
                </li>
              );
            })}
          </ol>
        ) : null}

        {(activityView === "payments" ? wallet.orders.length : wallet.transactions.length) >
        ACTIVITY_PREVIEW_COUNT ? (
          <button
            type="button"
            onClick={() => setShowAllActivity((current) => !current)}
            className="mt-2 h-10 w-full rounded-full bg-[#f7f4ee] text-xs font-semibold text-[var(--foreground)]"
          >
            {showAllActivity ? "Show less" : "Show all activity"}
          </button>
        ) : null}
      </section>

      {busy ? (
        <LoadingOverlay
          title={operation === "deposit" ? "Checking your payment" : "Sending your request"}
          message={
            operation === "deposit"
              ? "Confirming with Telebirr. This usually takes a few seconds."
              : "Sending your cash out request."
          }
        />
      ) : null}

      {result && !busy ? <ResultDialog result={result} onClose={() => setResult(null)} /> : null}
    </div>
  );
}

function Step({ number, title }: { number: number; title: string }) {
  return (
    <p className="flex items-center gap-2 text-sm font-semibold">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--accent)] text-xs text-[var(--accent-text)]">
        {number}
      </span>
      {title}
    </p>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="mt-4 block">
      <span className="flex items-baseline justify-between gap-2 text-sm font-medium">
        {label}
        {hint ? <span className="text-xs font-normal text-[var(--muted)]">{hint}</span> : null}
      </span>
      <span className="mt-2 block">{children}</span>
    </label>
  );
}
