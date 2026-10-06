"use client";

import { useEffect } from "react";

import { ApiError } from "@/lib/api";

export type Tone = "success" | "waiting" | "error";

export type Message = {
  tone: Tone;
  title: string;
  message: string;
};

export function describeError(caught: unknown, fallback: string): Message {
  if (caught instanceof ApiError) {
    return { tone: "error", title: caught.title, message: caught.message };
  }
  return { tone: "error", title: "Something went wrong", message: fallback };
}

export function Spinner({ size = "lg" }: { size?: "sm" | "lg" }) {
  const dimensions = size === "sm" ? "h-4 w-4 border-2" : "h-14 w-14 border-4";
  return (
    <span
      aria-hidden
      className={`block animate-spin rounded-full border-black/10 border-t-[var(--accent)] ${dimensions}`}
    />
  );
}

function Icon({ tone }: { tone: Tone }) {
  const base = "flex h-14 w-14 items-center justify-center rounded-full text-2xl font-semibold";
  if (tone === "success") {
    return <span className={`${base} bg-emerald-100 text-emerald-700`}>✓</span>;
  }
  if (tone === "waiting") {
    return <span className={`${base} bg-amber-100 text-amber-700`}>…</span>;
  }
  return <span className={`${base} bg-red-100 text-red-700`}>!</span>;
}

export function LoadingOverlay({ title, message }: { title: string; message?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 px-8 backdrop-blur-sm"
    >
      <div className="flex w-full max-w-xs flex-col items-center rounded-3xl bg-[var(--card)] px-6 py-8 text-center shadow-2xl">
        <Spinner />
        <p className="mt-5 text-base font-semibold">{title}</p>
        {message ? (
          <p className="mt-1 text-sm leading-6 text-[var(--muted)]">{message}</p>
        ) : null}
      </div>
    </div>
  );
}

export function ResultDialog({
  result,
  onClose,
  actionLabel,
}: {
  result: Message;
  onClose: () => void;
  actionLabel?: string;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="result-title"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 px-8 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-xs flex-col items-center rounded-3xl bg-[var(--card)] px-6 py-7 text-center shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <Icon tone={result.tone} />
        <p id="result-title" className="mt-4 text-lg font-semibold">
          {result.title}
        </p>
        <p className="mt-1 text-sm leading-6 text-[var(--muted)]">{result.message}</p>
        <button
          type="button"
          onClick={onClose}
          className={`mt-6 h-11 w-full rounded-full text-sm font-semibold ${
            result.tone === "error"
              ? "bg-[var(--accent)] text-[var(--accent-text)]"
              : "bg-[var(--foreground)] text-[var(--background)]"
          }`}
        >
          {actionLabel ?? (result.tone === "error" ? "Try again" : "Done")}
        </button>
      </div>
    </div>
  );
}

export function ErrorNotice({
  error,
  onRetry,
}: {
  error: Message | null;
  onRetry?: () => void;
}) {
  if (!error) {
    return null;
  }
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-red-900"
    >
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white">
        !
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{error.title}</p>
        <p className="text-sm leading-6 text-red-800">{error.message}</p>
      </div>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-semibold text-red-800 shadow-sm"
        >
          Retry
        </button>
      ) : null}
    </div>
  );
}
