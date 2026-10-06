"use client";

import { useAuth } from "@/components/app-shell";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ReferralCard } from "@/components/referral-card";
import { useI18n } from "@/lib/i18n";

export default function ProfilePage() {
  const { state, devAuthEnabled, signInDevelopment, error } = useAuth();
  const { t, language } = useI18n();

  if (state.status === "loading") {
    return <div className="h-40 animate-pulse rounded-3xl bg-black/5" />;
  }

  if (state.status === "anonymous") {
    return (
      <div className="space-y-4">
        <section className="rounded-3xl bg-[var(--card)] px-5 py-6">
          <p className="text-sm leading-6 text-[var(--muted)]">
            {devAuthEnabled
              ? "Sign in as the development user, or open Challenge from the Telegram bot."
              : "Open Challenge from the Telegram bot. This app does not use a password."}
          </p>
          {devAuthEnabled ? (
            <button
              type="button"
              onClick={() => void signInDevelopment()}
              className="mt-4 h-11 rounded-full bg-[var(--accent)] px-4 text-sm font-medium text-[var(--accent-text)]"
            >
              Continue as development user
            </button>
          ) : null}
          {error ? <p className="mt-3 text-sm text-[var(--accent)]">{error}</p> : null}
        </section>

        {/* Language selector even for anonymous/dev users */}
        <section className="rounded-3xl bg-[var(--card)] px-5 py-5 shadow-[0_16px_40px_rgba(28,25,21,0.06)]">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
            {t("profile.language")}
          </p>
          <div className="mt-3">
            <LanguageSwitcher />
          </div>
        </section>
      </div>
    );
  }

  const { user } = state;
  const name = [user.first_name, user.last_name].filter(Boolean).join(" ");
  const initial = user.first_name.slice(0, 1).toUpperCase();

  return (
    <div className="space-y-4">
      <section className="rise rounded-3xl bg-[var(--card)] px-5 py-6 shadow-[0_16px_40px_rgba(28,25,21,0.06)]">
        <div className="flex items-center gap-4">
          {user.photo_url ? (
            // Telegram photo URLs are remote and not in the Next image allowlist.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.photo_url}
              alt=""
              className="h-16 w-16 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--accent)] text-xl font-semibold text-[var(--accent-text)]">
              {initial}
            </div>
          )}
          <div>
            <p className="text-xl font-semibold">{name}</p>
            <p className="text-sm text-[var(--muted)]">
              {user.username ? `@${user.username}` : t("profile.noUsername")}
            </p>
          </div>
        </div>
        <dl className="mt-6 space-y-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-[var(--muted)]">{t("profile.telegramId")}</dt>
            <dd className="font-medium">{user.telegram_id}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-[var(--muted)]">{t("profile.memberSince")}</dt>
            <dd className="font-medium">
              {new Intl.DateTimeFormat(language === "am" ? "am-ET" : "en", { dateStyle: "medium" }).format(new Date(user.created_at))}
            </dd>
          </div>
        </dl>
      </section>

      {/* Referral Section */}
      <ReferralCard sessionToken={state.sessionToken} />

      {/* Language Switcher Section */}
      <section className="rise rounded-3xl bg-[var(--card)] px-5 py-5 shadow-[0_16px_40px_rgba(28,25,21,0.06)]">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
            {t("profile.language")}
          </p>
          <span className="text-xs font-medium text-[var(--accent)]">
            {language === "am" ? "አማርኛ" : language === "om" ? "Afaan Oromoo" : "English"}
          </span>
        </div>
        <div className="mt-3">
          <LanguageSwitcher />
        </div>
      </section>
    </div>
  );
}
