"use client";

import type { DashboardRevenueMonth } from "@pg/shared";

/** Compact ₹ label for chart axes (avoids long labels). */
function compactRupees(paise: number): string {
  const r = paise / 100;
  if (r >= 100000) return `₹${(r / 100000).toFixed(1)}L`;
  if (r >= 1000) return `₹${(r / 1000).toFixed(0)}K`;
  return `₹${r.toFixed(0)}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function monthLabel(period: string): string {
  const m = parseInt(period.split("-")[1], 10);
  return MONTHS[m - 1] ?? period;
}

export function RevenueBarChart({ data }: { data: DashboardRevenueMonth[] }) {
  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No invoice data yet.
      </p>
    );
  }

  const maxVal = Math.max(...data.flatMap((d) => [d.invoicedPaise, d.collectedPaise]), 1);
  // SVG coordinate system
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

  // Friendly Y-axis ticks
  const nTicks = 4;
  const ticks = Array.from({ length: nTicks + 1 }, (_, i) => (maxVal / nTicks) * i);

  return (
    <div className="w-full">
      {/* Legend */}
      <div className="mb-3 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-muted-foreground/30" />
          Invoiced
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-brand" />
          Collected
        </span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ height: "auto" }}
        aria-label="Revenue trend"
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

        {/* Bars + X-axis labels */}
        {data.map((d, i) => {
          const cx = PADDING_LEFT + groupW * i + groupW / 2;
          const invoicedH = (d.invoicedPaise / maxVal) * chartH;
          const collectedH = (d.collectedPaise / maxVal) * chartH;

          const invoicedX = cx - barW - gap / 2;
          const collectedX = cx + gap / 2;

          return (
            <g key={d.period}>
              {/* Invoiced bar */}
              <rect
                x={invoicedX}
                y={PADDING_TOP + chartH - invoicedH}
                width={barW}
                height={invoicedH}
                fill="var(--muted-foreground)"
                fillOpacity={0.3}
                rx={2}
              />
              {/* Collected bar */}
              <rect
                x={collectedX}
                y={PADDING_TOP + chartH - collectedH}
                width={barW}
                height={collectedH}
                fill="var(--brand)"
                rx={2}
              />
              {/* X-axis month label */}
              <text
                x={cx}
                y={H - 6}
                textAnchor="middle"
                fontSize={10}
                fill="var(--muted-foreground)"
              >
                {monthLabel(d.period)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
