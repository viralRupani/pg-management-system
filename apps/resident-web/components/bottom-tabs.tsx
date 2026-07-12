"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Icon } from "@/components/ui/icon";
import { haptics } from "@/lib/haptics";
import { cn } from "@/lib/utils";

/** The 4 resident tabs, in bar order (matches the mobile tab bar). */
const TABS = [
  { href: "/home", label: "Home", icon: "home-outline" },
  { href: "/rent", label: "Rent", icon: "wallet-outline" },
  { href: "/complaints", label: "Complaints", icon: "chatbubble-ellipses-outline" },
  { href: "/more", label: "Profile", icon: "person-outline" },
] as const;

/**
 * Fixed bottom-tab bar (web port of the mobile custom bar): stacked icon +
 * label, a soft brand pill behind the active icon, PG accent tint. Pinned to
 * the bottom of the centered mobile column. A tab is active when the path is
 * or starts with its href (so detail screens highlight their parent tab).
 */
export function BottomTabs() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-[480px] flex-row border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]">
      {TABS.map((tab) => {
        const active =
          pathname === tab.href ||
          pathname.startsWith(`${tab.href}/`) ||
          // Trailing-slash export serves /home/ — normalize.
          pathname === `${tab.href}/`;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            onClick={() => {
              if (!active) haptics.tap();
            }}
            aria-current={active ? "page" : undefined}
            className="flex min-h-[52px] flex-1 flex-col items-center py-[7px]"
          >
            <span className="relative flex h-[30px] w-[52px] items-center justify-center">
              <span
                className={cn(
                  "absolute inset-0 rounded-pill bg-brand-soft transition-[opacity,transform] duration-200",
                  active ? "scale-x-100 opacity-100" : "scale-x-[0.6] opacity-0",
                )}
              />
              <Icon
                name={tab.icon}
                size={22}
                className={cn("relative", active ? "text-brand-deep" : "text-ink3")}
                strokeWidth={active ? 2.4 : 2}
              />
            </span>
            <span
              className={cn(
                "mt-0.5 text-[11px] leading-[14px]",
                active ? "font-semibold text-brand-deep" : "font-medium text-ink3",
              )}
            >
              {tab.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
