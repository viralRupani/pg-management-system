"use client";

import type { DashboardCurrentMonth } from "@pg/shared";

interface Segment {
  label: string;
  count: number;
  color: string;
}

/** Build an SVG arc path for a donut slice. */
function arcPath(
  cx: number,
  cy: number,
  r: number,
  innerR: number,
  startAngle: number,
  endAngle: number,
): string {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const s = toRad(startAngle);
  const e = toRad(endAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  const x1 = cx + r * Math.cos(s);
  const y1 = cy + r * Math.sin(s);
  const x2 = cx + r * Math.cos(e);
  const y2 = cy + r * Math.sin(e);
  const ix1 = cx + innerR * Math.cos(e);
  const iy1 = cy + innerR * Math.sin(e);
  const ix2 = cx + innerR * Math.cos(s);
  const iy2 = cy + innerR * Math.sin(s);
  return [
    `M ${x1} ${y1}`,
    `A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`,
    `L ${ix1} ${iy1}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix2} ${iy2}`,
    "Z",
  ].join(" ");
}

export function InvoiceDonutChart({ data }: { data: DashboardCurrentMonth }) {
  const segments: Segment[] = [
    { label: "Paid", count: data.paidCount, color: "var(--success)" },
    { label: "Pending", count: data.pendingCount, color: "var(--warning)" },
    { label: "Overdue", count: data.overdueCount, color: "var(--danger)" },
    { label: "Waived", count: data.waivedCount, color: "var(--muted-foreground)" },
  ].filter((s) => s.count > 0);

  const total = data.paidCount + data.pendingCount + data.overdueCount + data.waivedCount;
  const collectionRate =
    total > 0 ? Math.round((data.paidCount / total) * 100) : 0;

  const cx = 80;
  const cy = 80;
  const r = 62;
  const innerR = 42;

  if (total === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-6">
        <p className="text-sm text-muted-foreground">No invoices this month.</p>
      </div>
    );
  }

  // Build arcs
  let angle = -90; // start at 12 o'clock
  const arcs = segments.map((seg) => {
    const sweep = (seg.count / total) * 360;
    const path = arcPath(cx, cy, r, innerR, angle, angle + sweep - 0.5);
    angle += sweep;
    return { ...seg, path };
  });

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative">
        <svg viewBox="0 0 160 160" className="w-36 h-36" aria-label="Invoice breakdown">
          {arcs.map((a) => (
            <path key={a.label} d={a.path} fill={a.color} />
          ))}
          {/* Center text */}
          <text
            x={cx}
            y={cy - 6}
            textAnchor="middle"
            fontSize={18}
            fontWeight="600"
            fill="var(--foreground)"
          >
            {collectionRate}%
          </text>
          <text
            x={cx}
            y={cy + 10}
            textAnchor="middle"
            fontSize={9}
            fill="var(--muted-foreground)"
          >
            collected
          </text>
        </svg>
      </div>

      {/* Legend */}
      <ul className="w-full space-y-1.5 text-xs">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ backgroundColor: s.color }}
              />
              {s.label}
            </span>
            <span className="font-medium text-foreground">{s.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
