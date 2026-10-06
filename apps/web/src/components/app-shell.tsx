"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { LanguageSwitcher } from "@/components/language-switcher";
import {
  ApiError,
  currentUser,
  devAuthEnabled,
  loginDevelopment,
  loginWithTelegram,
} from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { readRawInitData } from "@/lib/telegram";
import type { User } from "@/lib/types";

const SESSION_KEY = "challenge.session";

type AuthState =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "ready"; user: User; sessionToken: string };

type AuthContextValue = {
  state: AuthState;
  devAuthEnabled: boolean;
  signInDevelopment: () => Promise<void>;
  error: string | null;
};

type HeaderAction = {
  label: string;
  disabled: boolean;
  onClick: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const HeaderActionContext = createContext<(action: HeaderAction | null) => void>(() => {});

export function useHeaderAction(action: HeaderAction | null) {
  const setAction = useContext(HeaderActionContext);
  const label = action?.label ?? "";
  const disabled = action?.disabled ?? false;
  const onClick = action?.onClick;

  useEffect(() => {
    if (!onClick) {
      setAction(null);
      return;
    }
    setAction({ label, disabled, onClick });
    return () => setAction(null);
  }, [disabled, label, onClick, setAction]);
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used inside AppShell");
  }
  return value;
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [state, setState] = useState<AuthState>({ status: "loading" });
  const [headerAction, setHeaderAction] = useState<HeaderAction | null>(null);
  const setHeaderActionStable = useCallback((action: HeaderAction | null) => {
    setHeaderAction(action);
  }, []);
  const [error, setError] = useState<string | null>(null);

  const adopt = useCallback(async (sessionToken: string, user: User) => {
    sessionStorage.setItem(SESSION_KEY, sessionToken);
    setState({ status: "ready", user, sessionToken });
    setError(null);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function restore() {
      const existing = sessionStorage.getItem(SESSION_KEY);
      if (existing) {
        try {
          const user = await currentUser(existing);
          if (!cancelled) {
            setState({ status: "ready", user, sessionToken: existing });
            return;
          }
        } catch {
          sessionStorage.removeItem(SESSION_KEY);
        }
      }

      const initData = await readRawInitData();
      if (initData) {
        try {
          const auth = await loginWithTelegram(initData);
          if (!cancelled) {
            await adopt(auth.session_token, auth.user);
            return;
          }
        } catch (caught) {
          if (!cancelled) {
            setError(caught instanceof ApiError ? caught.message : "Telegram sign-in failed.");
          }
        }
      }

      if (!cancelled) {
        setState({ status: "anonymous" });
      }
    }

    void restore();
    return () => {
      cancelled = true;
    };
  }, [adopt]);

  const signInDevelopment = useCallback(async () => {
    setError(null);
    try {
      const auth = await loginDevelopment();
      await adopt(auth.session_token, auth.user);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Development sign-in failed.");
    }
  }, [adopt]);

  const value = useMemo(
    () => ({ state, devAuthEnabled, signInDevelopment, error }),
    [state, signInDevelopment, error],
  );

  const displayName = state.status === "ready" ? state.user.first_name : "";
  const isAdmin = state.status === "ready" && state.user.is_admin;
  const onAdmin = pathname.startsWith("/admin");
  const wrongPlace = state.status !== "loading" && (isAdmin ? !onAdmin : onAdmin);

  useEffect(() => {
    if (!wrongPlace) {
      return;
    }
    router.replace(isAdmin ? "/admin" : "/");
  }, [isAdmin, router, wrongPlace]);

  const { t } = useI18n();

  const questionId = pathname.startsWith("/play/") ? pathname.split("/")[2] : null;
  const onChallenge = pathname.startsWith("/challenges/");
  const backHref = questionId ? `/challenges/${questionId}` : onChallenge ? "/" : null;
  const backLabel = questionId ? t("home.allChallenges") : t("nav.home");
  const title = onAdmin
    ? t("nav.admin")
    : pathname === "/profile"
      ? t("nav.profile")
      : pathname === "/wallet"
        ? t("nav.wallet")
        : pathname === "/spin"
          ? t("nav.spin")
          : t("nav.home");
  const showNav = !questionId && !isAdmin && !onAdmin;

  return (
    <AuthContext.Provider value={value}>
      <HeaderActionContext.Provider value={setHeaderActionStable}>
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
        <header className="flex h-14 items-center justify-between gap-2 px-5">
          {backHref ? (
            <Link href={backHref} className="text-sm font-semibold truncate max-w-36">
              ← {backLabel}
            </Link>
          ) : (
            <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
          )}
          <div className="flex items-center gap-2">
            <LanguageSwitcher compact />
            {headerAction ? (
              <button
                type="button"
                onClick={headerAction.onClick}
                disabled={headerAction.disabled}
                className="text-xs font-medium text-[var(--muted)] disabled:opacity-50"
              >
                {headerAction.label}
              </button>
            ) : displayName ? (
              <p className="max-w-24 truncate text-xs text-[var(--muted)]">{displayName}</p>
            ) : null}
          </div>
        </header>
        <main className={`flex-1 px-5 ${showNav ? "pb-24" : "pb-6"}`}>
          {wrongPlace ? <div className="h-40 animate-pulse rounded-3xl bg-black/5" /> : children}
        </main>
        {!showNav ? null : (
        <nav className="fixed inset-x-0 bottom-0 mx-auto w-full max-w-md border-t border-black/5 bg-[var(--background)]/90 px-3 py-2 backdrop-blur-md">
          <div className="grid grid-cols-4 gap-1">
            <NavLink href="/" active={pathname === "/"} icon="home">
              {t("nav.home")}
            </NavLink>
            <NavLink href="/spin" active={pathname === "/spin"} icon="spin">
              {t("nav.spin")}
            </NavLink>
            <NavLink href="/wallet" active={pathname === "/wallet"} icon="wallet">
              {t("nav.wallet")}
            </NavLink>
            <NavLink href="/profile" active={pathname === "/profile"} icon="profile">
              {t("nav.profile")}
            </NavLink>
          </div>
        </nav>
        )}
      </div>
      </HeaderActionContext.Provider>
    </AuthContext.Provider>
  );
}

function NavLink({
  href,
  active,
  icon,
  children,
}: {
  href: string;
  active: boolean;
  icon: "home" | "spin" | "wallet" | "profile";
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`press flex h-12 flex-col items-center justify-center gap-0.5 rounded-2xl text-[10px] font-semibold ${
        active ? "bg-[var(--accent)] text-[var(--accent-text)]" : "text-[var(--muted)]"
      }`}
    >
      <TabIcon name={icon} />
      {children}
    </Link>
  );
}

function TabIcon({ name }: { name: "home" | "spin" | "wallet" | "profile" }) {
  const common = "h-4 w-4";
  if (name === "spin") {
    return (
      <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6 5.6 18.4" />
        <circle cx="12" cy="12" r="2.5" fill="currentColor" />
      </svg>
    );
  }
  if (name === "wallet") {
    return (
      <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <rect x="3" y="6" width="18" height="13" rx="3" />
        <path d="M3 10h18" />
      </svg>
    );
  }
  if (name === "profile") {
    return (
      <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <circle cx="12" cy="8" r="3" />
        <path d="M5 19c1.5-3 3.8-4.5 7-4.5S17.5 16 19 19" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M4 11.5 12 5l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z" />
    </svg>
  );
}
