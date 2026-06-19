"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Ricon, Row } from "@/components/ui/row";
import { Screen } from "@/components/ui/screen";
import { Sheet } from "@/components/ui/sheet";
import { useAuth } from "@/lib/auth";
import { useInvoices } from "@/lib/queries";

const LINKS = [
  { icon: "document-text-outline", label: "My documents", href: "/documents" },
  { icon: "shield-checkmark-outline", label: "Security deposit", href: "/deposit" },
  { icon: "restaurant-outline", label: "Mess menu", href: "/menu" },
  { icon: "notifications-outline", label: "Notifications", href: "/notifications" },
] as const;

export default function MorePage() {
  const router = useRouter();
  const { signOut } = useAuth();
  const invoices = useInvoices();
  const name = invoices.data?.[0]?.residentName ?? "Resident";
  const [confirm, setConfirm] = useState(false);

  return (
    <Screen contentClassName="flex flex-col gap-4">
      <h1 className="text-[25px] font-extrabold text-ink">Profile</h1>

      <Card className="flex flex-row items-center gap-3">
        <Avatar name={name} size={52} />
        <div className="flex-1">
          <p className="text-[16px] font-bold text-ink">{name}</p>
          <p className="text-[13px] text-ink2">Resident</p>
        </div>
      </Card>

      <Card padded={false} className="px-4">
        {LINKS.map((l, i) => (
          <Row
            key={l.href}
            first={i === 0}
            leading={<Ricon name={l.icon} />}
            title={l.label}
            trailing={<Icon name="chevron-forward" size={18} color="#c7ccd4" />}
            onClick={() => router.push(l.href)}
          />
        ))}
      </Card>

      <Button title="Log out" variant="danger" onClick={() => setConfirm(true)} />

      <Sheet
        visible={confirm}
        onClose={() => setConfirm(false)}
        title="Log out?"
        subtitle="You will need to sign in again with an OTP."
      >
        <Button title="Log out" variant="danger" onClick={signOut} />
        <Button title="Cancel" variant="ghost" onClick={() => setConfirm(false)} />
      </Sheet>
    </Screen>
  );
}
