"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

/** The 4 resident tabs, in bar order. */
const TABS = [
  { href: "/home", label: "Home", icon: "home-outline" },
  { href: "/rent", label: "Rent", icon: "wallet-outline" },
  { href: "/complaints", label: "Complaints", icon: "chatbubble-ellipses-outline" },
  { href: "/more", label: "Profile", icon: "person-outline" },
] as const;

/**
 * Fixed bottom-tab bar (replaces the mobile Material Top Tabs). Active tab takes
 * the PG accent; pinned to the bottom of the centered mobile column. A tab is
 * active when the path is or starts with its href (so detail screens highlight
 * their parent tab).
 */
export function BottomTabs() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-[480px] flex-row border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]">
      {TABS.map((tab) => {
        const active =
          pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 py-2",
              active ? "text-brand" : "text-ink3",
            )}
          >
            <Icon name={tab.icon} size={24} />
            <span className="text-[11px] font-semibold">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
