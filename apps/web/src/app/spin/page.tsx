"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { useAuth, useHeaderAction } from "@/components/app-shell";
import { ApiError, executeSpin, getSpinHistory, getSpinStatus } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { SpinHistoryItem, SpinResult, SpinSegment, SpinStatus } from "@/lib/types";

const SEGMENT_PALETTE = [
  "#3b82f6", // blue
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ec4899", // pink
  "#8b5cf6", // purple
  "#06b6d4", // cyan
  "#f97316", // orange
  "#14b8a6", // teal
];

function triggerHaptic(type: "impact" | "success" | "warning") {
  try {
    const tg = (window as unknown as { Telegram?: { WebApp?: { HapticFeedback?: {
      impactOccurred?: (style: string) => void;
      notificationOccurred?: (type: string) => void;
    } } } })?.Telegram?.WebApp?.HapticFeedback;
    if (tg) {
      if (type === "impact" && tg.impactOccurred) tg.impactOccurred("medium");
      if (type === "success" && tg.notificationOccurred) tg.notificationOccurred("success");
      if (type === "warning" && tg.notificationOccurred) tg.notificationOccurred("warning");
    }
  } catch {
    // Ignore if not in Telegram
  }
}

function formatCountdown(totalSeconds: number): string {
  if (totalSeconds <= 0) return "00:00:00";
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function SpinPage() {
  const { state } = useAuth();
  const { t } = useI18n();
  const sessionToken = state.status === "ready" ? state.sessionToken : null;

  const [status, setStatus] = useState<SpinStatus | null>(null);
  const [history, setHistory] = useState<SpinHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [spinning, setSpinning] = useState(false);
  const [rotationDegrees, setRotationDegrees] = useState(0);
  const [countdown, setCountdown] = useState<number>(0);
  const [winResult, setWinResult] = useState<SpinResult | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Load status and history
  const loadData = useCallback(async () => {
    if (!sessionToken) return;
    try {
      setError(null);
      const [spinStatus, spinHistory] = await Promise.all([
        getSpinStatus(sessionToken),
        getSpinHistory(sessionToken).catch(() => []),
      ]);
      setStatus(spinStatus);
      setHistory(spinHistory);
      setCountdown(spinStatus.seconds_remaining);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load spin wheel.");
    } finally {
      setLoading(false);
    }
  }, [sessionToken]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Header refresh
  useHeaderAction(
    sessionToken
      ? {
          label: t("header.refresh"),
          disabled: spinning,
          onClick: () => void loadData(),
        }
      : null,
  );

  // Countdown timer interval
  useEffect(() => {
    if (countdown <= 0) return;
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          void loadData();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [countdown, loadData]);

  // Confetti effect on win
  useEffect(() => {
    if (!showModal || !winResult || Number(winResult.prize_amount_etb) <= 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    const count = 75;
    const particles = Array.from({ length: count }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * -canvas.height,
      r: Math.random() * 6 + 3,
      dx: (Math.random() - 0.5) * 3,
      dy: Math.random() * 3 + 2,
      color: SEGMENT_PALETTE[Math.floor(Math.random() * SEGMENT_PALETTE.length)],
      tilt: Math.random() * 10,
    }));

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of particles) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
        p.x += p.dx;
        p.y += p.dy;
        p.tilt += 0.1;
        if (p.y > canvas.height) {
          p.y = -10;
          p.x = Math.random() * canvas.width;
        }
      }
      animId = requestAnimationFrame(render);
    };
    render();

    return () => cancelAnimationFrame(animId);
  }, [showModal, winResult]);

  // Handle spin execution
  const handleSpin = async () => {
    if (!sessionToken || spinning || !status || !status.can_spin) return;
    setSpinning(true);
    setError(null);
    triggerHaptic("impact");

    try {
      const result = await executeSpin(sessionToken);

      const segmentCount = status.segments.length;
      const segmentAngle = 360 / segmentCount;

      // Pointer is at the top (270 deg or -90 deg).
      // Segment `i` spans from `i * segmentAngle` to `(i + 1) * segmentAngle`.
      // Center of segment `i` is at `(i + 0.5) * segmentAngle`.
      // To bring center of segment `result.segment_index` to top pointer:
      // Final rotation = 360 * extra_spins + (360 - center_angle + 270) % 360.
      const centerAngle = (result.segment_index + 0.5) * segmentAngle;
      // Top position is 270 deg in SVG canvas coordinates (or -90 deg).
      const targetDeg = (360 - centerAngle + 270) % 360;

      const extraSpins = 5 + Math.floor(Math.random() * 2); // 5 to 6 full rounds
      const currentMod = rotationDegrees % 360;
      const additional = extraSpins * 360 + ((targetDeg - currentMod + 360) % 360);
      const finalDegrees = rotationDegrees + additional;

      setRotationDegrees(finalDegrees);

      // Wait for wheel animation (4.5s)
      setTimeout(() => {
        setSpinning(false);
        setWinResult(result);
        setShowModal(true);

        const wonCash = Number(result.prize_amount_etb) > 0;
        triggerHaptic(wonCash ? "success" : "warning");

        // Update status cooldown
        setStatus((prev) =>
          prev
            ? {
                ...prev,
                can_spin: false,
                seconds_remaining: prev.cooldown_hours * 3600,
                last_spin_at: new Date().toISOString(),
              }
            : null,
        );
        setCountdown((status?.cooldown_hours ?? 24) * 3600);

        // Prepend to history
        setHistory((prev) => [
          {
            id: result.spin_id,
            segment_label: result.segment_label,
            prize_amount_etb: result.prize_amount_etb,
            created_at: new Date().toISOString(),
          },
          ...prev,
        ]);
      }, 4600);
    } catch (err) {
      setSpinning(false);
      setError(err instanceof ApiError ? err.message : "Spin failed. Please try again.");
      triggerHaptic("warning");
    }
  };

  const segments: SpinSegment[] = status?.segments ?? [];
  const numSegments = Math.max(1, segments.length);
  const sliceAngle = 360 / numSegments;

  return (
    <div className="space-y-6 pb-6">
      {/* Title Header */}
      <section className="text-center">
        <div className="inline-flex items-center gap-2 rounded-full bg-amber-500/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-amber-600">
          <span>✨</span> {t("spin.title")}
        </div>
        <p className="mt-2 text-xs leading-relaxed text-[var(--muted)] max-w-xs mx-auto">
          {t("spin.subtitle")}
        </p>
      </section>

      {error ? (
        <div className="rounded-2xl bg-rose-500/10 p-3 text-center text-xs font-semibold text-rose-600">
          {error}
        </div>
      ) : null}

      {/* Wheel Area */}
      <div className="relative flex flex-col items-center justify-center pt-2">
        {/* Glow backdrop */}
        <div className="absolute h-72 w-72 rounded-full bg-gradient-to-tr from-amber-400/20 via-rose-500/20 to-purple-500/20 blur-2xl" />

        {/* Wheel Container */}
        <div className="relative h-72 w-72 sm:h-80 sm:w-80">
          {/* Top Pointer Needle */}
          <div className="absolute -top-3 left-1/2 z-20 -translate-x-1/2 filter drop-shadow-md">
            <svg width="34" height="42" viewBox="0 0 34 42" fill="none">
              <path
                d="M17 40L3 10C1 6 4 0 9 0H25C30 0 33 6 31 10L17 40Z"
                fill="#ef4444"
                stroke="#ffffff"
                strokeWidth="2.5"
              />
              <circle cx="17" cy="12" r="5" fill="#ffffff" />
            </svg>
          </div>

          {/* Wheel Frame & Center Hub */}
          <div
            className="relative h-full w-full rounded-full border-4 border-amber-400 bg-gray-900 shadow-[0_10px_35px_rgba(0,0,0,0.35)] overflow-hidden"
            style={{
              transform: `rotate(${rotationDegrees}deg)`,
              transition: spinning ? "transform 4.5s cubic-bezier(0.15, 0.9, 0.2, 1)" : "none",
            }}
          >
            {/* SVG Segments */}
            <svg viewBox="0 0 300 300" className="h-full w-full">
              <defs>
                {segments.map((_, i) => (
                  <path
                    key={`textpath-${i}`}
                    id={`textpath-${i}`}
                    d="M 150 150 L 150 20"
                    transform={`rotate(${i * sliceAngle + sliceAngle / 2} 150 150)`}
                  />
                ))}
              </defs>

              {segments.map((seg, i) => {
                const startAngle = (i * sliceAngle * Math.PI) / 180;
                const endAngle = (((i + 1) * sliceAngle) * Math.PI) / 180;

                const r = 148;
                const cx = 150;
                const cy = 150;

                const x1 = cx + r * Math.cos(startAngle);
                const y1 = cy + r * Math.sin(startAngle);
                const x2 = cx + r * Math.cos(endAngle);
                const y2 = cy + r * Math.sin(endAngle);

                const largeArc = sliceAngle > 180 ? 1 : 0;
                const pathData = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;

                const fill = seg.color || SEGMENT_PALETTE[i % SEGMENT_PALETTE.length];
                const midAngle = (i + 0.5) * sliceAngle;

                return (
                  <g key={seg.id || i}>
                    <path
                      d={pathData}
                      fill={fill}
                      stroke="#ffffff"
                      strokeWidth="1.5"
                    />
                    {/* Rotated text for segment */}
                    <g transform={`rotate(${midAngle} 150 150)`}>
                      <text
                        x="230"
                        y="155"
                        fill="#ffffff"
                        fontSize={segments.length > 8 ? "10" : "11"}
                        fontWeight="bold"
                        textAnchor="middle"
                        transform="rotate(90 230 155)"
                        className="select-none font-sans drop-shadow-sm"
                      >
                        {seg.label}
                      </text>
                    </g>
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Center Hub Button Badge */}
          <div className="absolute inset-0 m-auto flex h-14 w-14 items-center justify-center rounded-full border-4 border-white bg-gradient-to-tr from-amber-500 to-amber-300 text-base font-extrabold text-white shadow-xl pointer-events-none">
            ⭐
          </div>
        </div>
      </div>

      {/* Action / Countdown Section */}
      <div className="flex flex-col items-center justify-center space-y-3 px-4">
        {loading ? (
          <div className="h-12 w-full animate-pulse rounded-full bg-black/10" />
        ) : status && !status.is_enabled ? (
          <div className="w-full rounded-2xl bg-amber-500/10 p-4 text-center">
            <p className="text-xs font-semibold text-amber-700">{t("spin.disabled")}</p>
          </div>
        ) : status && status.can_spin ? (
          <button
            type="button"
            onClick={() => void handleSpin()}
            disabled={spinning}
            className="press w-full rounded-full bg-gradient-to-r from-amber-500 via-rose-500 to-indigo-600 py-3.5 text-center text-sm font-extrabold uppercase tracking-wider text-white shadow-lg transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60"
          >
            {spinning ? t("spin.spinning") : t("spin.button")}
          </button>
        ) : (
          <div className="w-full rounded-3xl bg-[var(--card)] p-4 text-center shadow-sm border border-black/5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">
              {t("spin.cooldownTitle")}
            </span>
            <div className="mt-1 text-2xl font-mono font-extrabold tracking-tight text-[var(--foreground)]">
              {formatCountdown(countdown)}
            </div>
            <p className="mt-1 text-[11px] text-[var(--muted)]">
              {t("spin.cooldownSubtitle")}
            </p>
          </div>
        )}
      </div>

      {/* Spin History Section */}
      <section className="space-y-3 px-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
          {t("spin.history")}
        </h3>
        {history.length === 0 ? (
          <div className="rounded-2xl bg-[var(--card)] p-4 text-center text-xs text-[var(--muted)]">
            {t("spin.noHistory")}
          </div>
        ) : (
          <div className="divide-y divide-black/5 rounded-2xl bg-[var(--card)] overflow-hidden shadow-sm">
            {history.slice(0, 8).map((item) => {
              const won = Number(item.prize_amount_etb) > 0;
              return (
                <div key={item.id} className="flex items-center justify-between p-3.5 text-xs">
                  <div className="flex items-center gap-2.5">
                    <span className="text-base">{won ? "🎁" : "🍀"}</span>
                    <div>
                      <p className="font-semibold">{item.segment_label}</p>
                      <p className="text-[10px] text-[var(--muted)]">
                        {new Date(item.created_at).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>
                  <div className={`font-bold ${won ? "text-emerald-600" : "text-[var(--muted)]"}`}>
                    {won ? `+${item.prize_amount_etb} ETB` : "—"}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Win / Result Celebration Modal */}
      {showModal && winResult ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <canvas
            ref={canvasRef}
            width={340}
            height={400}
            className="pointer-events-none absolute inset-0 m-auto z-10"
          />
          <div className="rise relative z-20 w-full max-w-xs rounded-3xl bg-[var(--background)] p-6 text-center shadow-2xl border border-black/10">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/10 text-3xl">
              {Number(winResult.prize_amount_etb) > 0 ? "🎉" : "✨"}
            </div>
            <h4 className="mt-3 text-lg font-bold">
              {Number(winResult.prize_amount_etb) > 0
                ? t("spin.winTitle")
                : t("spin.tryAgain")}
            </h4>
            <div className="my-3 rounded-2xl bg-[var(--card)] py-3 px-4">
              <p className="text-xs text-[var(--muted)]">{winResult.segment_label}</p>
              {Number(winResult.prize_amount_etb) > 0 ? (
                <p className="text-2xl font-extrabold text-emerald-600 mt-1">
                  +{winResult.prize_amount_etb} ETB
                </p>
              ) : null}
            </div>
            {Number(winResult.prize_amount_etb) > 0 ? (
              <p className="text-[11px] text-[var(--muted)] mb-4">
                {t("spin.claim")}
              </p>
            ) : null}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="press w-full rounded-full bg-[var(--foreground)] py-3 text-xs font-bold text-[var(--background)] shadow"
              >
                {t("common.close")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
