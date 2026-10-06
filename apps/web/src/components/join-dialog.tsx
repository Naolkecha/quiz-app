"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { describeError, ErrorNotice, Spinner, type Message } from "@/components/feedback";
import { ApiError, getWallet, joinChallenge } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { TodayChallenge, Wallet } from "@/lib/types";

function formatEtb(value: string | number): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return String(value);
  }
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(amount);
}

export function JoinDialog({
  challenge,
  sessionToken,
  onClose,
  onJoined,
}: {
  challenge: TodayChallenge;
  sessionToken: string;
  onClose: () => void;
  onJoined: (challengeId: string) => void;
}) {
  const { t } = useI18n();
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Message | null>(null);
  const [needsMoney, setNeedsMoney] = useState(false);
  const [wallet, setWallet] = useState<Wallet | null>(null);

  const isPaid = !challenge.is_free && Number(challenge.entry_fee_etb) > 0;
  const fee = formatEtb(challenge.entry_fee_etb);
  const numFee = Number(challenge.entry_fee_etb);
  const currentBalance = wallet ? Number(wallet.available_etb) : null;
  const isInsufficient = currentBalance !== null && currentBalance < numFee;
  const balanceAfter = currentBalance !== null ? Math.max(0, currentBalance - numFee) : null;

  useEffect(() => {
    let active = true;
    if (sessionToken) {
      getWallet(sessionToken)
        .then((w) => {
          if (active) setWallet(w);
        })
        .catch(() => {});
    }
    return () => {
      active = false;
    };
  }, [sessionToken]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) {
        onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function join() {
    if (!agreed || busy || isInsufficient) {
      return;
    }
    setBusy(true);
    setError(null);
    setNeedsMoney(false);
    try {
      await joinChallenge(challenge.id, sessionToken);
      onJoined(challenge.id);
    } catch (caught) {
      setBusy(false);
      setNeedsMoney(caught instanceof ApiError && caught.code === "entry_fee_insufficient");
      setError(describeError(caught, "We could not join this challenge. Please try again."));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 px-0 sm:items-center sm:px-5">
      <button
        type="button"
        aria-label={t("common.close")}
        className="absolute inset-0 cursor-default"
        onClick={() => {
          if (!busy) {
            onClose();
          }
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="join-title"
        className="relative w-full max-w-md rounded-t-3xl bg-[var(--card)] px-5 pt-5 pb-8 shadow-[0_-12px_40px_rgba(28,25,21,0.16)] sm:rounded-3xl"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
          {t("join.termsTitle")}
        </p>
        <h2 id="join-title" className="mt-1 text-2xl font-semibold tracking-tight">
          {t("home.join")} {challenge.title}
        </h2>

        {/* Prominent Payment Deduction Notice for Paid Challenges */}
        {isPaid ? (
          <div className="mt-3.5 rounded-2xl bg-amber-500/10 p-3.5 border border-amber-500/20 text-xs space-y-2.5">
            <div className="flex items-start gap-2.5">
              <span className="text-xl shrink-0">💳</span>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-amber-900 text-sm">
                  {t("join.deductionAlertTitle", { fee })}
                </p>
                <p className="mt-0.5 text-xs text-amber-800/90 leading-5">
                  {t("join.deductionAlertDesc", { fee })}
                </p>
              </div>
            </div>

            {wallet ? (
              <div className="rounded-xl bg-white/80 p-2.5 text-xs space-y-1.5 border border-black/5">
                <div className="flex items-center justify-between text-[var(--muted)]">
                  <span>{t("join.walletBalance")}</span>
                  <span className="font-semibold tabular-nums text-[var(--foreground)]">
                    {formatEtb(wallet.available_etb)} {t("common.etb")}
                  </span>
                </div>
                <div className="flex items-center justify-between font-semibold text-rose-700">
                  <span>{t("home.entry")}</span>
                  <span className="tabular-nums">−{fee} {t("common.etb")}</span>
                </div>
                <div className="border-t border-black/5 pt-1.5 flex items-center justify-between font-bold">
                  <span>{t("join.balanceAfter")}</span>
                  <span
                    className={`tabular-nums ${
                      isInsufficient ? "text-rose-600 font-bold" : "text-emerald-700"
                    }`}
                  >
                    {isInsufficient
                      ? t("join.insufficientBalance")
                      : `${formatEtb(balanceAfter ?? 0)} ${t("common.etb")}`}
                  </span>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <ul className="mt-4 space-y-2 text-sm leading-6 text-[var(--muted)]">
          <li>{t("join.rule1")}</li>
          <li>
            {t("join.rule2", { count: challenge.question_count, seconds: challenge.duration_seconds })}
          </li>
          {isPaid ? (
            <li>
              <span className="font-medium text-rose-700">
                ⚠️ {t("join.rule3Paid", { fee })}
              </span>
            </li>
          ) : (
            <li>{t("join.rule3Free")}</li>
          )}
        </ul>

        <label className="mt-5 flex items-start gap-3 text-sm leading-6 cursor-pointer">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(event) => setAgreed(event.target.checked)}
            className="mt-1 size-4 accent-[var(--accent)] cursor-pointer"
          />
          <span className="font-medium">
            {isPaid
              ? t("join.agreeDeductionCheckbox", { fee })
              : t("join.agreeCheckbox")}
          </span>
        </label>

        {error ? (
          <div className="mt-4">
            <ErrorNotice error={error} />
          </div>
        ) : null}

        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="press h-12 rounded-full text-sm font-medium disabled:opacity-50"
          >
            {t("join.notNow")}
          </button>
          {needsMoney || isInsufficient ? (
            <Link
              href="/wallet"
              className="press flex h-12 items-center justify-center rounded-full bg-[var(--accent)] text-sm font-semibold text-[var(--accent-text)]"
            >
              {t("join.depositNow")}
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => void join()}
              disabled={!agreed || busy}
              className="press flex h-12 items-center justify-center gap-2 rounded-full bg-[var(--accent)] text-sm font-semibold text-[var(--accent-text)] disabled:opacity-40"
            >
              {busy ? (
                <>
                  <Spinner size="sm" />
                  {t("join.joining")}
                </>
              ) : isPaid ? (
                t("join.payAndJoinButton", { fee })
              ) : (
                t("home.join")
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
