"use client";

import { ApiError } from "@pg/api-client";
import {
  type BedSummary,
  type BuildingSummary,
  type FloorSummary,
  OccupationType,
  type RoomSummary,
} from "@pg/shared";
import {
  AlertCircle,
  BedDouble,
  Building2,
  ChevronDown,
  ChevronRight,
  DoorOpen,
  Layers,
  Plus,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { api } from "@/lib/api";
import { formatPaise } from "@/lib/utils";

const inputClass =
  "flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:border-brand disabled:cursor-not-allowed disabled:opacity-50";

const toMessage = (err: unknown, fallback: string) =>
  err instanceof ApiError ? err.message : fallback;

const bedTone = (s: BedSummary["status"]) =>
  s === "VACANT" ? "success" : s === "OCCUPIED" ? "neutral" : "warning";

interface Tree {
  buildings: BuildingSummary[];
  floorsByBuilding: Map<string, FloorSummary[]>;
  roomsByFloor: Map<string, RoomSummary[]>;
  bedsByRoom: Map<string, BedSummary[]>;
}

function groupBy<T>(rows: T[], key: (r: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const arr = map.get(k);
    if (arr) arr.push(row);
    else map.set(k, [row]);
  }
  return map;
}

/* The property tree is small per PG, so we load every level unfiltered and group
 * client-side rather than fetch-on-expand. Expansion is purely local state. */
export default function PropertyPage() {
  const [tree, setTree] = useState<Tree | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openBuildings, setOpenBuildings] = useState<Set<string>>(new Set());
  const [openFloors, setOpenFloors] = useState<Set<string>>(new Set());

  // Dialog targets (null = closed).
  const [addBuilding, setAddBuilding] = useState(false);
  const [addFloorFor, setAddFloorFor] = useState<BuildingSummary | null>(null);
  const [addRoomFor, setAddRoomFor] = useState<FloorSummary | null>(null);
  const [addBedFor, setAddBedFor] = useState<RoomSummary | null>(null);
  const [editRentFor, setEditRentFor] = useState<RoomSummary | null>(null);

  const load = useCallback(async (expandAll = false) => {
    const [buildings, floors, rooms, beds] = await Promise.all([
      api.property.buildings(),
      api.property.floors(),
      api.property.rooms(),
      api.property.beds(),
    ]);
    buildings.sort((a, b) => a.name.localeCompare(b.name));
    floors.sort((a, b) => a.floorNumber - b.floorNumber);
    rooms.sort((a, b) => a.label.localeCompare(b.label));
    beds.sort((a, b) => a.label.localeCompare(b.label));
    setTree({
      buildings,
      floorsByBuilding: groupBy(floors, (f) => f.buildingId),
      roomsByFloor: groupBy(rooms, (r) => r.floorId),
      bedsByRoom: groupBy(beds, (b) => b.roomId),
    });
    if (expandAll) {
      setOpenBuildings(new Set(buildings.map((b) => b.id)));
      setOpenFloors(new Set(floors.map((f) => f.id)));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await load(true);
      } catch (err) {
        if (!cancelled) setError(toMessage(err, "Could not load property."));
      }
    })();
    return () => {
      cancelled = true;
    };
    // load is stable; expandAll only on first mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = async () => {
    try {
      await load();
    } catch (err) {
      setError(toMessage(err, "Could not refresh property."));
    }
  };

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setter(next);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Rooms & Beds</h1>
          <p className="text-sm text-muted-foreground">
            Your buildings, floors, rooms, and beds. Room rent feeds monthly
            invoicing.
          </p>
        </div>
        <Button size="sm" onClick={() => setAddBuilding(true)}>
          <Plus className="h-4 w-4" />
          Add building
        </Button>
      </div>

      <ErrorBanner message={error} />

      {tree === null ? (
        <ListSkeleton />
      ) : tree.buildings.length === 0 ? (
        <Card>
          <CardContent className="pt-5">
            <EmptyRow text="No buildings yet. Add your first building to start mapping out rooms and beds." />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {tree.buildings.map((b) => {
            const floors = tree.floorsByBuilding.get(b.id) ?? [];
            const open = openBuildings.has(b.id);
            return (
              <Card key={b.id}>
                <CardContent className="pt-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        toggle(openBuildings, setOpenBuildings, b.id)
                      }
                      className="flex min-w-0 items-center gap-2 text-left"
                    >
                      {open ? (
                        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <Building2 className="h-4 w-4 shrink-0 text-brand" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">
                          {b.name}
                        </p>
                        {b.address && (
                          <p className="truncate text-xs text-muted-foreground">
                            {b.address}
                          </p>
                        )}
                      </div>
                    </button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setAddFloorFor(b)}
                    >
                      <Plus className="h-4 w-4" />
                      Floor
                    </Button>
                  </div>

                  {open && (
                    <div className="mt-4 space-y-3 border-t border-border pt-4">
                      {floors.length === 0 ? (
                        <EmptyRow text="No floors yet." />
                      ) : (
                        floors.map((f) => (
                          <FloorBlock
                            key={f.id}
                            floor={f}
                            rooms={tree.roomsByFloor.get(f.id) ?? []}
                            bedsByRoom={tree.bedsByRoom}
                            open={openFloors.has(f.id)}
                            onToggle={() =>
                              toggle(openFloors, setOpenFloors, f.id)
                            }
                            onAddRoom={() => setAddRoomFor(f)}
                            onAddBed={setAddBedFor}
                            onEditRent={setEditRentFor}
                          />
                        ))
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AddBuildingDialog
        open={addBuilding}
        onClose={() => setAddBuilding(false)}
        onDone={async () => {
          setAddBuilding(false);
          await refresh();
        }}
        onError={setError}
      />
      <AddFloorDialog
        building={addFloorFor}
        onClose={() => setAddFloorFor(null)}
        onDone={async () => {
          setAddFloorFor(null);
          await refresh();
        }}
        onError={setError}
      />
      <AddRoomDialog
        floor={addRoomFor}
        onClose={() => setAddRoomFor(null)}
        onDone={async () => {
          setAddRoomFor(null);
          await refresh();
        }}
        onError={setError}
      />
      <AddBedDialog
        room={addBedFor}
        onClose={() => setAddBedFor(null)}
        onDone={async () => {
          setAddBedFor(null);
          await refresh();
        }}
        onError={setError}
      />
      <EditRentDialog
        room={editRentFor}
        onClose={() => setEditRentFor(null)}
        onDone={async () => {
          setEditRentFor(null);
          await refresh();
        }}
        onError={setError}
      />
    </div>
  );
}

/* ----------------------------------------------------------------- floor --- */

function FloorBlock({
  floor,
  rooms,
  bedsByRoom,
  open,
  onToggle,
  onAddRoom,
  onAddBed,
  onEditRent,
}: {
  floor: FloorSummary;
  rooms: RoomSummary[];
  bedsByRoom: Map<string, BedSummary[]>;
  open: boolean;
  onToggle: () => void;
  onAddRoom: () => void;
  onAddBed: (room: RoomSummary) => void;
  onEditRent: (room: RoomSummary) => void;
}) {
  return (
    <div className="rounded-md border border-border">
      <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 items-center gap-2 text-left"
        >
          {open ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <Layers className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate text-sm font-medium">{floor.label}</span>
          <span className="text-xs text-muted-foreground">
            {rooms.length} room{rooms.length === 1 ? "" : "s"}
          </span>
        </button>
        <Button variant="outline" size="sm" onClick={onAddRoom}>
          <Plus className="h-4 w-4" />
          Room
        </Button>
      </div>

      {open && (
        <div className="space-y-2 border-t border-border p-3">
          {rooms.length === 0 ? (
            <EmptyRow text="No rooms on this floor yet." />
          ) : (
            rooms.map((r) => (
              <RoomBlock
                key={r.id}
                room={r}
                beds={bedsByRoom.get(r.id) ?? []}
                onAddBed={() => onAddBed(r)}
                onEditRent={() => onEditRent(r)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ room --- */

function RoomBlock({
  room,
  beds,
  onAddBed,
  onEditRent,
}: {
  room: RoomSummary;
  beds: BedSummary[];
  onAddBed: () => void;
  onEditRent: () => void;
}) {
  return (
    <div className="rounded-md bg-muted/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <DoorOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{room.label}</p>
            <p className="text-xs text-muted-foreground">
              cap {room.capacity}
              {room.sharingType ? ` · ${room.sharingType}` : ""}
              {room.occupationPreference
                ? ` · ${room.occupationPreference.toLowerCase()}`
                : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onEditRent}
            className="rounded-md px-2 py-1 text-sm font-medium text-brand transition-colors hover:bg-brand/10"
            title="Edit rent"
          >
            {formatPaise(room.monthlyRentPaise)}/mo
          </button>
          <Button variant="outline" size="sm" onClick={onAddBed}>
            <BedDouble className="h-4 w-4" />
            Bed
          </Button>
        </div>
      </div>

      {beds.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {beds.map((bed) => (
            <Badge key={bed.id} tone={bedTone(bed.status)}>
              {bed.label} · {bed.status.toLowerCase()}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- dialogs --- */

function AddBuildingDialog({
  open,
  onClose,
  onDone,
  onError,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => Promise<void> | void;
  onError: (m: string) => void;
}) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setName("");
      setAddress("");
    }
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.property.createBuilding({
        name: name.trim(),
        address: address.trim() || undefined,
      });
      await onDone();
    } catch (err) {
      onError(toMessage(err, "Could not add the building."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add building"
      description="A physical property at your PG. You can run more than one."
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Name" htmlFor="b-name">
          <Input
            id="b-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={1}
            placeholder="e.g. Sunrise Block A"
          />
        </Field>
        <Field label="Address (optional)" htmlFor="b-address">
          <Input
            id="b-address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </Field>
        <DialogActions busy={busy} onClose={onClose} submitLabel="Add building" />
      </form>
    </Dialog>
  );
}

function AddFloorDialog({
  building,
  onClose,
  onDone,
  onError,
}: {
  building: BuildingSummary | null;
  onClose: () => void;
  onDone: () => Promise<void> | void;
  onError: (m: string) => void;
}) {
  const [label, setLabel] = useState("");
  const [floorNumber, setFloorNumber] = useState("0");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (building) {
      setLabel("");
      setFloorNumber("0");
    }
  }, [building]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!building) return;
    setBusy(true);
    try {
      await api.property.createFloor({
        buildingId: building.id,
        label: label.trim(),
        floorNumber: Number(floorNumber),
      });
      await onDone();
    } catch (err) {
      onError(toMessage(err, "Could not add the floor."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={building !== null}
      onClose={onClose}
      title="Add floor"
      description={building ? `In ${building.name}.` : undefined}
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Label" htmlFor="f-label">
            <Input
              id="f-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              required
              minLength={1}
              placeholder="e.g. Ground floor"
            />
          </Field>
          <Field label="Floor number" htmlFor="f-number">
            <Input
              id="f-number"
              type="number"
              min={-5}
              max={200}
              value={floorNumber}
              onChange={(e) => setFloorNumber(e.target.value)}
              required
            />
          </Field>
        </div>
        <DialogActions busy={busy} onClose={onClose} submitLabel="Add floor" />
      </form>
    </Dialog>
  );
}

function AddRoomDialog({
  floor,
  onClose,
  onDone,
  onError,
}: {
  floor: FloorSummary | null;
  onClose: () => void;
  onDone: () => Promise<void> | void;
  onError: (m: string) => void;
}) {
  const [label, setLabel] = useState("");
  const [capacity, setCapacity] = useState("1");
  const [rent, setRent] = useState("");
  const [sharingType, setSharingType] = useState("");
  const [occupationPreference, setOccupationPreference] = useState<
    OccupationType | ""
  >("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (floor) {
      setLabel("");
      setCapacity("1");
      setRent("");
      setSharingType("");
      setOccupationPreference("");
    }
  }, [floor]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!floor) return;
    setBusy(true);
    try {
      await api.property.createRoom({
        floorId: floor.id,
        label: label.trim(),
        capacity: Number(capacity),
        monthlyRentPaise: Math.round(Number(rent) * 100),
        sharingType: sharingType.trim() || undefined,
        occupationPreference: occupationPreference || undefined,
      });
      await onDone();
    } catch (err) {
      onError(toMessage(err, "Could not add the room."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={floor !== null}
      onClose={onClose}
      title="Add room"
      description={floor ? `On ${floor.label}.` : undefined}
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Label" htmlFor="rm-label">
            <Input
              id="rm-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              required
              minLength={1}
              placeholder="e.g. 101"
            />
          </Field>
          <Field label="Monthly rent (₹)" htmlFor="rm-rent">
            <Input
              id="rm-rent"
              type="number"
              min={0}
              step="1"
              value={rent}
              onChange={(e) => setRent(e.target.value)}
              required
              placeholder="e.g. 8000"
            />
          </Field>
          <Field label="Capacity (beds)" htmlFor="rm-cap">
            <Input
              id="rm-cap"
              type="number"
              min={1}
              max={20}
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              required
            />
          </Field>
          <Field label="Sharing type (optional)" htmlFor="rm-sharing">
            <Input
              id="rm-sharing"
              value={sharingType}
              onChange={(e) => setSharingType(e.target.value)}
              placeholder="e.g. 2-sharing"
            />
          </Field>
          <Field label="Occupation preference (optional)" htmlFor="rm-occ">
            <select
              id="rm-occ"
              value={occupationPreference}
              onChange={(e) =>
                setOccupationPreference(e.target.value as OccupationType | "")
              }
              className={inputClass}
            >
              <option value="">No preference</option>
              {Object.values(OccupationType).map((o) => (
                <option key={o} value={o}>
                  {o.charAt(0) + o.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <p className="text-xs text-muted-foreground">
          Rent is billed monthly to whoever occupies a bed in this room. Add beds
          to the room after creating it.
        </p>
        <DialogActions busy={busy} onClose={onClose} submitLabel="Add room" />
      </form>
    </Dialog>
  );
}

function AddBedDialog({
  room,
  onClose,
  onDone,
  onError,
}: {
  room: RoomSummary | null;
  onClose: () => void;
  onDone: () => Promise<void> | void;
  onError: (m: string) => void;
}) {
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (room) setLabel("");
  }, [room]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!room) return;
    setBusy(true);
    try {
      await api.property.createBed({ roomId: room.id, label: label.trim() });
      await onDone();
    } catch (err) {
      onError(toMessage(err, "Could not add the bed."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={room !== null}
      onClose={onClose}
      title="Add bed"
      description={
        room ? `In room ${room.label}. Beds are what residents allocate to.` : undefined
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Label" htmlFor="bd-label">
          <Input
            id="bd-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            required
            minLength={1}
            placeholder="e.g. A"
          />
        </Field>
        <DialogActions busy={busy} onClose={onClose} submitLabel="Add bed" />
      </form>
    </Dialog>
  );
}

function EditRentDialog({
  room,
  onClose,
  onDone,
  onError,
}: {
  room: RoomSummary | null;
  onClose: () => void;
  onDone: () => Promise<void> | void;
  onError: (m: string) => void;
}) {
  const [rent, setRent] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (room) setRent(String(room.monthlyRentPaise / 100));
  }, [room]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!room) return;
    setBusy(true);
    try {
      await api.property.updateRoomRent(room.id, Math.round(Number(rent) * 100));
      await onDone();
    } catch (err) {
      onError(toMessage(err, "Could not update the rent."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={room !== null}
      onClose={onClose}
      title="Edit room rent"
      description={
        room
          ? `Room ${room.label}. Applies to invoices generated from now on.`
          : undefined
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Monthly rent (₹)" htmlFor="er-rent">
          <Input
            id="er-rent"
            type="number"
            min={0}
            step="1"
            value={rent}
            onChange={(e) => setRent(e.target.value)}
            required
          />
        </Field>
        <DialogActions busy={busy} onClose={onClose} submitLabel="Save rent" />
      </form>
    </Dialog>
  );
}

/* ----------------------------------------------------------------- bits --- */

function DialogActions({
  busy,
  onClose,
  submitLabel,
}: {
  busy: boolean;
  onClose: () => void;
  submitLabel: string;
}) {
  return (
    <div className="flex justify-end gap-2">
      <Button type="button" variant="outline" onClick={onClose}>
        Cancel
      </Button>
      <Button type="submit" disabled={busy}>
        {busy ? "Saving…" : submitLabel}
      </Button>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <Card>
      <CardContent className="flex items-center gap-3 pt-5 text-danger">
        <AlertCircle className="h-5 w-5" />
        <span className="text-sm">{message}</span>
      </CardContent>
    </Card>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
      ))}
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <p className="py-6 text-center text-sm text-muted-foreground">{text}</p>
  );
}
