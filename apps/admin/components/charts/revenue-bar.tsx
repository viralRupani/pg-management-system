"use client";

import { useState } from "react";
import type { DashboardRevenueMonth } from "@pg/shared";

/** Compact ₹ label for chart axes (avoids long labels). */
function compactRupees(paise: number): string {
  const r = paise / 100;
  if (r >= 100000) return `₹${(r / 100000).toFixed(1)}L`;
  if (r >= 1000) return `₹${(r / 1000).toFixed(0)}K`;
  return `₹${r.toFixed(0)}`;
}

/** Full ₹ with grouping for tooltips. */
function fullRupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function monthLabel(period: string): string {
  const m = parseInt(period.split("-")[1], 10);
  return MONTHS[m - 1] ?? period;
}

function monthYearLabel(period: string): string {
  const [y, m] = period.split("-");
  return `${MONTHS[parseInt(m, 10) - 1] ?? period} ${y}`;
}

function rate(invoiced: number, collected: number): number {
  return invoiced > 0 ? collected / invoiced : 0;
}

/** One headline stat shown above the chart. */
function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "up" | "down" | "neutral";
}) {
  const toneColor =
    tone === "up"
      ? "text-success"
      : tone === "down"
        ? "text-danger"
        : "text-foreground";
  return (
    <div className="min-w-0">
      <p className="truncate text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className={`mt-0.5 text-lg font-semibold tabular-nums ${toneColor}`}>
        {value}
      </p>
      {hint && <p className="truncate text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function RevenueBarChart({ data }: { data: DashboardRevenueMonth[] }) {
  const [hovered, setHovered] = useState<number | null>(null);

  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No invoice data yet.
      </p>
    );
  }

  // ── Derived statistics ──────────────────────────────────────────────
  const totalInvoiced = data.reduce((s, d) => s + d.invoicedPaise, 0);
  const totalCollected = data.reduce((s, d) => s + d.collectedPaise, 0);
  const totalOutstanding = Math.max(totalInvoiced - totalCollected, 0);
  const overallRate = rate(totalInvoiced, totalCollected);

  // Month-over-month change in collections (last vs previous month).
  const last = data[data.length - 1];
  const prev = data.length >= 2 ? data[data.length - 2] : null;
  const momDelta =
    prev && prev.collectedPaise > 0
      ? (last.collectedPaise - prev.collectedPaise) / prev.collectedPaise
      : null;
  const momTone: "up" | "down" | "neutral" =
    momDelta == null ? "neutral" : momDelta > 0 ? "up" : momDelta < 0 ? "down" : "neutral";

  const maxVal = Math.max(...data.flatMap((d) => [d.invoicedPaise, d.collectedPaise]), 1);

  // ── SVG coordinate system ───────────────────────────────────────────
  const W = 480;
  const H = 160;
  const PADDING_LEFT = 56;
  const PADDING_RIGHT = 8;
  const PADDING_TOP = 8;
  const PADDING_BOTTOM = 28;
  const chartW = W - PADDING_LEFT - PADDING_RIGHT;
  const chartH = H - PADDING_TOP - PADDING_BOTTOM;

  const n = data.length;
  const groupW = chartW / n;
  const barW = Math.min(14, groupW * 0.3);
  const gap = 3;

  const yScale = (v: number) => chartH - (v / maxVal) * chartH;

  const nTicks = 4;
  const ticks = Array.from({ length: nTicks + 1 }, (_, i) => (maxVal / nTicks) * i);

  const active = hovered != null ? data[hovered] : null;
  // Horizontal anchor (%) of the hovered group for the HTML tooltip; clamped so
  // edge months don't overflow the card.
  const tooltipLeft =
    hovered != null
      ? Math.min(
          88,
          Math.max(12, ((PADDING_LEFT + groupW * hovered + groupW / 2) / W) * 100),
        )
      : 50;

  return (
    <div className="w-full">
      {/* Headline statistics */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Collected (6mo)" value={compactRupees(totalCollected)} hint={fullRupees(totalCollected)} />
        <Stat
          label="Collection rate"
          value={`${Math.round(overallRate * 100)}%`}
          hint={`of ${compactRupees(totalInvoiced)} invoiced`}
        />
        <Stat
          label="Outstanding"
          value={compactRupees(totalOutstanding)}
          hint={totalOutstanding > 0 ? "uncollected" : "all collected"}
          tone={totalOutstanding > 0 ? "down" : "up"}
        />
        <Stat
          label="MoM collected"
          value={
            momDelta == null
              ? "—"
              : `${momDelta > 0 ? "+" : ""}${Math.round(momDelta * 100)}%`
          }
          hint={prev ? `vs ${monthLabel(prev.period)}` : "no prior month"}
          tone={momTone}
        />
      </div>

      {/* Legend */}
      <div className="mb-2 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-muted-foreground/30" />
          Invoiced
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-brand" />
          Collected
        </span>
      </div>

      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          style={{ height: "auto" }}
          role="img"
          aria-label="Revenue trend over the last 6 months"
          onMouseLeave={() => setHovered(null)}
        >
          {/* Y-axis grid lines + labels */}
          {ticks.map((v, i) => {
            const y = PADDING_TOP + yScale(v);
            return (
              <g key={i}>
                <line
                  x1={PADDING_LEFT}
                  y1={y}
                  x2={W - PADDING_RIGHT}
                  y2={y}
                  stroke="var(--border)"
                  strokeWidth={0.5}
                />
                <text
                  x={PADDING_LEFT - 4}
                  y={y + 4}
                  textAnchor="end"
                  fontSize={9}
                  fill="var(--muted-foreground)"
                >
                  {v === 0 ? "₹0" : compactRupees(v)}
                </text>
              </g>
            );
          })}

          {/* Bars + X-axis labels + per-group hover hit-area */}
          {data.map((d, i) => {
            const cx = PADDING_LEFT + groupW * i + groupW / 2;
            const invoicedH = (d.invoicedPaise / maxVal) * chartH;
            const collectedH = (d.collectedPaise / maxVal) * chartH;

            const invoicedX = cx - barW - gap / 2;
            const collectedX = cx + gap / 2;

            const isActive = hovered === i;
            const dim = hovered != null && !isActive ? 0.35 : 1;

            return (
              <g key={d.period}>
                {/* Hover highlight band behind the active group */}
                {isActive && (
                  <rect
                    x={cx - groupW / 2}
                    y={PADDING_TOP}
                    width={groupW}
                    height={chartH}
                    fill="var(--muted-foreground)"
                    fillOpacity={0.08}
                    rx={4}
                  />
                )}

                {/* Invoiced bar */}
                <rect
                  x={invoicedX}
                  y={PADDING_TOP + chartH - invoicedH}
                  width={barW}
                  height={invoicedH}
                  fill="var(--muted-foreground)"
                  fillOpacity={0.3 * dim}
                  rx={2}
                />
                {/* Collected bar */}
                <rect
                  x={collectedX}
                  y={PADDING_TOP + chartH - collectedH}
                  width={barW}
                  height={collectedH}
                  fill="var(--brand)"
                  fillOpacity={dim}
                  rx={2}
                />
                {/* X-axis month label */}
                <text
                  x={cx}
                  y={H - 6}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight={isActive ? 600 : 400}
                  fill={isActive ? "var(--foreground)" : "var(--muted-foreground)"}
                >
                  {monthLabel(d.period)}
                </text>

                {/* Full-height transparent hit-area for easy hovering */}
                <rect
                  x={cx - groupW / 2}
                  y={PADDING_TOP}
                  width={groupW}
                  height={chartH}
                  fill="transparent"
                  onMouseEnter={() => setHovered(i)}
                  style={{ cursor: "pointer" }}
                />
              </g>
            );
          })}
        </svg>

        {/* HTML tooltip — richer styling than SVG <text> allows */}
        {active && (
          <div
            className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-md border border-border bg-card px-3 py-2 text-xs shadow-md"
            style={{ left: `${tooltipLeft}%` }}
          >
            <p className="mb-1 font-semibold text-foreground">
              {monthYearLabel(active.period)}
            </p>
            <div className="space-y-0.5">
              <p className="flex items-center justify-between gap-4 text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-sm bg-muted-foreground/30" />
                  Invoiced
                </span>
                <span className="font-medium tabular-nums text-foreground">
                  {fullRupees(active.invoicedPaise)}
                </span>
              </p>
              <p className="flex items-center justify-between gap-4 text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-sm bg-brand" />
                  Collected
                </span>
                <span className="font-medium tabular-nums text-foreground">
                  {fullRupees(active.collectedPaise)}
                </span>
              </p>
              <p className="mt-1 flex items-center justify-between gap-4 border-t border-border pt-1 text-muted-foreground">
                <span>Collection rate</span>
                <span className="font-medium tabular-nums text-foreground">
                  {Math.round(rate(active.invoicedPaise, active.collectedPaise) * 100)}%
                </span>
              </p>
              {active.invoicedPaise - active.collectedPaise > 0 && (
                <p className="flex items-center justify-between gap-4 text-muted-foreground">
                  <span>Outstanding</span>
                  <span className="font-medium tabular-nums text-danger">
                    {fullRupees(active.invoicedPaise - active.collectedPaise)}
                  </span>
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
