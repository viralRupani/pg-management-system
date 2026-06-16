"use client";

import type {
  BedSummary,
  BookingSummary,
  ResidentSummary,
  RoomSummary,
} from "@pg/shared";
import { CalendarClock, Plus } from "lucide-react";
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

/** Local zero-padded YYYY-MM-DD (never toISOString — UTC is off-by-one in IST). */
function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Page through every ACTIVE resident (API caps limit at 100 per page). */
async function fetchAllActiveResidents(): Promise<ResidentSummary[]> {
  const limit = 100;
  const all: ResidentSummary[] = [];
  for (let page = 1; ; page++) {
    const res = await api.residents.list({ status: "ACTIVE", limit, page });
    all.push(...res.items);
    if (all.length >= res.total || res.items.length === 0) break;
  }
  return all;
}

const statusTone = (s: BookingSummary["status"]) =>
  s === "PENDING" ? "warning" : s === "ACTIVATED" ? "success" : "neutral";

export default function BookingsPage() {
  const toast = useToast();
  const [items, setItems] = useState<BookingSummary[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [creating, setCreating] = useState(false);
  const [residents, setResidents] = useState<ResidentSummary[]>([]);
  const [beds, setBeds] = useState<BedSummary[]>([]);
  const [rooms, setRooms] = useState<RoomSummary[]>([]);

  const load = useCallback(async () => {
    try {
      const list = await api.bookings.list();
      setItems(list);
      setLoadFailed(false);
    } catch (err) {
      setLoadFailed(true);
      toast.error(toMessage(err, "Could not load bookings."));
    }
  }, [toast]);

  // Pickers: residents not currently housed + non-reserved beds.
  const loadOptions = useCallback(async () => {
    try {
      const [allResidents, bedList, roomList] = await Promise.all([
        fetchAllActiveResidents(),
        api.property.beds(),
        api.property.rooms(),
      ]);
      setResidents(allResidents.filter((r) => !r.bedLabel));
      setBeds(bedList);
      setRooms(roomList);
    } catch (err) {
      toast.error(toMessage(err, "Could not load booking options."));
    }
  }, [toast]);

  useEffect(() => {
    setItems(null);
    void load();
  }, [load]);

  function openCreate() {
    void loadOptions();
    setCreating(true);
  }

  async function cancel(id: string) {
    try {
      await api.bookings.cancel(id);
      await load();
    } catch (err) {
      toast.error(toMessage(err, "Could not cancel booking."));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Bookings</h1>
          <p className="text-sm text-muted-foreground">
            Hold a bed and collect the deposit for a resident joining later. The
            bed shows as occupied until they move in; rent starts only then.
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          New booking
        </Button>
      </div>

      {items === null ? (
        loadFailed ? (
          <p className="text-sm text-muted-foreground">
            Couldn&apos;t load bookings — try refreshing.
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
            <CalendarClock className="h-6 w-6" />
            <p className="text-sm">No bookings yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((b) => (
            <Card key={b.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-5">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold">{b.residentName}</h2>
                    <Badge tone={statusTone(b.status)}>
                      {b.status.charAt(0) + b.status.slice(1).toLowerCase()}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Bed {b.bedLabel} · moves in {formatDate(b.moveInDate)} ·
                    deposit {formatPaise(b.depositAmountPaise)}
                  </p>
                </div>
                {b.status === "PENDING" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void cancel(b.id)}
                  >
                    Cancel
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <CreateBookingDialog
        open={creating}
        onClose={() => setCreating(false)}
        residents={residents}
        beds={beds}
        rooms={rooms}
        onCreated={async () => {
          setCreating(false);
          await load();
        }}
      />
    </div>
  );
}

function CreateBookingDialog({
  open,
  onClose,
  residents,
  beds,
  rooms,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  residents: ResidentSummary[];
  beds: BedSummary[];
  rooms: RoomSummary[];
  onCreated: () => Promise<void>;
}) {
  const toast = useToast();
  const [residentId, setResidentId] = useState("");
  const [bedId, setBedId] = useState("");
  const [moveInDate, setMoveInDate] = useState("");
  const [depositRupees, setDepositRupees] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const today = ymd(new Date());
  const roomLabel = (roomId: string) =>
    rooms.find((r) => r.id === roomId)?.label ?? "—";
  // A held bed (RESERVED) is already booked; offer vacant + occupied beds only.
  const bookableBeds = beds.filter((b) => b.status !== "RESERVED");

  useEffect(() => {
    if (!open) {
      setResidentId("");
      setBedId("");
      setMoveInDate("");
      setDepositRupees("");
    }
  }, [open]);

  async function submit() {
    if (!residentId || !bedId || !moveInDate) {
      toast.error("Pick a resident, a bed, and a move-in date.");
      return;
    }
    setSubmitting(true);
    try {
      await api.bookings.create({
        residentId,
        bedId,
        moveInDate,
        depositAmountPaise: Math.round(Number(depositRupees || "0") * 100),
      });
      await onCreated();
    } catch (err) {
      toast.error(toMessage(err, "Could not create booking."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New booking"
      description="Hold a bed for an incoming resident and record their deposit."
    >
      <div className="space-y-4 p-5 pt-2">
        <div className="space-y-1.5">
          <Label htmlFor="bk-resident">Resident</Label>
          <select
            id="bk-resident"
            className={inputClass}
            value={residentId}
            onChange={(e) => setResidentId(e.target.value)}
          >
            <option value="">Select a resident…</option>
            {residents.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} · {r.phone}
              </option>
            ))}
          </select>
          {residents.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No un-housed residents — add one on the Residents page first.
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="bk-bed">Bed</Label>
          <select
            id="bk-bed"
            className={inputClass}
            value={bedId}
            onChange={(e) => setBedId(e.target.value)}
          >
            <option value="">Select a bed…</option>
            {bookableBeds.map((b) => (
              <option key={b.id} value={b.id}>
                Room {roomLabel(b.roomId)} · Bed {b.label}
                {b.status === "OCCUPIED" ? " (occupied — leaving soon)" : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="bk-date">Move-in date</Label>
          <Input
            id="bk-date"
            type="date"
            min={today}
            value={moveInDate}
            onChange={(e) => setMoveInDate(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="bk-deposit">Deposit (₹)</Label>
          <Input
            id="bk-deposit"
            type="number"
            min={0}
            step="1"
            placeholder="e.g. 15000"
            value={depositRupees}
            onChange={(e) => setDepositRupees(e.target.value)}
          />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={submitting}>
            {submitting ? "Booking…" : "Book bed"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
