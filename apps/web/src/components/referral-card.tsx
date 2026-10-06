"use client";

import { useCallback, useEffect, useState } from "react";

import { applyReferralCode, getMyReferrals, ApiError } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { ReferralSummary } from "@/lib/types";

function formatEtb(value: string | number): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return String(value);
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
}

function when(value: string): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

export function ReferralCard({ sessionToken }: { sessionToken: string }) {
  const { t } = useI18n();
  const [summary, setSummary] = useState<ReferralSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [inputCode, setInputCode] = useState("");
  const [applying, setApplying] = useState(false);
  const [applyMessage, setApplyMessage] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [showCodeInput, setShowCodeInput] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await getMyReferrals(sessionToken);
      setSummary(data);
    } catch {
      // Ignore initial load error
    } finally {
      setLoading(false);
    }
  }, [sessionToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const copyLink = useCallback(async () => {
    if (!summary) return;
    const link = summary.telegram_bot_url;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  }, [summary]);

  const shareTelegram = useCallback(() => {
    if (!summary) return;
    const link = summary.telegram_bot_url;
    const text = encodeURIComponent(
      "🎮 Join me on Challenge! Test your trivia speed and win real Telebirr cash prizes. Free and cash tournaments live now!"
    );
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${text}`;

    // Telegram Mini App native link opener if in Telegram
    const tg = (window as unknown as { Telegram?: { WebApp?: { openTelegramLink?: (url: string) => void } } })
      ?.Telegram?.WebApp;
    if (tg?.openTelegramLink) {
      tg.openTelegramLink(shareUrl);
    } else {
      window.open(shareUrl, "_blank");
    }
  }, [summary]);

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputCode.trim() || applying) return;
    setApplying(true);
    setApplyError(null);
    setApplyMessage(null);
    try {
      const res = await applyReferralCode(inputCode.trim(), sessionToken);
      setApplyMessage(res.message);
      setInputCode("");
      setShowCodeInput(false);
      void load();
    } catch (caught) {
      setApplyError(caught instanceof ApiError ? caught.message : "Failed to apply referral code.");
    } finally {
      setApplying(false);
    }
  };

  if (loading) {
    return <div className="h-44 animate-pulse rounded-3xl bg-black/5" />;
  }

  if (!summary) {
    return null;
  }

  return (
    <section className="rise overflow-hidden rounded-3xl bg-[var(--card)] p-5 shadow-[0_16px_40px_rgba(28,25,21,0.06)]">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">🎁</span>
            <h2 className="text-base font-semibold tracking-tight">{t("referral.title")}</h2>
          </div>
          <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
            {t("referral.subtitle", { amount: formatEtb(summary.reward_per_referral_etb) })}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-800">
          +{formatEtb(summary.reward_per_referral_etb)} ETB
        </span>
      </div>

      {/* Metrics */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-black/5 p-3 text-center">
          <p className="text-2xl font-bold tabular-nums text-[var(--foreground)]">{summary.total_referrals}</p>
          <p className="mt-0.5 text-[11px] font-medium text-[var(--muted)]">{t("referral.invitedCount")}</p>
        </div>
        <div className="rounded-2xl bg-emerald-50 p-3 text-center text-emerald-950">
          <p className="text-2xl font-bold tabular-nums">
            {formatEtb(summary.total_earned_etb)}
            <span className="ml-1 text-xs font-semibold">{t("common.etb")}</span>
          </p>
          <p className="mt-0.5 text-[11px] font-medium opacity-75">{t("referral.totalEarned")}</p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={shareTelegram}
          className="press flex flex-1 items-center justify-center gap-1.5 rounded-full bg-[var(--accent)] py-2.5 text-xs font-semibold text-[var(--accent-text)] shadow-sm"
        >
          <span>📲</span>
          <span>{t("referral.shareLink")}</span>
        </button>
        <button
          type="button"
          onClick={copyLink}
          className="press flex items-center justify-center rounded-full bg-black/5 px-4 py-2.5 text-xs font-semibold text-[var(--foreground)] hover:bg-black/10 transition-colors"
        >
          {copied ? t("common.copied") : t("referral.copyLink")}
        </button>
      </div>

      {/* Referred by badge or Apply Code prompt */}
      {summary.referred_by ? (
        <div className="mt-3.5 flex items-center gap-1.5 rounded-2xl bg-black/5 px-3 py-2 text-xs text-[var(--muted)]">
          <span>🤝</span>
          <span>{t("referral.invitedBy", { name: summary.referred_by })}</span>
        </div>
      ) : (
        <div className="mt-3.5">
          {!showCodeInput ? (
            <button
              type="button"
              onClick={() => setShowCodeInput(true)}
              className="text-xs font-medium text-[var(--accent)] hover:underline"
            >
              {t("referral.enterCode")}
            </button>
          ) : (
            <form onSubmit={handleApply} className="mt-2 space-y-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={inputCode}
                  onChange={(e) => setInputCode(e.target.value)}
                  placeholder={t("referral.codePlaceholder")}
                  disabled={applying}
                  className="h-10 flex-1 rounded-2xl border border-black/10 bg-[var(--background)] px-3 text-xs outline-none focus:border-[var(--accent)]"
                />
                <button
                  type="submit"
                  disabled={applying || !inputCode.trim()}
                  className="press h-10 rounded-2xl bg-[var(--foreground)] px-4 text-xs font-semibold text-[var(--background)] disabled:opacity-40"
                >
                  {applying ? t("referral.applying") : t("referral.applyCode")}
                </button>
              </div>
              {applyError ? <p className="text-xs text-[var(--accent)]">{applyError}</p> : null}
              {applyMessage ? <p className="text-xs text-emerald-700">{applyMessage}</p> : null}
            </form>
          )}
        </div>
      )}

      {/* Recent Invited Friends */}
      {summary.recent_referrals.length > 0 ? (
        <div className="mt-5 border-t border-black/10 pt-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
            {t("referral.invitedCount")} ({summary.recent_referrals.length})
          </p>
          <ul className="mt-2.5 divide-y divide-black/5">
            {summary.recent_referrals.map((item) => (
              <li key={item.id} className="flex items-center justify-between py-2 text-xs">
                <div>
                  <p className="font-semibold text-[var(--foreground)]">{item.referred_name}</p>
                  <p className="text-[10px] text-[var(--muted)]">{when(item.created_at)}</p>
                </div>
                <div>
                  {item.is_rewarded ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                      {t("referral.rewarded", { amount: formatEtb(item.reward_amount_etb) })}
                    </span>
                  ) : (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                      {t("referral.pending")}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
