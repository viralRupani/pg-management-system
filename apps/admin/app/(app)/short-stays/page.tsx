"use client";

import type { BookingSummary, ShortStaySummary } from "@pg/shared";
import { Hotel, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { formatDate, formatPaise, toMessage } from "@/lib/utils";

const inputClass =
  "flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:border-brand disabled:cursor-not-allowed disabled:opacity-50";

/** Local zero-padded YYYY-MM-DD (never toISOString — UTC off-by-one in IST). */
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** The calendar day before isoDate (avoids UTC off-by-one). */
function dayBefore(isoDate: string): string {
  const d = new Date(isoDate + "T00:00:00");
  d.setDate(d.getDate() - 1);
  return ymd(d);
}

const statusTone = (s: ShortStaySummary["status"]) =>
  s === "ACTIVE" ? "warning" : s === "COMPLETED" ? "success" : "neutral";

export default function ShortStaysPage() {
  const toast = useToast();
  const [items, setItems] = useState<ShortStaySummary[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [creating, setCreating] = useState(false);
  const [pendingBookings, setPendingBookings] = useState<BookingSummary[]>([]);

  const load = useCallback(async () => {
    try {
      const list = await api.shortStays.list();
      setItems(list.slice().reverse());
      setLoadFailed(false);
    } catch (err) {
      setLoadFailed(true);
      toast.error(toMessage(err, "Could not load short stays."));
    }
  }, [toast]);

  const loadBookings = useCallback(async () => {
    try {
      const all = await api.bookings.list();
      setPendingBookings(all.filter((b) => b.status === "PENDING"));
    } catch (err) {
      toast.error(toMessage(err, "Could not load available beds."));
    }
  }, [toast]);

  useEffect(() => {
    setItems(null);
    void load();
  }, [load]);

  function openCreate() {
    void loadBookings();
    setCreating(true);
  }

  async function doComplete(id: string) {
    try {
      await api.shortStays.complete(id);
      await load();
    } catch (err) {
      toast.error(toMessage(err, "Could not complete short stay."));
    }
  }

  async function doCancel(id: string) {
    try {
      await api.shortStays.cancel(id);
      await load();
    } catch (err) {
      toast.error(toMessage(err, "Could not cancel short stay."));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Short Stays</h1>
          <p className="text-sm text-muted-foreground">
            Temporarily host a guest on a reserved bed while awaiting the booked
            resident. The stay must end before the booking&apos;s move-in date.
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          New short stay
        </Button>
      </div>

      {items === null ? (
        loadFailed ? (
          <p className="text-sm text-muted-foreground">
            Couldn&apos;t load short stays — try refreshing.
          </p>
        ) : (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Card key={i}>
                <CardContent className="space-y-2 pt-5">
                  <span className="block h-4 w-1/3 animate-pulse rounded bg-muted" />
                  <span className="block h-3 w-2/3 animate-pulse rounded bg-muted" />
                </CardContent>
              </Card>
            ))}
          </div>
        )
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
            <Hotel className="h-6 w-6" />
            <p className="text-sm">No short stays yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((s) => (
            <Card key={s.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-5">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold">{s.guestName}</h2>
                    <Badge tone={statusTone(s.status)}>
                      {s.status.charAt(0) + s.status.slice(1).toLowerCase()}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Bed {s.bedLabel} · {formatDate(s.checkInDate)} →{" "}
                    {formatDate(s.checkOutDate)} · {formatPaise(s.feePaise)}
                    {s.guestPhone ? ` · ${s.guestPhone}` : ""}
                  </p>
                </div>
                {s.status === "ACTIVE" && (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void doComplete(s.id)}
                    >
                      Complete
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void doCancel(s.id)}
                    >
                      Cancel
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <CreateShortStayDialog
        open={creating}
        onClose={() => setCreating(false)}
        pendingBookings={pendingBookings}
        onCreated={async () => {
          setCreating(false);
          await load();
        }}
      />
    </div>
  );
}

function CreateShortStayDialog({
  open,
  onClose,
  pendingBookings,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  pendingBookings: BookingSummary[];
  onCreated: () => Promise<void>;
}) {
  const toast = useToast();
  const [bookingId, setBookingId] = useState("");
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [checkInDate, setCheckInDate] = useState("");
  const [checkOutDate, setCheckOutDate] = useState("");
  const [feeRupees, setFeeRupees] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const today = ymd(new Date());

  const selectedBooking = pendingBookings.find((b) => b.id === bookingId);
  const moveInIso = selectedBooking?.moveInDate
    ? ymd(new Date(selectedBooking.moveInDate))
    : null;
  const maxDate = moveInIso ? dayBefore(moveInIso) : undefined;

  useEffect(() => {
    if (!open) {
      setBookingId("");
      setGuestName("");
      setGuestPhone("");
      setCheckInDate("");
      setCheckOutDate("");
      setFeeRupees("");
    }
  }, [open]);

  // Reset dates when a different booking is selected
  useEffect(() => {
    setCheckInDate("");
    setCheckOutDate("");
  }, [bookingId]);

  async function submit() {
    if (!bookingId || !selectedBooking) {
      toast.error("Select a reserved bed.");
      return;
    }
    if (!guestName.trim()) {
      toast.error("Enter the guest name.");
      return;
    }
    if (!checkInDate || !checkOutDate) {
      toast.error("Enter check-in and check-out dates.");
      return;
    }
    setSubmitting(true);
    try {
      await api.shortStays.create({
        bedId: selectedBooking.bedId,
        guestName: guestName.trim(),
        guestPhone: guestPhone.trim() || undefined,
        checkInDate,
        checkOutDate,
        feePaise: Math.round(Number(feeRupees || "0") * 100),
      });
      await onCreated();
    } catch (err) {
      toast.error(toMessage(err, "Could not create short stay."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New short stay"
      description="Host a transient guest on a reserved bed before the booked resident arrives."
    >
      <div className="space-y-4 p-5 pt-2">
        <div className="space-y-1.5">
          <Label htmlFor="ss-booking">Reserved bed</Label>
          <select
            id="ss-booking"
            className={inputClass}
            value={bookingId}
            onChange={(e) => setBookingId(e.target.value)}
          >
            <option value="">Select a reserved bed…</option>
            {pendingBookings.map((b) => (
              <option key={b.id} value={b.id}>
                Bed {b.bedLabel} — booked from{" "}
                {formatDate(b.moveInDate)} ({b.residentName})
              </option>
            ))}
          </select>
          {pendingBookings.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No reserved beds — create a booking first.
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ss-name">Guest name</Label>
          <Input
            id="ss-name"
            placeholder="e.g. Rahul Mehta"
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ss-phone">
            Guest phone{" "}
            <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="ss-phone"
            type="tel"
            placeholder="e.g. 98765 43210"
            value={guestPhone}
            onChange={(e) => setGuestPhone(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="ss-checkin">Check-in date</Label>
            <Input
              id="ss-checkin"
              type="date"
              min={today}
              max={maxDate}
              value={checkInDate}
              onChange={(e) => {
                setCheckInDate(e.target.value);
                if (checkOutDate && e.target.value > checkOutDate)
                  setCheckOutDate("");
              }}
              disabled={!bookingId}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ss-checkout">Check-out date</Label>
            <Input
              id="ss-checkout"
              type="date"
              min={checkInDate || today}
              max={maxDate}
              value={checkOutDate}
              onChange={(e) => setCheckOutDate(e.target.value)}
              disabled={!checkInDate}
            />
          </div>
        </div>
        {maxDate && (
          <p className="text-xs text-muted-foreground">
            Must check out by {formatDate(maxDate)} (day before move-in).
          </p>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="ss-fee">Fee (₹)</Label>
          <Input
            id="ss-fee"
            type="number"
            min={0}
            step="1"
            placeholder="e.g. 500"
            value={feeRupees}
            onChange={(e) => setFeeRupees(e.target.value)}
          />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={submitting}>
            {submitting ? "Creating…" : "Create stay"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
