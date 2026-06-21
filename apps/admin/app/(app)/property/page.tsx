"use client";

import {
  type BedSummary,
  type BuildingSummary,
  type FloorSummary,
  OccupationType,
  type RoomSummary,
  sharingLabel,
} from "@pg/shared";
import {
  BedDouble,
  Building2,
  ChevronDown,
  ChevronRight,
  DoorOpen,
  Layers,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { cn, formatPaise, toMessage } from "@/lib/utils";

const inputClass =
  "flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:border-brand disabled:cursor-not-allowed disabled:opacity-50";

const bedTone = (s: BedSummary["status"]) =>
  s === "VACANT" ? "success" : s === "OCCUPIED" ? "neutral" : "warning";

interface Tree {
  buildings: BuildingSummary[];
  floorsByBuilding: Map<string, FloorSummary[]>;
  roomsByFloor: Map<string, RoomSummary[]>;
  bedsByRoom: Map<string, BedSummary[]>;
}

/** Rename works the same way at every level (pure relabel) — one dialog drives
 * all four, keyed by `kind`. `label` seeds the input with the current name. */
type RenameTarget =
  | { kind: "building"; id: string; label: string }
  | { kind: "floor"; id: string; label: string }
  | { kind: "room"; id: string; label: string }
  | { kind: "bed"; id: string; label: string };

const renameCopy: Record<RenameTarget["kind"], { title: string; field: string }> = {
  building: { title: "Rename building", field: "Building name" },
  floor: { title: "Rename floor", field: "Floor label" },
  room: { title: "Rename room", field: "Room label" },
  bed: { title: "Rename bed", field: "Bed label" },
};

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

/** Resolve a bed's building + floor ids from the loaded tree, so a deep-link can
 * expand the right ancestors. Returns null if the bed isn't in the tree. */
function findBedAncestors(
  tree: Tree,
  bedId: string,
): { buildingId: string; floorId: string } | null {
  let roomId: string | null = null;
  for (const [rid, beds] of tree.bedsByRoom) {
    if (beds.some((b) => b.id === bedId)) {
      roomId = rid;
      break;
    }
  }
  if (!roomId) return null;
  let floorId: string | null = null;
  for (const [fid, rooms] of tree.roomsByFloor) {
    if (rooms.some((r) => r.id === roomId)) {
      floorId = fid;
      break;
    }
  }
  if (!floorId) return null;
  for (const [bid, floors] of tree.floorsByBuilding) {
    if (floors.some((f) => f.id === floorId)) {
      return { buildingId: bid, floorId };
    }
  }
  return null;
}

/** Page must be wrapped in <Suspense> because PropertyTree reads useSearchParams
 * (the `?bed=` deep-link) — required for the static export to build. */
export default function PropertyPage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <PropertyTree />
    </Suspense>
  );
}

/* The property tree is small per PG, so we load every level unfiltered and group
 * client-side rather than fetch-on-expand. Expansion is purely local state. */
function PropertyTree() {
  const toast = useToast();
  // Deep-link target: /property?bed=<id> jumps to & highlights a specific bed.
  const targetBed = useSearchParams().get("bed");
  const [tree, setTree] = useState<Tree | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [openBuildings, setOpenBuildings] = useState<Set<string>>(new Set());
  const [openFloors, setOpenFloors] = useState<Set<string>>(new Set());
  const [highlightedBed, setHighlightedBed] = useState<string | null>(null);

  // Dialog targets (null = closed).
  const [addBuilding, setAddBuilding] = useState(false);
  const [addFloorFor, setAddFloorFor] = useState<BuildingSummary | null>(null);
  const [addRoomFor, setAddRoomFor] = useState<FloorSummary | null>(null);
  const [addBedFor, setAddBedFor] = useState<RoomSummary | null>(null);
  const [editRentFor, setEditRentFor] = useState<RoomSummary | null>(null);
  const [renameTarget, setRenameTarget] = useState<RenameTarget | null>(null);
  const [deleteBuildingTarget, setDeleteBuildingTarget] =
    useState<BuildingSummary | null>(null);
  const [deleteRoomTarget, setDeleteRoomTarget] =
    useState<RoomSummary | null>(null);
  const [deleteBedTarget, setDeleteBedTarget] =
    useState<BedSummary | null>(null);

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
        if (!cancelled) {
          setLoadFailed(true);
          toast.error(toMessage(err, "Could not load property."));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // load is stable; expandAll only on first mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Deep-link: once the tree is loaded, expand the target bed's building + floor,
  // then (after that paints) scroll it into view and flash a highlight ring.
  useEffect(() => {
    if (!tree || !targetBed) return;
    const anc = findBedAncestors(tree, targetBed);
    if (anc) {
      setOpenBuildings((prev) =>
        prev.has(anc.buildingId) ? prev : new Set(prev).add(anc.buildingId),
      );
      setOpenFloors((prev) =>
        prev.has(anc.floorId) ? prev : new Set(prev).add(anc.floorId),
      );
    }
    const raf = requestAnimationFrame(() => {
      document
        .getElementById(`bed-${targetBed}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightedBed(targetBed);
    });
    const clear = setTimeout(() => setHighlightedBed(null), 2500);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(clear);
    };
  }, [tree, targetBed]);

  const refresh = async () => {
    try {
      await load();
    } catch (err) {
      toast.error(toMessage(err, "Could not refresh property."));
    }
  };

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setter(next);
  };

  return (
    <div className="space-y-6">
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

      {tree === null ? (
        loadFailed ? (
          <Card>
            <CardContent className="pt-5">
              <EmptyRow text="Couldn't load property — try refreshing." />
            </CardContent>
          </Card>
        ) : (
          <ListSkeleton />
        )
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
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setAddFloorFor(b)}
                      >
                        <Plus className="h-4 w-4" />
                        Floor
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          setRenameTarget({
                            kind: "building",
                            id: b.id,
                            label: b.name,
                          })
                        }
                        title="Rename building"
                        className="text-muted-foreground hover:text-brand"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteBuildingTarget(b)}
                        title="Delete building"
                        className="text-muted-foreground hover:text-danger"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
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
                            highlightedBed={highlightedBed}
                            open={openFloors.has(f.id)}
                            onToggle={() =>
                              toggle(openFloors, setOpenFloors, f.id)
                            }
                            onAddRoom={() => setAddRoomFor(f)}
                            onAddBed={setAddBedFor}
                            onEditRent={setEditRentFor}
                            onDeleteRoom={setDeleteRoomTarget}
                            onDeleteBed={setDeleteBedTarget}
                            onRename={setRenameTarget}
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
      />
      <AddFloorDialog
        building={addFloorFor}
        onClose={() => setAddFloorFor(null)}
        onDone={async () => {
          setAddFloorFor(null);
          await refresh();
        }}
      />
      <AddRoomDialog
        floor={addRoomFor}
        onClose={() => setAddRoomFor(null)}
        onDone={async () => {
          setAddRoomFor(null);
          await refresh();
        }}
      />
      <AddBedDialog
        room={addBedFor}
        onClose={() => setAddBedFor(null)}
        onDone={async () => {
          setAddBedFor(null);
          await refresh();
        }}
      />
      <EditRentDialog
        room={editRentFor}
        onClose={() => setEditRentFor(null)}
        onDone={async () => {
          setEditRentFor(null);
          await refresh();
        }}
      />
      <RenameDialog
        target={renameTarget}
        onClose={() => setRenameTarget(null)}
        onDone={async () => {
          setRenameTarget(null);
          await refresh();
        }}
      />
      <ConfirmDeleteDialog
        open={deleteBuildingTarget !== null}
        title={`Delete "${deleteBuildingTarget?.name}"?`}
        description="All floors, rooms, and vacant beds in this building will be permanently deleted. Buildings with occupied or reserved beds cannot be deleted."
        onClose={() => setDeleteBuildingTarget(null)}
        onConfirm={async () => {
          await api.property.deleteBuilding(deleteBuildingTarget!.id);
          setDeleteBuildingTarget(null);
          await refresh();
        }}
      />
      <ConfirmDeleteDialog
        open={deleteRoomTarget !== null}
        title={`Delete room "${deleteRoomTarget?.label}"?`}
        description="All vacant beds in this room will also be deleted. Rooms with occupied or reserved beds cannot be deleted."
        onClose={() => setDeleteRoomTarget(null)}
        onConfirm={async () => {
          await api.property.deleteRoom(deleteRoomTarget!.id);
          setDeleteRoomTarget(null);
          await refresh();
        }}
      />
      <ConfirmDeleteDialog
        open={deleteBedTarget !== null}
        title={`Delete bed "${deleteBedTarget?.label}"?`}
        description="This vacant bed will be permanently deleted."
        onClose={() => setDeleteBedTarget(null)}
        onConfirm={async () => {
          await api.property.deleteBed(deleteBedTarget!.id);
          setDeleteBedTarget(null);
          await refresh();
        }}
      />
    </div>
  );
}

/* ----------------------------------------------------------------- floor --- */

function FloorBlock({
  floor,
  rooms,
  bedsByRoom,
  highlightedBed,
  open,
  onToggle,
  onAddRoom,
  onAddBed,
  onEditRent,
  onDeleteRoom,
  onDeleteBed,
  onRename,
}: {
  floor: FloorSummary;
  rooms: RoomSummary[];
  bedsByRoom: Map<string, BedSummary[]>;
  highlightedBed: string | null;
  open: boolean;
  onToggle: () => void;
  onAddRoom: () => void;
  onAddBed: (room: RoomSummary) => void;
  onEditRent: (room: RoomSummary) => void;
  onDeleteRoom: (room: RoomSummary) => void;
  onDeleteBed: (bed: BedSummary) => void;
  onRename: (target: RenameTarget) => void;
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
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onAddRoom}>
            <Plus className="h-4 w-4" />
            Room
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() =>
              onRename({ kind: "floor", id: floor.id, label: floor.label })
            }
            title="Rename floor"
            className="text-muted-foreground hover:text-brand"
          >
            <Pencil className="h-4 w-4" />
          </Button>
        </div>
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
                highlightedBed={highlightedBed}
                onAddBed={() => onAddBed(r)}
                onEditRent={() => onEditRent(r)}
                onDeleteRoom={() => onDeleteRoom(r)}
                onDeleteBed={onDeleteBed}
                onRename={onRename}
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
  highlightedBed,
  onAddBed,
  onEditRent,
  onDeleteRoom,
  onDeleteBed,
  onRename,
}: {
  room: RoomSummary;
  beds: BedSummary[];
  highlightedBed: string | null;
  onAddBed: () => void;
  onEditRent: () => void;
  onDeleteRoom: () => void;
  onDeleteBed: (bed: BedSummary) => void;
  onRename: (target: RenameTarget) => void;
}) {
  return (
    <div className="rounded-md bg-muted/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <DoorOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{room.label}</p>
            <p className="text-xs text-muted-foreground">
              cap {room.capacity} · {sharingLabel(room.capacity)}
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
          <Button
            variant="ghost"
            size="icon"
            onClick={() =>
              onRename({ kind: "room", id: room.id, label: room.label })
            }
            title="Rename room"
            className="text-muted-foreground hover:text-brand"
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onDeleteRoom}
            disabled={beds.some((b) => b.status !== "VACANT")}
            title={
              beds.some((b) => b.status !== "VACANT")
                ? "Cannot delete: room has occupied or reserved beds"
                : "Delete room"
            }
            className="text-muted-foreground hover:text-danger disabled:opacity-30"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {beds.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {beds.map((bed) => {
            const highlight =
              highlightedBed === bed.id && "ring-2 ring-brand ring-offset-1";
            return bed.status === "VACANT" ? (
              <Badge
                key={bed.id}
                id={`bed-${bed.id}`}
                tone="success"
                className={cn("gap-1 pr-1", highlight)}
              >
                {bed.label} · vacant
                <button
                  type="button"
                  onClick={() =>
                    onRename({ kind: "bed", id: bed.id, label: bed.label })
                  }
                  className="ml-0.5 rounded-full p-0.5 hover:bg-success/30"
                  title="Rename bed"
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteBed(bed)}
                  className="rounded-full p-0.5 hover:bg-success/30"
                  title="Delete bed"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ) : (
              <Badge
                key={bed.id}
                id={`bed-${bed.id}`}
                tone={bedTone(bed.status)}
                className={cn("gap-1 pr-1", highlight)}
              >
                {bed.occupantResidentId ? (
                  // Occupant name shows on hover (title); clicking jumps to them.
                  <Link
                    href={`/residents?id=${bed.occupantResidentId}`}
                    title={bed.occupantName ?? undefined}
                    className="hover:underline"
                  >
                    {bed.label} · {bed.status.toLowerCase()}
                  </Link>
                ) : (
                  <span>
                    {bed.label} · {bed.status.toLowerCase()}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() =>
                    onRename({ kind: "bed", id: bed.id, label: bed.label })
                  }
                  className="ml-0.5 rounded-full p-0.5 hover:bg-black/10"
                  title="Rename bed"
                >
                  <Pencil className="h-3 w-3" />
                </button>
              </Badge>
            );
          })}
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
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => Promise<void> | void;
}) {
  const toast = useToast();
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
      toast.error(toMessage(err, "Could not add the building."));
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
}: {
  building: BuildingSummary | null;
  onClose: () => void;
  onDone: () => Promise<void> | void;
}) {
  const toast = useToast();
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
      toast.error(toMessage(err, "Could not add the floor."));
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
}: {
  floor: FloorSummary | null;
  onClose: () => void;
  onDone: () => Promise<void> | void;
}) {
  const toast = useToast();
  const [label, setLabel] = useState("");
  const [capacity, setCapacity] = useState("1");
  const [rent, setRent] = useState("");
  const [occupationPreference, setOccupationPreference] = useState<
    OccupationType | ""
  >("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (floor) {
      setLabel("");
      setCapacity("1");
      setRent("");
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
        occupationPreference: occupationPreference || undefined,
      });
      await onDone();
    } catch (err) {
      toast.error(toMessage(err, "Could not add the room."));
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
}: {
  room: RoomSummary | null;
  onClose: () => void;
  onDone: () => Promise<void> | void;
}) {
  const toast = useToast();
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
      toast.error(toMessage(err, "Could not add the bed."));
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
}: {
  room: RoomSummary | null;
  onClose: () => void;
  onDone: () => Promise<void> | void;
}) {
  const toast = useToast();
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
      toast.error(toMessage(err, "Could not update the rent."));
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

function RenameDialog({
  target,
  onClose,
  onDone,
}: {
  target: RenameTarget | null;
  onClose: () => void;
  onDone: () => Promise<void> | void;
}) {
  const toast = useToast();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (target) setValue(target.label);
  }, [target]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!target) return;
    const next = value.trim();
    setBusy(true);
    try {
      switch (target.kind) {
        case "building":
          await api.property.renameBuilding(target.id, next);
          break;
        case "floor":
          await api.property.renameFloor(target.id, next);
          break;
        case "room":
          await api.property.renameRoom(target.id, next);
          break;
        case "bed":
          await api.property.renameBed(target.id, next);
          break;
      }
      await onDone();
    } catch (err) {
      toast.error(toMessage(err, "Could not rename."));
    } finally {
      setBusy(false);
    }
  };

  const copy = target ? renameCopy[target.kind] : null;

  return (
    <Dialog open={target !== null} onClose={onClose} title={copy?.title ?? "Rename"}>
      <form onSubmit={submit} className="space-y-4">
        <Field label={copy?.field ?? "Name"} htmlFor="rn-value">
          <Input
            id="rn-value"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            required
            minLength={1}
            autoFocus
          />
        </Field>
        <DialogActions busy={busy} onClose={onClose} submitLabel="Save" />
      </form>
    </Dialog>
  );
}

/* --------------------------------------------------------- confirm delete --- */

function ConfirmDeleteDialog({
  open,
  title,
  description,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
    } catch (err) {
      toast.error(toMessage(err, "Delete failed."));
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title={title} description={description}>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button type="button" variant="danger" disabled={busy} onClick={confirm}>
          {busy ? "Deleting…" : "Delete"}
        </Button>
      </div>
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
