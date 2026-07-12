"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Row, Ricon } from "@/components/ui/row";
import { Screen } from "@/components/ui/screen";
import { SectionHeader } from "@/components/ui/section-header";
import { Segmented } from "@/components/ui/segmented";
import { Sheet } from "@/components/ui/sheet";
import { AppText } from "@/components/ui/text";
import { useAuth } from "@/lib/auth";
import { useInvoices } from "@/lib/queries";
import { useTheme, type SchemePreference } from "@/lib/theme";

const LINKS = [
  { icon: "document-text-outline", label: "My documents", href: "/documents" },
  { icon: "shield-checkmark-outline", label: "Security deposit", href: "/deposit" },
  { icon: "restaurant-outline", label: "Mess menu", href: "/menu" },
  { icon: "notifications-outline", label: "Notifications", href: "/notifications" },
] as const;

const SCHEME_LABEL: Record<SchemePreference, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

export default function MorePage() {
  const router = useRouter();
  const { signOut } = useAuth();
  const { schemePreference, setSchemePreference } = useTheme();
  const invoices = useInvoices();
  const name = invoices.data?.[0]?.residentName ?? "Resident";
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);

  return (
    <Screen contentClassName="gap-4">
      <AppText variant="title" weight="heavy" className="text-[25px]">
        More
      </AppText>

      <Card className="flex-row items-center gap-3">
        <Avatar name={name} size={52} />
        <div className="min-w-0 flex-1">
          <AppText variant="heading" className="text-[16px]">
            {name}
          </AppText>
          <AppText variant="sub">Resident</AppText>
        </div>
      </Card>

      <SectionHeader title="My PG" />
      <Card padded={false} className="-mt-2 px-4">
        {LINKS.map((l, i) => (
          <Row
            key={l.href}
            first={i === 0}
            leading={<Ricon name={l.icon} />}
            title={l.label}
            onPress={() => router.push(l.href)}
          />
        ))}
      </Card>

      <SectionHeader title="Preferences" />
      <Card padded={false} className="-mt-2 px-4">
        <Row
          first
          leading={<Ricon name="contrast-outline" tone="neutral" />}
          title="Appearance"
          trailing={
            <AppText variant="sub">{SCHEME_LABEL[schemePreference]}</AppText>
          }
          onPress={() => setAppearanceOpen(true)}
        />
      </Card>

      <Button title="Log out" variant="danger" onClick={() => setLogoutOpen(true)} />

      <Sheet
        visible={appearanceOpen}
        onClose={() => setAppearanceOpen(false)}
        title="Appearance"
        subtitle="System follows your device's light/dark setting."
      >
        <Segmented<SchemePreference>
          options={[
            { label: "System", value: "system" },
            { label: "Light", value: "light" },
            { label: "Dark", value: "dark" },
          ]}
          value={schemePreference}
          onChange={setSchemePreference}
        />
        <Button title="Done" variant="ghost" onClick={() => setAppearanceOpen(false)} />
      </Sheet>

      <Sheet
        visible={logoutOpen}
        onClose={() => setLogoutOpen(false)}
        title="Log out?"
        subtitle="You will need to sign in again with an OTP."
      >
        <Button title="Log out" variant="danger" onClick={signOut} />
        <Button title="Cancel" variant="ghost" onClick={() => setLogoutOpen(false)} />
      </Sheet>
    </Screen>
  );
}
