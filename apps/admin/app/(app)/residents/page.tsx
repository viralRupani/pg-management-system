"use client";

import {
  type AvailableBed,
  type BookingSummary,
  ChargeFrequency,
  type EligibleBed,
  type ExitingBed,
  type DepositSummary,
  type DepositTransactionSummary,
  type ExitRequestSummary,
  type DocumentSummary,
  EmergencyRelation,
  type ExtraChargeSummary,
  type InvoiceSummary,
  KycStatus,
  OccupationType,
  type ReferralSummary,
  type ResidentSummary,
  ResidentStatus,
  type ShortStaySummary,
  type TransferRequestSummary,
  sharingLabel,
} from "@pg/shared";
import {
  ArrowLeft,
  ArrowRightLeft,
  BedDouble,
  ExternalLink,
  Eye,
  MessageSquare,
  Plus,
  Receipt,
  UserPlus,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Label } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { ListSkeleton, Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { ResidentCombobox } from "@/components/resident-combobox";
import { api } from "@/lib/api";
import { cn, formatDate, formatPaise, toMessage } from "@/lib/utils";

const residentTone = (s: ResidentSummary["status"]) =>
  s === "ACTIVE" ? "success" : s === "UPCOMING" ? "warning" : "neutral";
const docTone = (s: DocumentSummary["status"]) =>
  s === "VERIFIED" ? "success" : s === "REJECTED" ? "danger" : "warning";

const kycTone = (s: KycStatus) =>
  s === "VERIFIED"
    ? "success"
    : s === "REJECTED"
      ? "danger"
      : s === "PENDING"
        ? "warning"
        : "neutral";
const kycLabel = (s: KycStatus) =>
  s === "VERIFIED"
    ? "KYC verified"
    : s === "REJECTED"
      ? "KYC rejected"
      : s === "PENDING"
        ? "KYC pending"
        : "KYC not started";

/** Full location path for a resident's bed, e.g. "Block A · Ground · 101 · Bed A
 * · 6-sharing". Skips any segment the backend didn't supply. */
function bedLocationPath(r: {
  buildingName?: string | null;
  floorLabel?: string | null;
  roomLabel?: string | null;
  bedLabel: string | null;
  roomCapacity?: number | null;
}): string {
  const parts: string[] = [];
  if (r.buildingName) parts.push(r.buildingName);
  if (r.floorLabel) parts.push(r.floorLabel);
  if (r.roomLabel) parts.push(r.roomLabel);
  if (r.bedLabel) parts.push(`Bed ${r.bedLabel}`);
  if (r.roomCapacity != null) parts.push(sharingLabel(r.roomCapacity));
  return parts.join(" · ");
}

export default function ResidentsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-40" />}>
      <ResidentsRouter />
    </Suspense>
  );
}

function ResidentsRouter() {
  const id = useSearchParams().get("id");
  return id ? <ResidentDetail id={id} /> : <ResidentsList />;
}

/* ------------------------------------------------------------------ list --- */

const PAGE_SIZE = 10;
// "CURRENT" = active + upcoming (the PG's current roster); the default view.
type StatusFilter = ResidentStatus | "ALL" | "CURRENT";
type KycFilter = "ALL" | "PENDING" | "VERIFIED";

function ResidentsList() {
  const toast = useToast();
  // Filters can be deep-linked from the dashboard alerts bell (?kyc=,
  // ?exitRequested=1), so seed initial state from the URL.
  const params = useSearchParams();
  const initialKyc = params.get("kyc");
  const [items, setItems] = useState<ResidentSummary[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loadFailed, setLoadFailed] = useState(false);
  const [registering, setRegistering] = useState(false);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("CURRENT");
  const [kyc, setKyc] = useState<KycFilter>(
    initialKyc === "PENDING" || initialKyc === "VERIFIED" ? initialKyc : "ALL",
  );
  const [exitRequested, setExitRequested] = useState(
    params.get("exitRequested") === "1",
  );
  const [page, setPage] = useState(1);

  // Debounce free-text search so we don't hit the API on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 600);
    return () => clearTimeout(t);
  }, [searchInput]);

  // A new search or filter invalidates the current page.
  useEffect(() => {
    setPage(1);
  }, [search, status, kyc, exitRequested]);

  const load = useCallback(async () => {
    try {
      const result = await api.residents.list({
        q: search || undefined,
        status,
        kyc,
        exitRequested: exitRequested || undefined,
        page,
        limit: PAGE_SIZE,
      });
      setItems(result.items);
      setTotal(result.total);
      setLoadFailed(false);
    } catch (err) {
      setLoadFailed(true);
      toast.error(toMessage(err, "Could not load residents."));
    }
  }, [search, status, kyc, exitRequested, page, toast]);

  useEffect(() => {
    setItems(null);
    void load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);
  const filtered =
    search !== "" ||
    status !== ResidentStatus.ACTIVE ||
    kyc !== "ALL" ||
    exitRequested;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Residents"
        description="Everyone on record at your PG."
        actions={
          <Button size="sm" onClick={() => setRegistering(true)}>
            <UserPlus className="h-4 w-4" />
            Register resident
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search by name or phone…"
          className="max-w-xs"
          aria-label="Search residents"
        />
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusFilter)}
          className="w-40"
          aria-label="Filter by status"
        >
          <option value="CURRENT">Active</option>
          <option value={ResidentStatus.UPCOMING}>Upcoming</option>
          <option value={ResidentStatus.EXITED}>Exited</option>
          <option value="ALL">All</option>
        </Select>
        <Select
          value={kyc}
          onChange={(e) => setKyc(e.target.value as KycFilter)}
          className="w-44"
          aria-label="Filter by KYC status"
        >
          <option value="ALL">All KYC</option>
          <option value="PENDING">KYC pending</option>
          <option value="VERIFIED">KYC verified</option>
        </Select>
        <label
          className={cn(
            "flex h-10 cursor-pointer select-none items-center gap-2 rounded-md border px-3 text-sm",
            exitRequested
              ? "border-amber-300 bg-amber-50 text-amber-800"
              : "border-input bg-card",
          )}
        >
          <input
            type="checkbox"
            checked={exitRequested}
            onChange={(e) => setExitRequested(e.target.checked)}
            className="h-4 w-4 accent-amber-500"
          />
          Exit requested
        </label>
      </div>

      <Card>
        <CardContent className="pt-5">
          {items === null ? (
            loadFailed ? (
              <EmptyRow text="Couldn't load residents — try refreshing." />
            ) : (
              <ListSkeleton />
            )
          ) : items.length === 0 ? (
            <EmptyRow
              text={
                filtered
                  ? "No residents match your search."
                  : "No residents yet. Register your first one."
              }
            />
          ) : (
            <ul className="divide-y divide-border">
              {items.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/residents?id=${r.id}`}
                    className="-mx-2 flex flex-wrap items-center justify-between gap-3 rounded-md px-2 py-3 transition-colors hover:bg-muted"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{r.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.phone} · {r.occupationType.toLowerCase()}
                        {r.nativePlace ? ` · ${r.nativePlace}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-muted-foreground">
                        {r.bedLabel
                          ? `${r.bedLabel}${r.roomCapacity != null ? ` · ${sharingLabel(r.roomCapacity)}` : ""}`
                          : r.status === "UPCOMING" && r.bookedBedLabel
                            ? `${r.bookedBedLabel}${r.moveInDate ? ` · moves in ${formatDate(r.moveInDate)}` : ""}`
                            : r.isShortStay && r.shortStayCheckOutDate
                              ? `until ${formatDate(r.shortStayCheckOutDate)}`
                              : "No bed"}
                      </span>
                      {r.isShortStay && <Badge tone="brand">Short stay</Badge>}
                      {r.exitRequestedDate && (
                        <Badge tone="warning">Exit requested</Badge>
                      )}
                      <Badge tone={kycTone(r.kycStatus)}>
                        {kycLabel(r.kycStatus)}
                      </Badge>
                      <Badge tone={residentTone(r.status)}>
                        {r.status.toLowerCase()}
                      </Badge>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {items !== null && total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>
            Showing {rangeStart}–{rangeEnd} of {total}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <span>
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      <RegisterDialog
        open={registering}
        onClose={() => setRegistering(false)}
        onDone={async () => {
          setRegistering(false);
          await load();
        }}
      />
    </div>
  );
}

function RegisterDialog({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => Promise<void> | void;
}) {
  const toast = useToast();
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [age, setAge] = useState("");
  const [occupationType, setOccupationType] = useState<OccupationType>(
    OccupationType.STUDENT,
  );
  const [nativePlace, setNativePlace] = useState("");
  const [ecName, setEcName] = useState("");
  const [ecRelation, setEcRelation] = useState<EmergencyRelation | "">("");
  const [ecPhone, setEcPhone] = useState("");
  // Move-in / check-in + short-stay terms.
  const [isShortStay, setIsShortStay] = useState(false);
  const [moveInDate, setMoveInDate] = useState("");
  const [checkOutDate, setCheckOutDate] = useState("");
  const [perDayRupees, setPerDayRupees] = useState("");
  // Refer & earn: only meaningful for long-term residents — a short-stay guest
  // never gets an `allocations` row, so a referral tied to one could never
  // qualify for a discount.
  const [referredByUserId, setReferredByUserId] = useState<string | undefined>(
    undefined,
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setName("");
      setPhone("");
      setEmail("");
      setAge("");
      setOccupationType(OccupationType.STUDENT);
      setNativePlace("");
      setEcName("");
      setEcRelation("");
      setEcPhone("");
      setIsShortStay(false);
      setMoveInDate(ymdToday());
      setCheckOutDate("");
      setPerDayRupees("");
      setReferredByUserId(undefined);
    }
  }, [open]);

  // The emergency contact is all-or-nothing: once any field is touched, the
  // other two become required (HTML5 + the server's Zod refine both enforce it).
  const ecTouched = Boolean(ecName.trim() || ecRelation || ecPhone.trim());

  // Live total for a short stay: whole days × per-day charge.
  const stayDays =
    isShortStay && moveInDate && checkOutDate && checkOutDate > moveInDate
      ? daysBetween(moveInDate, checkOutDate)
      : 0;
  const stayTotalPaise = stayDays * Math.round(Number(perDayRupees || 0) * 100);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const created = await api.residents.register(
        isShortStay
          ? {
              name: name.trim(),
              phone: phone.trim(),
              email: email.trim() || undefined,
              occupationType: OccupationType.OTHER,
              isShortStay: true,
              expectedMoveInDate: moveInDate,
              shortStayCheckOutDate: checkOutDate,
              shortStayPerDayChargePaise: Math.round(Number(perDayRupees) * 100),
            }
          : {
              name: name.trim(),
              phone: phone.trim(),
              email: email.trim() || undefined,
              isShortStay: false,
              age: Number(age),
              occupationType,
              nativePlace: nativePlace.trim() || undefined,
              expectedMoveInDate: moveInDate || undefined,
              emergencyContactName: ecTouched ? ecName.trim() : undefined,
              emergencyContactRelation: ecTouched
                ? (ecRelation as EmergencyRelation)
                : undefined,
              emergencyContactPhone: ecTouched ? ecPhone.trim() : undefined,
              referredByUserId,
            },
      );
      await onDone();
      router.push(`/residents?id=${created.id}`);
    } catch (err) {
      toast.error(toMessage(err, "Could not register the resident."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Register resident"
      description="Add a new resident to your PG, then assign a bed from their profile."
      className="max-w-2xl"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="register-resident-form" loading={busy}>
            {busy ? "Registering…" : "Register"}
          </Button>
        </>
      }
    >
      <form
        id="register-resident-form"
        onSubmit={submit}
        className="space-y-4"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" htmlFor="r-name">
            <Input
              id="r-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={2}
            />
          </Field>
          <Field label="Phone" htmlFor="r-phone">
            <Input
              id="r-phone"
              value={phone}
              onChange={(e) =>
                setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))
              }
              required
              inputMode="tel"
              pattern="[6-9]\d{9}"
              maxLength={10}
              title="A valid 10-digit Indian mobile number"
              placeholder="9876543210"
            />
          </Field>
          <Field label="Email (optional)" htmlFor="r-email">
            <Input
              id="r-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label="Move-in date" htmlFor="r-movein">
            <Input
              id="r-movein"
              type="date"
              value={moveInDate}
              onChange={(e) => setMoveInDate(e.target.value)}
              required={isShortStay}
            />
          </Field>
        </div>

        {/* Stay type */}
        <label
          className={cn(
            "flex cursor-pointer select-none items-center gap-3 rounded-md border px-3 py-2.5 text-sm",
            isShortStay
              ? "border-brand/40 bg-brand/5"
              : "border-input bg-card",
          )}
        >
          <input
            type="checkbox"
            checked={isShortStay}
            onChange={(e) => setIsShortStay(e.target.checked)}
            className="h-4 w-4 accent-brand"
          />
          <span>
            <span className="font-medium">Short stay (per-day guest)</span>
            <span className="block text-xs text-muted-foreground">
              Pays a per-day charge upfront. Never invoiced or counted in billing.
            </span>
          </span>
        </label>

        {isShortStay ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Check-out date" htmlFor="r-checkout">
              <Input
                id="r-checkout"
                type="date"
                value={checkOutDate}
                min={moveInDate || undefined}
                onChange={(e) => setCheckOutDate(e.target.value)}
                required
              />
            </Field>
            <Field label="Per-day charge (₹)" htmlFor="r-perday">
              <Input
                id="r-perday"
                type="number"
                min={0}
                step="1"
                value={perDayRupees}
                onChange={(e) => setPerDayRupees(e.target.value)}
                required
                placeholder="e.g. 500"
              />
            </Field>
            <div className="sm:col-span-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
              {stayDays > 0 && perDayRupees ? (
                <span>
                  <span className="font-medium">{stayDays}</span> day
                  {stayDays === 1 ? "" : "s"} ×{" "}
                  {formatPaise(Math.round(Number(perDayRupees) * 100))} ={" "}
                  <span className="font-semibold">
                    {formatPaise(stayTotalPaise)}
                  </span>{" "}
                  upfront
                </span>
              ) : (
                <span className="text-muted-foreground">
                  Enter check-out and per-day charge to see the total.
                </span>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Age" htmlFor="r-age">
                <Input
                  id="r-age"
                  type="number"
                  min={15}
                  max={120}
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  required
                />
              </Field>
              <Field label="Occupation" htmlFor="r-occ">
                <Select
                  id="r-occ"
                  value={occupationType}
                  onChange={(e) =>
                    setOccupationType(e.target.value as OccupationType)
                  }
                >
                  {Object.values(OccupationType).map((o) => (
                    <option key={o} value={o}>
                      {o.charAt(0) + o.slice(1).toLowerCase()}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Native place (optional)" htmlFor="r-native">
                <Input
                  id="r-native"
                  value={nativePlace}
                  onChange={(e) => setNativePlace(e.target.value)}
                />
              </Field>
              <Field label="Referred by (optional)" htmlFor="r-referred-by">
                <ResidentCombobox
                  onChange={setReferredByUserId}
                  status="ACTIVE"
                  limit={10}
                  placeholder="Search referring resident…"
                />
              </Field>
            </div>

            <div className="space-y-1 border-t border-border pt-4">
              <p className="text-sm font-medium">Emergency contact (optional)</p>
              <p className="text-xs text-muted-foreground">
                Someone to reach if the resident can&apos;t be contacted. Fill all
                three or leave them blank.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Contact name" htmlFor="r-ec-name">
                <Input
                  id="r-ec-name"
                  value={ecName}
                  onChange={(e) => setEcName(e.target.value)}
                  required={ecTouched}
                  minLength={2}
                  placeholder="e.g. Ramesh Sharma"
                />
              </Field>
              <Field label="Relation" htmlFor="r-ec-rel">
                <Select
                  id="r-ec-rel"
                  value={ecRelation}
                  onChange={(e) =>
                    setEcRelation(e.target.value as EmergencyRelation | "")
                  }
                  required={ecTouched}
                >
                  <option value="">Select relation…</option>
                  {Object.values(EmergencyRelation).map((r) => (
                    <option key={r} value={r}>
                      {r.charAt(0) + r.slice(1).toLowerCase()}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Contact phone" htmlFor="r-ec-phone">
                <Input
                  id="r-ec-phone"
                  value={ecPhone}
                  onChange={(e) => setEcPhone(e.target.value)}
                  required={ecTouched}
                  inputMode="tel"
                  pattern="(\+91)?[6-9]\d{9}"
                  title="A valid 10-digit Indian mobile number, optionally prefixed with +91"
                  placeholder="9876543210"
                />
              </Field>
            </div>
          </>
        )}
      </form>
    </Dialog>
  );
}

/** Whole-day count between two YYYY-MM-DD dates (check-out − check-in). */
function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

/* ---------------------------------------------------------------- detail --- */

interface DetailData {
  resident: ResidentSummary;
  documents: DocumentSummary[];
  deposit: DepositSummary | null;
  // Net available now (Σcollections − Σdeductions − Σrefunds) — what's
  // currently held, computed server-side.
  availablePaise: number;
  ledger: DepositTransactionSummary[];
  exitRequest: ExitRequestSummary | null;
  invoices: InvoiceSummary[];
  charges: ExtraChargeSummary[];
  transfers: TransferRequestSummary[];
  // The resident's pending future booking (UPCOMING) and active short stay, if
  // any — surfaced so the profile can cancel/complete them directly.
  booking: BookingSummary | null;
  shortStay: ShortStaySummary | null;
  // Refer & earn: every resident this one has referred (qualified + applied).
  referrals: ReferralSummary[];
}

function ResidentDetail({ id }: { id: string }) {
  const toast = useToast();
  const router = useRouter();
  const [data, setData] = useState<DetailData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [allocating, setAllocating] = useState(false);
  const [transferring, setTransferring] = useState(false);
  // After a transfer is booked, prompt to adjust the deposit to the new room.
  const [transferDeposit, setTransferDeposit] = useState<{
    bedRentPaise: number;
    bedLabel: string;
  } | null>(null);
  const [depositOpen, setDepositOpen] = useState(false);
  const [collectDepositOpen, setCollectDepositOpen] = useState(false);
  const [refundDepositOpen, setRefundDepositOpen] = useState(false);
  const [chargeOpen, setChargeOpen] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const [applyDepositOpen, setApplyDepositOpen] = useState(false);
  const [viewingDoc, setViewingDoc] = useState<DocumentSummary | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [
      resident,
      allDocs,
      dep,
      invoiceList,
      charges,
      allTransfers,
      allBookings,
      allShortStays,
      referrals,
    ] = await Promise.all([
      api.residents.get(id),
      api.documents.list(),
      api.deposits.byResident(id),
      api.invoices.list({ residentId: id, limit: 100 }),
      api.charges.list(id),
      api.allocations.transfers.list(),
      api.bookings.list(),
      api.shortStays.list(),
      api.referrals.listForResident(id),
    ]);
    setData({
      resident,
      documents: allDocs.filter((d) => d.residentId === id),
      deposit: dep.deposit,
      availablePaise: dep.availablePaise,
      ledger: dep.ledger,
      exitRequest: dep.exitRequest,
      invoices: invoiceList.items,
      charges,
      transfers: allTransfers.filter((t) => t.residentId === id),
      booking:
        allBookings.find(
          (b) => b.residentId === id && b.status === "PENDING",
        ) ?? null,
      shortStay:
        allShortStays.find(
          (s) => s.residentId === id && s.status === "ACTIVE",
        ) ?? null,
      referrals,
    });
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [
          resident,
          allDocs,
          dep,
          invoiceList,
          charges,
          allTransfers,
          allBookings,
          allShortStays,
          referrals,
        ] = await Promise.all([
          api.residents.get(id),
          api.documents.list(),
          api.deposits.byResident(id),
          api.invoices.list({ residentId: id, limit: 100 }),
          api.charges.list(id),
          api.allocations.transfers.list(),
          api.bookings.list(),
          api.shortStays.list(),
          api.referrals.listForResident(id),
        ]);
        if (cancelled) return;
        setData({
          resident,
          documents: allDocs.filter((d) => d.residentId === id),
          deposit: dep.deposit,
          availablePaise: dep.availablePaise,
          ledger: dep.ledger,
          exitRequest: dep.exitRequest,
          invoices: invoiceList.items,
          charges,
          transfers: allTransfers.filter((t) => t.residentId === id),
          booking:
            allBookings.find(
              (b) => b.residentId === id && b.status === "PENDING",
            ) ?? null,
          shortStay:
            allShortStays.find(
              (s) => s.residentId === id && s.status === "ACTIVE",
            ) ?? null,
          referrals,
        });
      } catch (err) {
        if (!cancelled)
          setLoadError(toMessage(err, "Could not load resident."));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const refresh = async () => {
    try {
      await load();
    } catch (err) {
      toast.error(toMessage(err, "Could not refresh resident."));
    }
  };

  const moveOut = async () => {
    setBusy(true);
    try {
      await api.allocations.moveOut(id);
      await load();
    } catch (err) {
      toast.error(toMessage(err, "Could not move the resident out."));
    } finally {
      setBusy(false);
    }
  };

  const executeTransfer = async (transferId: string) => {
    setBusy(true);
    try {
      await api.allocations.transfers.execute(transferId);
      await load();
    } catch (err) {
      toast.error(toMessage(err, "Could not execute the transfer."));
    } finally {
      setBusy(false);
    }
  };

  const cancelTransfer = async (transferId: string) => {
    setBusy(true);
    try {
      await api.allocations.transfers.cancel(transferId);
      await load();
    } catch (err) {
      toast.error(toMessage(err, "Could not cancel the transfer."));
    } finally {
      setBusy(false);
    }
  };

  const removeCharge = async (chargeId: string) => {
    setBusy(true);
    try {
      await api.charges.remove(chargeId);
      await load();
    } catch (err) {
      toast.error(toMessage(err, "Could not remove the charge."));
    } finally {
      setBusy(false);
    }
  };

  const cancelBooking = async (bookingId: string) => {
    setBusy(true);
    try {
      await api.bookings.cancel(bookingId);
      await load();
    } catch (err) {
      toast.error(toMessage(err, "Could not cancel the booking."));
    } finally {
      setBusy(false);
    }
  };

  const completeShortStay = async (stayId: string) => {
    setBusy(true);
    try {
      await api.shortStays.complete(stayId);
      await load();
    } catch (err) {
      toast.error(toMessage(err, "Could not complete the short stay."));
    } finally {
      setBusy(false);
    }
  };

  const cancelShortStay = async (stayId: string) => {
    setBusy(true);
    try {
      await api.shortStays.cancel(stayId);
      await load();
    } catch (err) {
      toast.error(toMessage(err, "Could not cancel the short stay."));
    } finally {
      setBusy(false);
    }
  };

  const handleApproveDoc = async (docId: string) => {
    await api.documents.verify(docId);
    await load();
  };

  const handleRejectDoc = async (docId: string, note: string) => {
    await api.documents.reject(docId, note);
    await load();
  };

  if (loadError && !data) {
    return (
      <div className="space-y-4">
        <BackLink />
        <Card>
          <CardContent className="pt-5 text-sm text-muted-foreground">
            {loadError}
          </CardContent>
        </Card>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="space-y-4">
        <BackLink />
        <Skeleton className="h-40" />
      </div>
    );
  }

  const {
    resident,
    documents,
    deposit,
    availablePaise: depositBalancePaise,
    ledger,
    exitRequest,
    invoices,
    charges,
    transfers,
    booking,
    shortStay,
    referrals,
  } = data;
  const active = resident.status === "ACTIVE";
  const isShortStay = resident.isShortStay;
  const pendingTransfer = transfers.find((t) => t.status === "PENDING") ?? null;
  // What the resident still owes — every non-voided invoice that isn't PAID or
  // WAIVED (covers UNPAID + OVERDUE). Drives the summary tile; the full list
  // lives on the Rent page (via the "View invoices" button).
  const outstandingPaise = invoices
    .filter((i) => !i.deletedAt && i.status !== "PAID" && i.status !== "WAIVED")
    .reduce((sum, i) => sum + i.amountPaise, 0);
  // Collectable invoices the held deposit could be applied to.
  const outstandingInvoices = invoices.filter(
    (i) => !i.deletedAt && (i.status === "PENDING" || i.status === "OVERDUE"),
  );
  const initials = resident.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

  return (
    <div className="space-y-6">
      <BackLink />

      {/* Summary header — identity + at-a-glance tiles */}
      <Card>
        <CardContent className="space-y-5 pt-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand/10 text-lg font-semibold text-brand">
                {initials || "?"}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-semibold tracking-tight">
                    {resident.name}
                  </h1>
                  <Badge tone={residentTone(resident.status)}>
                    {resident.status.toLowerCase()}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {resident.phone}
                  {resident.age != null ? ` · ${resident.age} yrs` : ""} ·{" "}
                  {resident.occupationType.toLowerCase()}
                  {resident.nativePlace ? ` · ${resident.nativePlace}` : ""}
                </p>
                {resident.emergencyContactName && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Emergency:{" "}
                    <span className="font-medium text-foreground">
                      {resident.emergencyContactName}
                    </span>
                    {resident.emergencyContactRelation
                      ? ` · ${resident.emergencyContactRelation.toLowerCase()}`
                      : ""}
                    {resident.emergencyContactPhone
                      ? ` · ${resident.emergencyContactPhone}`
                      : ""}
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push(`/complaints?resident=${id}`)}
              >
                <MessageSquare className="h-4 w-4" />
                View complaints
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push(`/rent?resident=${id}`)}
              >
                <Receipt className="h-4 w-4" />
                View invoices
              </Button>
            </div>
          </div>

          {/* At-a-glance tiles */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-xs font-medium text-muted-foreground">
                Bed / Room
              </p>
              <p
                className={cn(
                  "mt-1 truncate text-base font-semibold",
                  !resident.bedLabel && "text-muted-foreground",
                )}
              >
                {resident.bedLabel
                  ? `${resident.roomLabel ? `${resident.roomLabel} · ` : ""}${resident.bedLabel}`
                  : "Unallocated"}
              </p>
            </div>
            {!isShortStay && (
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="text-xs font-medium text-muted-foreground">
                  Monthly rent
                </p>
                <p
                  className={cn(
                    "mt-1 text-base font-semibold tabular-nums",
                    resident.currentRentPaise == null &&
                      "text-muted-foreground",
                  )}
                >
                  {resident.currentRentPaise != null
                    ? formatPaise(resident.currentRentPaise)
                    : "Unallocated"}
                </p>
              </div>
            )}
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-xs font-medium text-muted-foreground">
                Rent outstanding
              </p>
              <p
                className={cn(
                  "mt-1 text-base font-semibold tabular-nums",
                  outstandingPaise > 0 ? "text-danger" : "text-foreground",
                )}
              >
                {formatPaise(outstandingPaise)}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-xs font-medium text-muted-foreground">
                Deposit
              </p>
              <p
                className={cn(
                  "mt-1 text-base font-semibold tabular-nums",
                  !deposit && "text-muted-foreground",
                )}
              >
                {deposit ? formatPaise(depositBalancePaise) : "None"}
              </p>
              {deposit && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {deposit.status.toLowerCase()}
                </p>
              )}
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-xs font-medium text-muted-foreground">KYC</p>
              <div className="mt-1.5">
                <Badge tone={kycTone(resident.kycStatus)}>
                  {resident.kycStatus.replace("_", " ").toLowerCase()}
                </Badge>
              </div>
            </div>
          </div>

          {/* Provenance — de-emphasized, kept out of the identity block so it
              doesn't crowd the at-a-glance info but is still on record. */}
          <div className="flex items-center gap-1.5 border-t border-border pt-3 text-xs text-muted-foreground">
            <UserPlus className="h-3.5 w-3.5 shrink-0" />
            <span>
              {resident.createdByName
                ? `Added by ${resident.createdByName} on ${formatDate(resident.createdAt)}`
                : `Added on ${formatDate(resident.createdAt)}`}
              {resident.referredByName
                ? ` · Referred by ${resident.referredByName}`
                : ""}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Pending transfer — time-sensitive, kept prominent above the fold */}
      {pendingTransfer && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4">
          <div className="min-w-0 text-sm">
            <p className="font-medium">
              Pending move → bed {pendingTransfer.toBedLabel}
            </p>
            <p className="text-xs text-muted-foreground">
              planned {formatDate(pendingTransfer.plannedDate)} · executing
              splits this month&apos;s rent and credits/charges the difference
              on the next invoice
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              disabled={busy}
              onClick={() => executeTransfer(pendingTransfer.id)}
            >
              Execute move
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => cancelTransfer(pendingTransfer.id)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Detail sections — two columns on desktop, single on mobile. Cards
          stretch to match their row neighbour's height (grid default). */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Allocation */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{isShortStay ? "Short stay" : "Bed allocation"}</CardTitle>
            {isShortStay ? (
              shortStay ? (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => completeShortStay(shortStay.id)}
                  >
                    Check out
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => cancelShortStay(shortStay.id)}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                active && (
                  <Button size="sm" onClick={() => setAllocating(true)}>
                    <BedDouble className="h-4 w-4" />
                    Assign bed
                  </Button>
                )
              )
            ) : (
              active &&
              (resident.bedLabel ? (
                <div className="flex gap-2">
                  {!pendingTransfer && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setTransferring(true)}
                    >
                      <ArrowRightLeft className="h-4 w-4" />
                      Transfer room
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={moveOut}
                  >
                    Move out
                  </Button>
                </div>
              ) : (
                <Button size="sm" onClick={() => setAllocating(true)}>
                  <BedDouble className="h-4 w-4" />
                  Allocate to bed
                </Button>
              ))
            )}
            {!isShortStay && resident.status === "UPCOMING" && booking && (
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => cancelBooking(booking.id)}
              >
                Cancel booking
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {isShortStay ? (
              shortStay ? (
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium">
                      Bed {shortStay.bedLabel}
                    </p>
                    <Link
                      href={`/property?bed=${shortStay.bedId}`}
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-brand transition-colors hover:underline"
                    >
                      <ExternalLink className="h-4 w-4" />
                      View on property
                    </Link>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(shortStay.checkInDate)} →{" "}
                    {formatDate(shortStay.checkOutDate)} ·{" "}
                    {formatPaise(shortStay.feePaise)} paid upfront
                  </p>
                </div>
              ) : resident.status === "EXITED" ? (
                <p className="text-sm text-muted-foreground">
                  Stay completed.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Checking out {formatDate(resident.shortStayCheckOutDate ?? "")}
                  {resident.shortStayTotalPaise != null
                    ? ` · ${formatPaise(resident.shortStayTotalPaise)} upfront`
                    : ""}
                  . Not assigned to a bed yet.
                </p>
              )
            ) : resident.bedId ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">{bedLocationPath(resident)}</p>
                <Link
                  href={`/property?bed=${resident.bedId}`}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-brand transition-colors hover:underline"
                >
                  <ExternalLink className="h-4 w-4" />
                  View on property
                </Link>
              </div>
            ) : resident.bookedBedId ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm">
                  <span className="font-medium">
                    Bed {resident.bookedBedLabel} held
                  </span>
                  {resident.moveInDate
                    ? ` · moves in ${formatDate(resident.moveInDate)}`
                    : ""}
                </p>
                <Link
                  href={`/property?bed=${resident.bookedBedId}`}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-brand transition-colors hover:underline"
                >
                  <ExternalLink className="h-4 w-4" />
                  View on property
                </Link>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {resident.expectedMoveInDate
                  ? `Planned move-in ${formatDate(resident.expectedMoveInDate)}. Not assigned to a bed.`
                  : "Not assigned to a bed."}
              </p>
            )}
          </CardContent>
        </Card>

        {/* KYC documents */}
        <Card>
          <CardHeader>
            <CardTitle>KYC documents</CardTitle>
          </CardHeader>
          <CardContent>
            {documents.length === 0 ? (
              <EmptyRow text="Awaiting Aadhaar upload from the resident (uploaded from their app)." />
            ) : (
              <ul className="divide-y divide-border">
                {documents.map((d) => (
                  <li
                    key={d.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {d.type.replace("_", " ").toLowerCase()}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(d.createdAt)}
                        {d.reviewNote ? ` · note: ${d.reviewNote}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={docTone(d.status)}>
                        {d.status.toLowerCase()}
                      </Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setViewingDoc(d)}
                      >
                        <Eye className="h-4 w-4" />
                        View
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Deposit */}
        <Card>
          <CardHeader>
            <CardTitle>Security deposit</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex flex-wrap gap-2">
              {!deposit && active && (
                <Button size="sm" onClick={() => setDepositOpen(true)}>
                  <Plus className="h-4 w-4" />
                  Record deposit
                </Button>
              )}
              {deposit?.status === "HELD" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCollectDepositOpen(true)}
                >
                  <Plus className="h-4 w-4" />
                  Collect deposit
                </Button>
              )}
              {deposit?.status === "HELD" && depositBalancePaise > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setRefundDepositOpen(true)}
                >
                  Refund
                </Button>
              )}
              {active &&
                deposit?.status === "HELD" &&
                outstandingInvoices.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setApplyDepositOpen(true)}
                  >
                    Apply to rent
                  </Button>
                )}
              {active && (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setExitOpen(true)}
                >
                  Settle exit
                </Button>
              )}
            </div>
            {exitRequest && (
              <div className="mb-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <span className="mt-0.5 shrink-0">⏳</span>
                <span>
                  Move-out requested for{" "}
                  <strong>{formatDate(exitRequest.requestedDate)}</strong>
                  {exitRequest.note ? ` — "${exitRequest.note}"` : ""}
                </span>
              </div>
            )}
            {deposit ? (
              <div className="space-y-3">
                {/* The amount currently held (net of any refunds/deductions),
                    not the gross ever collected — that's what's actually
                    available for apply-to-rent / exit refund. */}
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium">
                    {formatPaise(depositBalancePaise)}
                  </span>
                  <Badge tone={deposit.status === "HELD" ? "brand" : "neutral"}>
                    {deposit.status.toLowerCase()}
                  </Badge>
                </div>
                {ledger.length > 0 && (
                  <ul className="divide-y divide-border border-t border-border">
                    {ledger.map((t) => (
                      <li
                        key={t.id}
                        className="flex items-center justify-between gap-3 py-2 text-sm"
                      >
                        <span className="text-muted-foreground">
                          {t.type.toLowerCase()}
                          {t.period
                            ? ` · rent ${t.period}`
                            : t.reason
                              ? ` · ${t.reason}`
                              : ""}
                        </span>
                        <span
                          className={cn(
                            "font-medium",
                            t.type === "COLLECTION"
                              ? "text-success"
                              : t.type === "REFUND"
                                ? "text-info"
                                : "text-danger",
                          )}
                        >
                          {t.type === "DEDUCTION" ? "−" : ""}
                          {formatPaise(t.amountPaise)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No deposit on record.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Extra charges */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Extra charges</CardTitle>
            <Button size="sm" onClick={() => setChargeOpen(true)}>
              <Plus className="h-4 w-4" />
              Add charge
            </Button>
          </CardHeader>
          <CardContent>
            {charges.length === 0 ? (
              <EmptyRow text="No extra charges. Add a one-time or monthly charge for this resident." />
            ) : (
              <ul className="divide-y divide-border">
                {charges.map((c) => {
                  const stopped =
                    c.frequency === ChargeFrequency.MONTHLY && !c.active;
                  return (
                    <li
                      key={c.id}
                      className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{c.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {c.frequency === ChargeFrequency.MONTHLY
                            ? stopped
                              ? "monthly · stopped"
                              : "monthly"
                            : c.appliedAt
                              ? "one-time · billed"
                              : "one-time · queued"}
                        </p>
                      </div>
                      <span className="text-sm font-semibold tabular-nums">
                        {formatPaise(c.amountPaise)}
                      </span>
                      {c.frequency === ChargeFrequency.MONTHLY && c.active && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy}
                          onClick={() => removeCharge(c.id)}
                        >
                          Stop
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Refer & earn — who this resident has referred, and whether the
            discount has landed on an invoice yet. */}
        {referrals.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Referrals</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-border">
                {referrals.map((r) => (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{r.referredName}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.appliedAt
                          ? `discount applied ${formatDate(r.appliedAt)}`
                          : "qualified · discount pending next invoice"}
                      </p>
                    </div>
                    <span className="text-sm font-semibold tabular-nums">
                      -{formatPaise(r.discountPaise)}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>

      <AllocateDialog
        open={allocating}
        resident={resident}
        onClose={() => setAllocating(false)}
        onDone={async () => {
          setAllocating(false);
          await refresh();
        }}
      />
      <TransferDialog
        open={transferring}
        residentId={id}
        currentBedLabel={resident.bedLabel}
        onClose={() => setTransferring(false)}
        onBooked={async (info) => {
          setTransferring(false);
          await refresh();
          // Chain into the deposit step so the held amount can match the new room.
          setTransferDeposit(info);
        }}
      />
      <TransferDepositDialog
        open={transferDeposit !== null}
        residentId={id}
        currentDepositPaise={deposit?.amountPaise ?? 0}
        hasDeposit={!!deposit}
        bedRentPaise={transferDeposit?.bedRentPaise ?? 0}
        bedLabel={transferDeposit?.bedLabel ?? ""}
        onClose={() => setTransferDeposit(null)}
        onDone={async () => {
          setTransferDeposit(null);
          await refresh();
        }}
      />
      <RecordDepositDialog
        open={depositOpen}
        residentId={id}
        onClose={() => setDepositOpen(false)}
        onDone={async () => {
          setDepositOpen(false);
          await refresh();
        }}
      />
      <CollectDepositDialog
        open={collectDepositOpen}
        residentId={id}
        onClose={() => setCollectDepositOpen(false)}
        onDone={async () => {
          setCollectDepositOpen(false);
          await refresh();
        }}
      />
      <RefundDepositDialog
        open={refundDepositOpen}
        residentId={id}
        availablePaise={depositBalancePaise}
        onClose={() => setRefundDepositOpen(false)}
        onDone={async () => {
          setRefundDepositOpen(false);
          await refresh();
        }}
      />
      <AddChargeDialog
        open={chargeOpen}
        residentId={id}
        onClose={() => setChargeOpen(false)}
        onDone={async () => {
          setChargeOpen(false);
          await refresh();
        }}
      />
      <ExitDialog
        open={exitOpen}
        residentId={id}
        deposit={deposit}
        priorDeductionsPaise={
          deposit ? deposit.amountPaise - depositBalancePaise : 0
        }
        onClose={() => setExitOpen(false)}
        onDone={async () => {
          setExitOpen(false);
          await refresh();
        }}
      />
      <ApplyDepositDialog
        open={applyDepositOpen}
        invoices={outstandingInvoices}
        balancePaise={depositBalancePaise}
        onClose={() => setApplyDepositOpen(false)}
        onDone={async () => {
          setApplyDepositOpen(false);
          await refresh();
        }}
      />
      <DocViewerDialog
        doc={viewingDoc}
        onClose={() => setViewingDoc(null)}
        onApprove={handleApproveDoc}
        onReject={handleRejectDoc}
      />
    </div>
  );
}

const ELIGIBLE_KIND_LABEL: Record<EligibleBed["kind"], string> = {
  VACANT: "Available now",
  LEAVING_SOON: "Leaving soon",
  RESERVED_FREE_AFTER: "Reserved — free after this stay",
};

/**
 * Unified bed-assign dialog driven from a resident's profile. The eligible-bed
 * set + the action both depend on the resident:
 *  - Short-stay guest → `shortStays.create` (terms come from the resident).
 *  - Long-term, vacant bed, move-in today/past → `allocations.allocate` (live now).
 *  - Long-term, future move-in or a soon-to-free bed → `bookings.create`
 *    (reserve + hold deposit; a daily job turns it into an allocation on move-in).
 */
function AllocateDialog({
  open,
  resident,
  onClose,
  onDone,
}: {
  open: boolean;
  resident: ResidentSummary;
  onClose: () => void;
  onDone: () => Promise<void> | void;
}) {
  const toast = useToast();
  const residentId = resident.id;
  const isShortStay = resident.isShortStay;
  const [beds, setBeds] = useState<EligibleBed[] | null>(null);
  const [selectedBedId, setSelectedBedId] = useState<string | null>(null);
  // "ALL" shows every eligible bed; a specific type filters by the room's
  // occupation preference (a room with no preference shows only under "OTHER").
  const [occFilter, setOccFilter] = useState<OccupationType | "ALL">(
    resident.occupationType,
  );
  const [moveInDate, setMoveInDate] = useState(
    resident.expectedMoveInDate ?? ymdToday(),
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setBeds(null);
    setSelectedBedId(null);
    setOccFilter(resident.occupationType);
    setMoveInDate(resident.expectedMoveInDate ?? ymdToday());
    (async () => {
      try {
        const list = await api.allocations.eligibleBeds(residentId);
        if (!cancelled) setBeds(list);
      } catch (err) {
        if (!cancelled)
          toast.error(toMessage(err, "Could not load available beds."));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    open,
    residentId,
    resident.expectedMoveInDate,
    resident.occupationType,
    toast,
  ]);

  // Filter by the room's occupation preference (null pref → "OTHER" only; "ALL"
  // → everything), then order so nearly-full rooms come first to fill rooms up
  // faster: then ascending beds-remaining, then room/bed. The primary key
  // depends on the resident — a short stay prefers RESERVED_FREE_AFTER beds
  // (idle reserved capacity, freed before check-out) so truly-vacant beds stay
  // open for long-term placements; a long-term placement prefers VACANT beds.
  const visibleBeds = useMemo(() => {
    if (!beds) return [];
    const filtered =
      occFilter === "ALL"
        ? beds
        : beds.filter((b) =>
            occFilter === OccupationType.OTHER
              ? b.occupationPreference === OccupationType.OTHER ||
                b.occupationPreference === null
              : b.occupationPreference === occFilter,
          );
    const rank = (b: EligibleBed) =>
      isShortStay
        ? Number(b.kind === "RESERVED_FREE_AFTER")
        : Number(b.kind === "VACANT");
    return [...filtered].sort(
      (a, b) =>
        rank(b) - rank(a) ||
        a.bedsRemaining - b.bedsRemaining ||
        a.roomLabel.localeCompare(b.roomLabel) ||
        a.bedLabel.localeCompare(b.bedLabel),
    );
  }, [beds, occFilter, isShortStay]);

  const selectedBed = beds?.find((b) => b.bedId === selectedBedId) ?? null;
  // A long-term placement becomes a live allocation only on a vacant bed with a
  // move-in that's today or earlier; otherwise it's a future booking.
  const willBook =
    !isShortStay &&
    !!selectedBed &&
    (selectedBed.kind !== "VACANT" || moveInDate > ymdToday());

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBedId) return;
    setBusy(true);
    try {
      if (isShortStay) {
        await api.shortStays.create({ residentId, bedId: selectedBedId });
      } else if (willBook) {
        // The deposit is held later from the resident UI, not captured here.
        await api.bookings.create({
          residentId,
          bedId: selectedBedId,
          moveInDate,
          depositAmountPaise: 0,
        });
      } else {
        await api.allocations.allocate({
          bedId: selectedBedId,
          residentId,
          startDate: moveInDate,
        });
      }
      await onDone();
    } catch (err) {
      toast.error(toMessage(err, "Could not assign the bed."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isShortStay ? "Assign a bed for the stay" : "Assign to a bed"}
      description={
        isShortStay
          ? "Vacant beds, plus beds reserved for a future move-in that starts after this guest checks out."
          : "Vacant beds now, plus beds whose resident is leaving before the move-in date."
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {!isShortStay && (
          <Field label="Move-in date" htmlFor="alloc-movein">
            <Input
              id="alloc-movein"
              type="date"
              value={moveInDate}
              onChange={(e) => setMoveInDate(e.target.value)}
              required
            />
          </Field>
        )}

        <Field label="Suited for" htmlFor="alloc-occ">
          <Select
            id="alloc-occ"
            value={occFilter}
            onChange={(e) => {
              setOccFilter(e.target.value as OccupationType | "ALL");
              setSelectedBedId(null);
            }}
          >
            <option value="ALL">All beds</option>
            {Object.values(OccupationType).map((o) => (
              <option key={o} value={o}>
                {o.charAt(0) + o.slice(1).toLowerCase()}
              </option>
            ))}
          </Select>
        </Field>

        {beds === null ? (
          <ListSkeleton />
        ) : beds.length === 0 ? (
          <EmptyRow text="No available beds for this resident." />
        ) : visibleBeds.length === 0 ? (
          <EmptyRow text="No beds match this filter — choose “All beds” to see every option." />
        ) : (
          <ul className="max-h-[45vh] divide-y divide-border overflow-y-auto">
            {visibleBeds.map((b) => (
              <li key={b.bedId}>
                <button
                  type="button"
                  onClick={() => setSelectedBedId(b.bedId)}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 px-2 py-3 text-left transition-colors hover:bg-muted",
                    selectedBedId === b.bedId && "bg-brand/10",
                  )}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {b.roomLabel} · {b.bedLabel}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatPaise(b.monthlyRentPaise)}/mo · {sharingLabel(b.capacity)} ·{" "}
                      {b.bedsRemaining} left · {ELIGIBLE_KIND_LABEL[b.kind]}
                      {b.occupantName ? ` · ${b.occupantName}` : ""}
                      {b.freesOnDate ? ` · frees ${formatDate(b.freesOnDate)}` : ""}
                    </p>
                  </div>
                  {selectedBedId === b.bedId && <Badge tone="brand">Selected</Badge>}
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {!selectedBed
              ? ""
              : isShortStay
                ? "Holds the bed for this guest until check-out."
                : willBook
                  ? "Reserves the bed; becomes a live allocation on the move-in date."
                  : "Assigns the resident to this bed now."}
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !selectedBedId}>
              {busy
                ? "Saving…"
                : isShortStay
                  ? "Assign bed"
                  : willBook
                    ? "Reserve bed"
                    : "Assign now"}
            </Button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}

/** Local zero-padded YYYY-MM-DD (never toISOString — UTC is off-by-one in IST). */
function ymdToday(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function TransferDialog({
  open,
  residentId,
  currentBedLabel,
  onClose,
  onBooked,
}: {
  open: boolean;
  residentId: string;
  currentBedLabel: string | null;
  onClose: () => void;
  /** Fires after the transfer is booked, with the target room's rent + label
   * so the parent can prompt to adjust the deposit to match the new room. */
  onBooked: (info: {
    bedRentPaise: number;
    bedLabel: string;
  }) => Promise<void> | void;
}) {
  const toast = useToast();
  const [beds, setBeds] = useState<AvailableBed[] | null>(null);
  const [exiting, setExiting] = useState<ExitingBed[] | null>(null);
  const [selectedBedId, setSelectedBedId] = useState<string | null>(null);
  const [plannedDate, setPlannedDate] = useState(ymdToday());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setBeds(null);
    setExiting(null);
    setSelectedBedId(null);
    setPlannedDate(ymdToday());
    (async () => {
      try {
        const [vacant, soonFree] = await Promise.all([
          api.allocations.suggestions(residentId),
          api.allocations.exitingBeds(),
        ]);
        if (cancelled) return;
        setBeds(vacant);
        // Exclude the resident's own bed — they can't transfer onto it.
        setExiting(soonFree);
      } catch (err) {
        if (!cancelled)
          toast.error(toMessage(err, "Could not load beds to move into."));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, residentId, toast]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBedId) return;
    const target =
      beds?.find((b) => b.bedId === selectedBedId) ??
      exiting?.find((b) => b.bedId === selectedBedId);
    setBusy(true);
    try {
      await api.allocations.transfers.create({
        residentId,
        toBedId: selectedBedId,
        plannedDate,
      });
      await onBooked({
        bedRentPaise: target?.monthlyRentPaise ?? 0,
        bedLabel: target ? `${target.roomLabel} · ${target.bedLabel}` : "",
      });
    } catch (err) {
      toast.error(toMessage(err, "Could not book the transfer."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Transfer to another room"
      description={
        currentBedLabel
          ? `Currently in ${currentBedLabel}. Pre-book a move; a vacant bed waits until you execute it, and a soon-to-free bed auto-executes once it's vacated on/after the planned date.`
          : undefined
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {beds === null || exiting === null ? (
          <ListSkeleton />
        ) : beds.length === 0 && exiting.length === 0 ? (
          <EmptyRow text="No vacant or soon-to-free beds to move into." />
        ) : (
          <div className="max-h-[45vh] space-y-3 overflow-y-auto">
            {beds.length > 0 && (
              <ul className="divide-y divide-border">
                {beds.map((b) => (
                  <li key={b.bedId}>
                    <button
                      type="button"
                      onClick={() => setSelectedBedId(b.bedId)}
                      className={cn(
                        "flex w-full items-center justify-between gap-3 px-2 py-3 text-left transition-colors hover:bg-muted",
                        selectedBedId === b.bedId && "bg-brand/10",
                      )}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          {b.roomLabel} · {b.bedLabel}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatPaise(b.monthlyRentPaise)}/mo ·{" "}
                          {sharingLabel(b.capacity)}
                        </p>
                      </div>
                      {selectedBedId === b.bedId && (
                        <Badge tone="brand">Selected</Badge>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {exiting.length > 0 && (
              <div>
                <p className="px-2 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Soon to free — moves in when vacated
                </p>
                <ul className="divide-y divide-border">
                  {exiting.map((b) => (
                    <li key={b.bedId}>
                      <button
                        type="button"
                        onClick={() => setSelectedBedId(b.bedId)}
                        className={cn(
                          "flex w-full items-center justify-between gap-3 px-2 py-3 text-left transition-colors hover:bg-muted",
                          selectedBedId === b.bedId && "bg-brand/10",
                        )}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium">
                            {b.roomLabel} · {b.bedLabel}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatPaise(b.monthlyRentPaise)}/mo ·{" "}
                            {sharingLabel(b.capacity)} · {b.occupantName} leaving
                            {b.exitRequestedDate
                              ? ` ${formatDate(b.exitRequestedDate)}`
                              : ""}
                          </p>
                        </div>
                        {selectedBedId === b.bedId && (
                          <Badge tone="brand">Selected</Badge>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        <Field label="Planned move date" htmlFor="xfer-date">
          <Input
            id="xfer-date"
            type="date"
            value={plannedDate}
            onChange={(e) => setPlannedDate(e.target.value)}
            required
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy || !selectedBedId}>
            {busy ? "Booking…" : "Book transfer"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function RecordDepositDialog({
  open,
  residentId,
  onClose,
  onDone,
}: {
  open: boolean;
  residentId: string;
  onClose: () => void;
  onDone: () => Promise<void> | void;
}) {
  const toast = useToast();
  const [rupees, setRupees] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setRupees("");
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.deposits.record({
        residentId,
        amountPaise: Math.round(Number(rupees) * 100),
      });
      await onDone();
    } catch (err) {
      toast.error(toMessage(err, "Could not record the deposit."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Record deposit"
      description="The security deposit held for this resident (one per resident)."
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Amount (₹)" htmlFor="dep-amount">
          <Input
            id="dep-amount"
            type="number"
            min={0}
            step="1"
            value={rupees}
            onChange={(e) => setRupees(e.target.value)}
            required
            placeholder="e.g. 10000"
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy || rupees === ""}>
            {busy ? "Saving…" : "Record"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/**
 * Collect a deposit payment — creates the deposit if the resident has none yet,
 * otherwise adds to it. Repeatable, so a partial deposit taken at booking (e.g.
 * ₹2,000) can be topped up later at move-in (e.g. ₹10,000 more).
 */
function CollectDepositDialog({
  open,
  residentId,
  onClose,
  onDone,
}: {
  open: boolean;
  residentId: string;
  onClose: () => void;
  onDone: () => Promise<void> | void;
}) {
  const toast = useToast();
  const [rupees, setRupees] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setRupees("");
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.deposits.collect({
        residentId,
        amountPaise: Math.round(Number(rupees) * 100),
      });
      await onDone();
    } catch (err) {
      toast.error(toMessage(err, "Could not collect the deposit."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Collect deposit"
      description="Record a deposit payment. Adds to the held amount — use this for installment collection."
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Amount collected (₹)" htmlFor="collect-dep-amount">
          <Input
            id="collect-dep-amount"
            type="number"
            min={1}
            step="1"
            value={rupees}
            onChange={(e) => setRupees(e.target.value)}
            required
            placeholder="e.g. 2000"
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy || rupees === ""}>
            {busy ? "Saving…" : "Collect"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/**
 * Refund part of a held deposit any time (not just at exit) — e.g. a room
 * downgrade lowers what's required. Capped at the live available balance.
 */
function RefundDepositDialog({
  open,
  residentId,
  availablePaise,
  onClose,
  onDone,
}: {
  open: boolean;
  residentId: string;
  availablePaise: number;
  onClose: () => void;
  onDone: () => Promise<void> | void;
}) {
  const toast = useToast();
  const [rupees, setRupees] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setRupees("");
      setReason("");
    }
  }, [open]);

  const amountPaise = rupees === "" ? 0 : Math.round(Number(rupees) * 100);
  const overAvailable = amountPaise > availablePaise;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.deposits.refund({ residentId, amountPaise, reason });
      await onDone();
    } catch (err) {
      toast.error(toMessage(err, "Could not refund the deposit."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Refund deposit"
      description={`Up to ${formatPaise(availablePaise)} available to refund.`}
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Amount to refund (₹)" htmlFor="refund-dep-amount">
          <Input
            id="refund-dep-amount"
            type="number"
            min={1}
            step="1"
            value={rupees}
            onChange={(e) => setRupees(e.target.value)}
            required
            placeholder="e.g. 2000"
          />
          {overAvailable && (
            <p className="mt-1 text-sm text-danger">
              Exceeds the {formatPaise(availablePaise)} available.
            </p>
          )}
        </Field>
        <Field label="Reason" htmlFor="refund-dep-reason">
          <Input
            id="refund-dep-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            placeholder="e.g. Room downgrade"
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={busy || rupees === "" || reason.trim() === "" || overAvailable}
          >
            {busy ? "Saving…" : "Refund"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/**
 * Shown right after a room transfer is booked: review/adjust the held deposit so
 * it still covers a month's rent in the new room (a 7k→8k move otherwise leaves
 * the deposit short for last-month rent, which `applyToInvoice` would reject).
 * Prefilled with the current deposit (or the new room's rent when none exists);
 * a confirm step spells out how much to collect/refund. Creates a deposit when
 * the resident has none. Collection is offline — this only records the target.
 */
function TransferDepositDialog({
  open,
  residentId,
  currentDepositPaise,
  hasDeposit,
  bedRentPaise,
  bedLabel,
  onClose,
  onDone,
}: {
  open: boolean;
  residentId: string;
  currentDepositPaise: number;
  hasDeposit: boolean;
  bedRentPaise: number;
  bedLabel: string;
  onClose: () => void;
  onDone: () => Promise<void> | void;
}) {
  const toast = useToast();
  const [rupees, setRupees] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    // Prefill the current deposit, or one month's rent as a sensible default when
    // the resident has none on record yet.
    const seed = hasDeposit ? currentDepositPaise : bedRentPaise;
    setRupees(seed > 0 ? String(Math.round(seed / 100)) : "");
    setConfirming(false);
  }, [open, hasDeposit, currentDepositPaise, bedRentPaise]);

  const newPaise = rupees === "" ? 0 : Math.round(Number(rupees) * 100);
  const delta = newPaise - currentDepositPaise;

  const deltaNote = !hasDeposit
    ? `Collect ${formatPaise(newPaise)}`
    : delta > 0
      ? `Collect ${formatPaise(delta)} more`
      : delta < 0
        ? `Refund ${formatPaise(-delta)}`
        : "No change to collect";

  const save = async () => {
    setBusy(true);
    try {
      await api.deposits.updateAmount({ residentId, amountPaise: newPaise });
      await onDone();
    } catch (err) {
      toast.error(toMessage(err, "Could not update the deposit."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={confirming ? "Confirm deposit" : "Adjust deposit"}
      description={
        confirming
          ? undefined
          : `Transfer booked to ${bedLabel}. Update the held deposit so it still covers a month's rent in the new room.`
      }
    >
      {confirming ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
            <p className="font-medium">Please settle the deposit.</p>
            <p className="mt-1 text-muted-foreground">
              {deltaNote} · new deposit{" "}
              <span className="font-medium text-foreground">
                {formatPaise(newPaise)}
              </span>
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirming(false)}
              disabled={busy}
            >
              Back
            </Button>
            <Button type="button" onClick={save} disabled={busy}>
              {busy ? "Saving…" : "Confirm"}
            </Button>
          </div>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setConfirming(true);
          }}
          className="space-y-4"
        >
          <p className="text-sm text-muted-foreground">
            New room rent:{" "}
            <span className="font-medium text-foreground">
              {formatPaise(bedRentPaise)}/mo
            </span>
            {hasDeposit ? (
              <>
                {" · "}current deposit {formatPaise(currentDepositPaise)}
              </>
            ) : (
              <> · no deposit on record yet</>
            )}
          </p>
          <Field label="Deposit (₹)" htmlFor="xfer-dep-amount">
            <Input
              id="xfer-dep-amount"
              type="number"
              min={0}
              step="1"
              value={rupees}
              onChange={(e) => setRupees(e.target.value)}
              required
              placeholder="e.g. 8000"
            />
          </Field>
          {rupees !== "" && delta !== 0 && (
            <p className="text-sm text-muted-foreground">{deltaNote}</p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Skip
            </Button>
            <Button type="submit" disabled={rupees === ""}>
              Review
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

function AddChargeDialog({
  open,
  residentId,
  onClose,
  onDone,
}: {
  open: boolean;
  residentId: string;
  onClose: () => void;
  onDone: () => Promise<void> | void;
}) {
  const toast = useToast();
  const [label, setLabel] = useState("");
  const [rupees, setRupees] = useState("");
  const [frequency, setFrequency] = useState<ChargeFrequency>(
    ChargeFrequency.ONE_TIME,
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setLabel("");
      setRupees("");
      setFrequency(ChargeFrequency.ONE_TIME);
    }
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.charges.create({
        residentId,
        label: label.trim(),
        amountPaise: Math.round(Number(rupees) * 100),
        frequency,
      });
      await onDone();
    } catch (err) {
      toast.error(toMessage(err, "Could not add the charge."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add extra charge"
      description="Bill this resident beyond rent. A monthly charge recurs every invoice until stopped; both fold into the resident's current open invoice when possible."
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="What is this charge for?" htmlFor="charge-label">
          <Input
            id="charge-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            required
            maxLength={120}
            placeholder="e.g. Laundry, extra electricity, late fee"
          />
        </Field>
        <Field label="Amount (₹)" htmlFor="charge-amount">
          <Input
            id="charge-amount"
            type="number"
            min={1}
            step="1"
            value={rupees}
            onChange={(e) => setRupees(e.target.value)}
            required
            placeholder="e.g. 500"
          />
        </Field>
        <Field label="Frequency" htmlFor="charge-frequency">
          <Select
            id="charge-frequency"
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as ChargeFrequency)}
          >
            <option value={ChargeFrequency.ONE_TIME}>One-time</option>
            <option value={ChargeFrequency.MONTHLY}>Every month</option>
          </Select>
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={busy || label.trim() === "" || rupees === ""}
          >
            {busy ? "Saving…" : "Add charge"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

interface DeductionRow {
  reason: string;
  rupees: string;
}

function ApplyDepositDialog({
  open,
  invoices,
  balancePaise,
  onClose,
  onDone,
}: {
  open: boolean;
  invoices: InvoiceSummary[];
  balancePaise: number;
  onClose: () => void;
  onDone: () => Promise<void> | void;
}) {
  const toast = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);

  const apply = async (invoiceId: string) => {
    setBusyId(invoiceId);
    try {
      await api.deposits.applyToInvoice(invoiceId);
      await onDone();
    } catch (err) {
      toast.error(toMessage(err, "Could not apply the deposit to this invoice."));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Apply deposit to rent"
      description="Settle a rent invoice from the held deposit. The invoice is marked paid and the deposit balance drops by that amount."
    >
      <div className="mb-3 flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Deposit balance</span>
        <span className="font-medium">{formatPaise(balancePaise)}</span>
      </div>
      {invoices.length === 0 ? (
        <EmptyRow text="No unpaid invoices to settle." />
      ) : (
        <ul className="max-h-[60vh] divide-y divide-border overflow-y-auto">
          {invoices.map((inv) => {
            const insufficient = balancePaise < inv.amountPaise;
            return (
              <li
                key={inv.id}
                className="flex items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{inv.period}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatPaise(inv.amountPaise)} · {inv.status.toLowerCase()}
                  </p>
                </div>
                <Button
                  size="sm"
                  disabled={busyId !== null || insufficient}
                  onClick={() => apply(inv.id)}
                >
                  {insufficient ? "Balance too low" : "Apply"}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-4 flex justify-end">
        <Button type="button" variant="outline" onClick={onClose}>
          Close
        </Button>
      </div>
    </Dialog>
  );
}

function ExitDialog({
  open,
  residentId,
  deposit,
  priorDeductionsPaise,
  onClose,
  onDone,
}: {
  open: boolean;
  residentId: string;
  deposit: DepositSummary | null;
  priorDeductionsPaise: number;
  onClose: () => void;
  onDone: () => Promise<void> | void;
}) {
  const toast = useToast();
  const [rows, setRows] = useState<DeductionRow[]>([]);
  const [busy, setBusy] = useState(false);
  const canDeduct = deposit?.status === "HELD";
  const heldPaise = canDeduct ? deposit.amountPaise : 0;
  // Rent already paid from the deposit before exit isn't refundable or
  // re-deductible — the refund and the deduction cap are over what's LEFT.
  const availablePaise = Math.max(0, heldPaise - priorDeductionsPaise);

  useEffect(() => {
    if (open) setRows([]);
  }, [open]);

  const totalDeductPaise = rows.reduce(
    (sum, r) => sum + Math.round(Number(r.rupees || 0) * 100),
    0,
  );
  const refundPaise = availablePaise - totalDeductPaise;
  const over = totalDeductPaise > availablePaise;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.deposits.exit({
        residentId,
        deductions: rows
          .filter((r) => r.reason.trim() && Number(r.rupees) > 0)
          .map((r) => ({
            reason: r.reason.trim(),
            amountPaise: Math.round(Number(r.rupees) * 100),
          })),
      });
      await onDone();
    } catch (err) {
      toast.error(toMessage(err, "Could not settle the exit."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Settle exit"
      description="Marks the resident EXITED, frees their bed, and settles the deposit. This cannot be undone."
    >
      <form onSubmit={submit} className="space-y-4">
        {canDeduct ? (
          <>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Deposit held</span>
              <span className="font-medium">{formatPaise(heldPaise)}</span>
            </div>
            {priorDeductionsPaise > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  Already applied to rent
                </span>
                <span className="font-medium">
                  −{formatPaise(priorDeductionsPaise)} ·{" "}
                  {formatPaise(availablePaise)} left
                </span>
              </div>
            )}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Deductions</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setRows((r) => [...r, { reason: "", rupees: "" }])
                  }
                >
                  <Plus className="h-4 w-4" />
                  Add
                </Button>
              </div>
              {rows.map((row, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    value={row.reason}
                    onChange={(e) =>
                      setRows((r) =>
                        r.map((x, j) =>
                          j === i ? { ...x, reason: e.target.value } : x,
                        ),
                      )
                    }
                    placeholder="Reason"
                    aria-label="Deduction reason"
                  />
                  <Input
                    type="number"
                    min={0}
                    value={row.rupees}
                    onChange={(e) =>
                      setRows((r) =>
                        r.map((x, j) =>
                          j === i ? { ...x, rupees: e.target.value } : x,
                        ),
                      )
                    }
                    placeholder="₹"
                    aria-label="Deduction amount in rupees"
                    className="w-28"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setRows((r) => r.filter((_, j) => j !== i))}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between border-t border-border pt-3 text-sm">
              <span className="text-muted-foreground">Refund to resident</span>
              <span
                className={cn(
                  "font-semibold",
                  over ? "text-danger" : "text-success",
                )}
              >
                {over ? "exceeds deposit" : formatPaise(refundPaise)}
              </span>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            No deposit is held for this resident. Settling will mark them exited
            and free their bed.
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="danger" disabled={busy || over}>
            {busy ? "Settling…" : "Settle exit"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function DocViewerDialog({
  doc,
  onClose,
  onApprove,
  onReject,
}: {
  doc: DocumentSummary | null;
  onClose: () => void;
  onApprove: (docId: string) => Promise<void>;
  onReject: (docId: string, note: string) => Promise<void>;
}) {
  const toast = useToast();
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [imgLoading, setImgLoading] = useState(false);
  const [confirm, setConfirm] = useState<null | "approve" | "reupload">(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!doc) {
      setImgUrl(null);
      setConfirm(null);
      setNote("");
      return;
    }
    setImgLoading(true);
    setImgUrl(null);
    setConfirm(null);
    setNote("");
    api.documents
      .download(doc.id)
      .then(({ downloadUrl }) => setImgUrl(downloadUrl))
      .catch(() => toast.error("Could not load document preview."))
      .finally(() => setImgLoading(false));
  }, [doc?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleApprove = async () => {
    if (!doc) return;
    setBusy(true);
    try {
      await onApprove(doc.id);
      onClose();
    } catch (err) {
      toast.error(toMessage(err, "Could not verify the document."));
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async () => {
    if (!doc || !note.trim()) return;
    setBusy(true);
    try {
      await onReject(doc.id, note.trim());
      onClose();
    } catch (err) {
      toast.error(toMessage(err, "Could not request a re-upload."));
    } finally {
      setBusy(false);
    }
  };

  const isPending = doc?.status === "PENDING";

  return (
    <Dialog
      open={doc !== null}
      onClose={onClose}
      title={doc ? doc.type.replace(/_/g, " ").toLowerCase() : "Document"}
      description={doc ? formatDate(doc.createdAt) : undefined}
      className="max-w-3xl"
    >
      {/* Image area */}
      <div className="flex min-h-[300px] items-center justify-center overflow-hidden rounded-lg bg-muted">
        {imgLoading ? (
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand border-t-transparent" />
        ) : imgUrl ? (
          <img
            src={imgUrl}
            alt={doc?.type ?? "document"}
            className="max-h-[60vh] w-full object-contain"
          />
        ) : (
          <p className="text-sm text-muted-foreground">No preview available.</p>
        )}
      </div>

      {/* Status row + actions */}
      <div className="mt-4 space-y-3">
        <div className="flex items-center gap-2">
          <Badge tone={docTone(doc?.status ?? "PENDING")}>
            {doc?.status?.toLowerCase()}
          </Badge>
          {doc?.reviewNote && (
            <span className="text-xs text-muted-foreground">
              Note: {doc.reviewNote}
            </span>
          )}
        </div>

        {isPending && confirm === null && (
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setConfirm("approve")}>
              Approve
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => setConfirm("reupload")}
            >
              Ask for re-upload
            </Button>
          </div>
        )}

        {isPending && confirm === "approve" && (
          <div className="space-y-3 rounded-lg border border-border bg-muted/50 p-4">
            <p className="text-sm font-medium">Approve this document?</p>
            <p className="text-xs text-muted-foreground">
              This will mark the document as verified.
            </p>
            <div className="flex gap-2">
              <Button size="sm" disabled={busy} onClick={handleApprove}>
                {busy ? "Approving…" : "Yes, approve"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirm(null)}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {isPending && confirm === "reupload" && (
          <div className="space-y-3 rounded-lg border border-border bg-muted/50 p-4">
            <p className="text-sm font-medium">Ask for re-upload</p>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Tell the resident what to fix so they can re-upload…"
              rows={3}
              maxLength={500}
              aria-label="Re-upload note for the resident"
            />
            <div className="flex gap-2">
              <Button
                variant="danger"
                size="sm"
                disabled={busy || !note.trim()}
                onClick={handleReject}
              >
                {busy ? "Sending…" : "Send request"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirm(null)}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}

/* ----------------------------------------------------------------- bits --- */

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

function BackLink() {
  return (
    <Link
      href="/residents"
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" />
      All residents
    </Link>
  );
}

function EmptyRow({ text }: { text: string }) {
  return <EmptyState compact title={text} className="py-8" />;
}
