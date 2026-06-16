"use client";

import {
  type AvailableBed,
  type DepositSummary,
  type DepositTransactionSummary,
  type DocumentSummary,
  EmergencyRelation,
  type InvoiceSummary,
  KycStatus,
  OccupationType,
  type ResidentSummary,
  ResidentStatus,
  type TransferRequestSummary,
  sharingLabel,
} from "@pg/shared";
import {
  ArrowLeft,
  ArrowRightLeft,
  BedDouble,
  ChevronDown,
  Download,
  Plus,
  UserPlus,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { cn, formatDate, formatPaise, toMessage } from "@/lib/utils";

const inputClass =
  "flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:border-brand disabled:cursor-not-allowed disabled:opacity-50";

const residentTone = (s: ResidentSummary["status"]) =>
  s === "ACTIVE" ? "success" : s === "UPCOMING" ? "warning" : "neutral";
const docTone = (s: DocumentSummary["status"]) =>
  s === "VERIFIED" ? "success" : s === "REJECTED" ? "danger" : "warning";
const invoiceTone = (s: InvoiceSummary["status"]) =>
  s === "PAID"
    ? "success"
    : s === "OVERDUE"
      ? "danger"
      : s === "WAIVED"
        ? "neutral"
        : "warning";

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

export default function ResidentsPage() {
  return (
    <Suspense fallback={<div className="h-40 animate-pulse rounded bg-muted" />}>
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
  const [items, setItems] = useState<ResidentSummary[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loadFailed, setLoadFailed] = useState(false);
  const [registering, setRegistering] = useState(false);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("CURRENT");
  const [kyc, setKyc] = useState<KycFilter>("ALL");
  const [page, setPage] = useState(1);

  // Debounce free-text search so we don't hit the API on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 600);
    return () => clearTimeout(t);
  }, [searchInput]);

  // A new search or filter invalidates the current page.
  useEffect(() => {
    setPage(1);
  }, [search, status, kyc]);

  const load = useCallback(async () => {
    try {
      const result = await api.residents.list({
        q: search || undefined,
        status,
        kyc,
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
  }, [search, status, kyc, page, toast]);

  useEffect(() => {
    setItems(null);
    void load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);
  const filtered =
    search !== "" || status !== ResidentStatus.ACTIVE || kyc !== "ALL";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Residents</h1>
          <p className="text-sm text-muted-foreground">
            Everyone on record at your PG.
          </p>
        </div>
        <Button size="sm" onClick={() => setRegistering(true)}>
          <UserPlus className="h-4 w-4" />
          Register resident
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search by name or phone…"
          className="max-w-xs"
          aria-label="Search residents"
        />
        <div className="relative w-40">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
            className={cn(inputClass, "w-full appearance-none pr-8")}
            aria-label="Filter by status"
          >
            <option value="CURRENT">Active</option>
            <option value={ResidentStatus.UPCOMING}>Upcoming</option>
            <option value={ResidentStatus.EXITED}>Exited</option>
            <option value="ALL">All</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        </div>
        <div className="relative w-44">
          <select
            value={kyc}
            onChange={(e) => setKyc(e.target.value as KycFilter)}
            className={cn(inputClass, "w-full appearance-none pr-8")}
            aria-label="Filter by KYC status"
          >
            <option value="ALL">All KYC</option>
            <option value="PENDING">KYC pending</option>
            <option value="VERIFIED">KYC verified</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        </div>
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
                            : "No bed"}
                      </span>
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
    }
  }, [open]);

  // The emergency contact is all-or-nothing: once any field is touched, the
  // other two become required (HTML5 + the server's Zod refine both enforce it).
  const ecTouched = Boolean(ecName.trim() || ecRelation || ecPhone.trim());

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const created = await api.residents.register({
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        age: Number(age),
        occupationType,
        nativePlace: nativePlace.trim() || undefined,
        emergencyContactName: ecTouched ? ecName.trim() : undefined,
        emergencyContactRelation: ecTouched
          ? (ecRelation as EmergencyRelation)
          : undefined,
        emergencyContactPhone: ecTouched ? ecPhone.trim() : undefined,
      });
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
      description="Add a new resident to your PG. You can assign a bed afterwards."
    >
      <form onSubmit={submit} className="space-y-4">
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
              onChange={(e) => setPhone(e.target.value)}
              required
              inputMode="tel"
              pattern="(\+91)?[6-9]\d{9}"
              title="A valid 10-digit Indian mobile number, optionally prefixed with +91"
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
            <select
              id="r-occ"
              value={occupationType}
              onChange={(e) =>
                setOccupationType(e.target.value as OccupationType)
              }
              className={inputClass}
            >
              {Object.values(OccupationType).map((o) => (
                <option key={o} value={o}>
                  {o.charAt(0) + o.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Native place (optional)" htmlFor="r-native">
            <Input
              id="r-native"
              value={nativePlace}
              onChange={(e) => setNativePlace(e.target.value)}
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
            <select
              id="r-ec-rel"
              value={ecRelation}
              onChange={(e) =>
                setEcRelation(e.target.value as EmergencyRelation | "")
              }
              required={ecTouched}
              className={inputClass}
            >
              <option value="">Select relation…</option>
              {Object.values(EmergencyRelation).map((r) => (
                <option key={r} value={r}>
                  {r.charAt(0) + r.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
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

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "Registering…" : "Register"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/* ---------------------------------------------------------------- detail --- */

interface DetailData {
  resident: ResidentSummary;
  documents: DocumentSummary[];
  deposit: DepositSummary | null;
  ledger: DepositTransactionSummary[];
  invoices: InvoiceSummary[];
  transfers: TransferRequestSummary[];
}

function ResidentDetail({ id }: { id: string }) {
  const toast = useToast();
  const [data, setData] = useState<DetailData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [allocating, setAllocating] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const [rejectingDoc, setRejectingDoc] = useState<DocumentSummary | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [resident, allDocs, dep, invoiceList, allTransfers] =
      await Promise.all([
        api.residents.get(id),
        api.documents.list(),
        api.deposits.byResident(id),
        api.invoices.list({ residentId: id, limit: 100 }),
        api.allocations.transfers.list(),
      ]);
    setData({
      resident,
      documents: allDocs.filter((d) => d.residentId === id),
      deposit: dep.deposit,
      ledger: dep.ledger,
      invoices: invoiceList.items,
      transfers: allTransfers.filter((t) => t.residentId === id),
    });
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [resident, allDocs, dep, invoiceList, allTransfers] =
          await Promise.all([
            api.residents.get(id),
            api.documents.list(),
            api.deposits.byResident(id),
            api.invoices.list({ residentId: id, limit: 100 }),
            api.allocations.transfers.list(),
          ]);
        if (cancelled) return;
        setData({
          resident,
          documents: allDocs.filter((d) => d.residentId === id),
          deposit: dep.deposit,
          ledger: dep.ledger,
          invoices: invoiceList.items,
          transfers: allTransfers.filter((t) => t.residentId === id),
        });
      } catch (err) {
        if (!cancelled) setLoadError(toMessage(err, "Could not load resident."));
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

  const verifyDoc = async (docId: string) => {
    setBusy(true);
    try {
      await api.documents.verify(docId);
      await load();
    } catch (err) {
      toast.error(toMessage(err, "Could not verify the document."));
    } finally {
      setBusy(false);
    }
  };

  const downloadDoc = async (docId: string) => {
    try {
      const { downloadUrl } = await api.documents.download(docId);
      window.open(downloadUrl, "_blank", "noopener");
    } catch (err) {
      toast.error(toMessage(err, "Could not open the document."));
    }
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
        <div className="h-40 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  const { resident, documents, deposit, ledger, invoices, transfers } = data;
  const active = resident.status === "ACTIVE";
  const pendingTransfer = transfers.find((t) => t.status === "PENDING") ?? null;

  return (
    <div className="space-y-6">
      <BackLink />

      {/* Header */}
      <Card>
        <CardContent className="flex flex-wrap items-start justify-between gap-4 pt-5">
          <div>
            <div className="flex items-center gap-2">
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
          </div>
        </CardContent>
      </Card>

      {/* Emergency contact */}
      {resident.emergencyContactName && (
        <Card>
          <CardHeader>
            <CardTitle>Emergency contact</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">
              <span className="font-medium">
                {resident.emergencyContactName}
              </span>
              {resident.emergencyContactRelation
                ? ` · ${resident.emergencyContactRelation.toLowerCase()}`
                : ""}
              {resident.emergencyContactPhone
                ? ` · ${resident.emergencyContactPhone}`
                : ""}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Allocation */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Bed allocation</CardTitle>
          {active &&
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
            ))}
        </CardHeader>
        <CardContent>
          <p className="text-sm">
            {resident.bedLabel ? (
              <span className="font-medium">
                {resident.bedLabel}
                {resident.roomCapacity != null
                  ? ` · ${sharingLabel(resident.roomCapacity)}`
                  : ""}
              </span>
            ) : (
              <span className="text-muted-foreground">
                Not assigned to a bed.
              </span>
            )}
          </p>

          {pendingTransfer && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-muted/40 p-3">
              <div className="min-w-0 text-sm">
                <p className="font-medium">
                  Pending move → bed {pendingTransfer.toBedLabel}
                </p>
                <p className="text-xs text-muted-foreground">
                  planned {formatDate(pendingTransfer.plannedDate)} · executing
                  splits this month&apos;s rent and credits/charges the
                  difference on the next invoice
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
                      onClick={() => downloadDoc(d.id)}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    {d.status === "PENDING" && (
                      <>
                        <Button
                          size="sm"
                          disabled={busy}
                          onClick={() => verifyDoc(d.id)}
                        >
                          Verify
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          disabled={busy}
                          onClick={() => setRejectingDoc(d)}
                        >
                          Ask for re-upload
                        </Button>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Deposit */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Security deposit</CardTitle>
          <div className="flex gap-2">
            {!deposit && active && (
              <Button size="sm" onClick={() => setDepositOpen(true)}>
                <Plus className="h-4 w-4" />
                Record deposit
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
        </CardHeader>
        <CardContent>
          {deposit ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium">
                  {formatPaise(deposit.amountPaise)}
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
                        {t.reason ? ` · ${t.reason}` : ""}
                      </span>
                      <span
                        className={cn(
                          "font-medium",
                          t.type === "REFUND" ? "text-success" : "text-danger",
                        )}
                      >
                        {t.type === "REFUND" ? "+" : "−"}
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

      {/* Rent invoices */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Rent invoices</CardTitle>
          {invoices.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {formatPaise(
                invoices
                  .filter((i) => i.status === "PAID")
                  .reduce((sum, i) => sum + i.amountPaise, 0),
              )}{" "}
              paid of{" "}
              {formatPaise(
                invoices.reduce((sum, i) => sum + i.amountPaise, 0),
              )}{" "}
              billed
            </span>
          )}
        </CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <EmptyRow text="No invoices yet. Generate rent from the Rent page." />
          ) : (
            <ul className="divide-y divide-border">
              {invoices.map((inv) => (
                <li
                  key={inv.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{inv.period}</p>
                    <p className="text-xs text-muted-foreground">
                      due {formatDate(inv.dueDate)}
                    </p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums">
                    {formatPaise(inv.amountPaise)}
                  </span>
                  <Badge tone={invoiceTone(inv.status)}>
                    {inv.status.toLowerCase()}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <AllocateDialog
        open={allocating}
        residentId={id}
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
        onDone={async () => {
          setTransferring(false);
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
      <ExitDialog
        open={exitOpen}
        residentId={id}
        deposit={deposit}
        onClose={() => setExitOpen(false)}
        onDone={async () => {
          setExitOpen(false);
          await refresh();
        }}
      />
      <RejectDocDialog
        doc={rejectingDoc}
        onClose={() => setRejectingDoc(null)}
        onDone={async () => {
          setRejectingDoc(null);
          await refresh();
        }}
      />
    </div>
  );
}

function AllocateDialog({
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
  const [beds, setBeds] = useState<AvailableBed[] | null>(null);
  const [busyBed, setBusyBed] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setBeds(null);
    (async () => {
      try {
        const list = await api.allocations.suggestions(residentId);
        if (!cancelled) setBeds(list);
      } catch (err) {
        if (!cancelled) toast.error(toMessage(err, "Could not load vacant beds."));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, residentId, toast]);

  const pick = async (bedId: string) => {
    setBusyBed(bedId);
    try {
      await api.allocations.allocate({ bedId, residentId });
      await onDone();
    } catch (err) {
      toast.error(toMessage(err, "Could not allocate the bed."));
    } finally {
      setBusyBed(null);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Allocate to a bed"
      description="Vacant beds, ranked by fit. Pick one to assign this resident."
    >
      {beds === null ? (
        <ListSkeleton />
      ) : beds.length === 0 ? (
        <EmptyRow text="No vacant beds available." />
      ) : (
        <ul className="max-h-[60vh] divide-y divide-border overflow-y-auto">
          {beds.map((b) => (
            <li
              key={b.bedId}
              className="flex flex-wrap items-center justify-between gap-3 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {b.roomLabel} · {b.bedLabel}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatPaise(b.monthlyRentPaise)}/mo · {sharingLabel(b.capacity)}
                  {b.matchReasons.length > 0
                    ? ` · ${b.matchReasons.join(", ")}`
                    : ""}
                </p>
              </div>
              <Button
                size="sm"
                disabled={busyBed === b.bedId}
                onClick={() => pick(b.bedId)}
              >
                Assign
              </Button>
            </li>
          ))}
        </ul>
      )}
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
  onDone,
}: {
  open: boolean;
  residentId: string;
  currentBedLabel: string | null;
  onClose: () => void;
  onDone: () => Promise<void> | void;
}) {
  const toast = useToast();
  const [beds, setBeds] = useState<AvailableBed[] | null>(null);
  const [selectedBedId, setSelectedBedId] = useState<string | null>(null);
  const [plannedDate, setPlannedDate] = useState(ymdToday());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setBeds(null);
    setSelectedBedId(null);
    setPlannedDate(ymdToday());
    (async () => {
      try {
        const list = await api.allocations.suggestions(residentId);
        if (!cancelled) setBeds(list);
      } catch (err) {
        if (!cancelled)
          toast.error(toMessage(err, "Could not load vacant beds."));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, residentId, toast]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBedId) return;
    setBusy(true);
    try {
      await api.allocations.transfers.create({
        residentId,
        toBedId: selectedBedId,
        plannedDate,
      });
      await onDone();
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
          ? `Currently in ${currentBedLabel}. Pre-book a move — the bed stays available until you execute it on the move day.`
          : undefined
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {beds === null ? (
          <ListSkeleton />
        ) : beds.length === 0 ? (
          <EmptyRow text="No vacant beds available to move into." />
        ) : (
          <ul className="max-h-[45vh] divide-y divide-border overflow-y-auto">
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

interface DeductionRow {
  reason: string;
  rupees: string;
}

function ExitDialog({
  open,
  residentId,
  deposit,
  onClose,
  onDone,
}: {
  open: boolean;
  residentId: string;
  deposit: DepositSummary | null;
  onClose: () => void;
  onDone: () => Promise<void> | void;
}) {
  const toast = useToast();
  const [rows, setRows] = useState<DeductionRow[]>([]);
  const [busy, setBusy] = useState(false);
  const canDeduct = deposit?.status === "HELD";
  const heldPaise = canDeduct ? deposit.amountPaise : 0;

  useEffect(() => {
    if (open) setRows([]);
  }, [open]);

  const totalDeductPaise = rows.reduce(
    (sum, r) => sum + Math.round(Number(r.rupees || 0) * 100),
    0,
  );
  const refundPaise = heldPaise - totalDeductPaise;
  const over = totalDeductPaise > heldPaise;

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
                  <input
                    value={row.reason}
                    onChange={(e) =>
                      setRows((r) =>
                        r.map((x, j) =>
                          j === i ? { ...x, reason: e.target.value } : x,
                        ),
                      )
                    }
                    placeholder="Reason"
                    className={inputClass}
                  />
                  <input
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
                    className={cn(inputClass, "w-28")}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setRows((r) => r.filter((_, j) => j !== i))
                    }
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

function RejectDocDialog({
  doc,
  onClose,
  onDone,
}: {
  doc: DocumentSummary | null;
  onClose: () => void;
  onDone: () => Promise<void> | void;
}) {
  const toast = useToast();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setNote("");
  }, [doc?.id]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!doc) return;
    setBusy(true);
    try {
      await api.documents.reject(doc.id, note.trim());
      await onDone();
    } catch (err) {
      toast.error(toMessage(err, "Could not request a re-upload."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={doc !== null}
      onClose={onClose}
      title="Ask for re-upload"
      description={doc ? doc.type.replace("_", " ").toLowerCase() : undefined}
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="What needs fixing?" htmlFor="doc-note">
          <textarea
            id="doc-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            required
            maxLength={500}
            rows={3}
            placeholder="Tell the resident what to fix so they can re-upload…"
            className={inputClass}
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="danger"
            disabled={busy || note.trim() === ""}
          >
            Ask for re-upload
          </Button>
        </div>
      </form>
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

function ListSkeleton() {
  return (
    <div className="space-y-3 py-1">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-12 animate-pulse rounded bg-muted" />
      ))}
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <p className="py-8 text-center text-sm text-muted-foreground">{text}</p>
  );
}
