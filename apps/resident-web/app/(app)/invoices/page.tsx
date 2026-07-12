"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";

import { Appbar } from "@/components/ui/appbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FilePicker, type FilePickerHandle } from "@/components/ui/file-picker";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { PressableScale } from "@/components/ui/pressable-scale";
import { Screen } from "@/components/ui/screen";
import { Segmented } from "@/components/ui/segmented";
import { Sheet } from "@/components/ui/sheet";
import { invoiceBadge, paymentStatus } from "@/components/ui/status";
import { AppText } from "@/components/ui/text";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import {
  qk,
  useInvoiceCharges,
  useInvoicePayments,
  useInvoices,
  usePaymentInfo,
} from "@/lib/queries";
import {
  MAX_UPLOAD_LABEL,
  contentTypeOf,
  downloadCrossOrigin,
  exceedsMaxSize,
  shareImage,
  uploadToPresignedPost,
} from "@/lib/upload";
import { formatDate, formatPaise, formatPeriod, toMessage } from "@/lib/utils";
import {
  InvoiceStatus,
  PaymentMethod,
  PaymentStatus,
  type ResidentPayment,
} from "@pg/shared";

export default function InvoiceDetailPage() {
  return (
    <Suspense fallback={null}>
      <InvoiceDetail />
    </Suspense>
  );
}

function InvoiceDetail() {
  const id = useSearchParams().get("id") ?? "";
  const queryClient = useQueryClient();
  const { data } = useInvoices();
  const invoice = data?.find((i) => i.id === id);

  const { data: paymentInfo } = usePaymentInfo();
  const { data: charges } = useInvoiceCharges(id);
  const { data: payments } = useInvoicePayments(id);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>(PaymentMethod.UPI);
  const [picked, setPicked] = useState<File | null>(null);
  const [reference, setReference] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sharing, setSharing] = useState(false);
  // QR is collapsed by default — most residents just copy the UPI ID; the QR is
  // a fallback and its large image is what makes the drawer tall.
  const [showQr, setShowQr] = useState(false);
  const galleryRef = useRef<FilePickerHandle>(null);
  const cameraRef = useRef<FilePickerHandle>(null);

  // Preview URL for the picked screenshot (revoked on change/unmount).
  const pickedUrl = useMemo(
    () => (picked ? URL.createObjectURL(picked) : null),
    [picked],
  );
  useEffect(() => {
    return () => {
      if (pickedUrl) URL.revokeObjectURL(pickedUrl);
    };
  }, [pickedUrl]);

  async function copyUpiId() {
    if (!paymentInfo?.upiId) return;
    try {
      await navigator.clipboard.writeText(paymentInfo.upiId);
      toast.success("UPI ID copied.");
    } catch {
      toast.error("Could not copy — long-press the ID to copy it.");
    }
  }

  async function saveQr() {
    if (!paymentInfo?.upiQrUrl) return;
    setSaving(true);
    try {
      await downloadCrossOrigin(paymentInfo.upiQrUrl, "upi-qr.png");
    } finally {
      setSaving(false);
    }
  }

  async function shareQr() {
    if (!paymentInfo?.upiQrUrl) return;
    setSharing(true);
    try {
      const ok = await shareImage(paymentInfo.upiQrUrl, "upi-qr.png", "UPI QR code");
      if (!ok) toast.error("Sharing isn't available here — save the QR instead.");
    } finally {
      setSharing(false);
    }
  }

  if (!invoice) {
    return (
      <Screen>
        <Appbar title="Invoice" />
        <AppText variant="body" className="text-ink2">
          Invoice not found.
        </AppText>
      </Screen>
    );
  }

  const deleted = Boolean(invoice.deletedAt);
  const underReview = invoice.underReview && !deleted;
  const status = invoiceBadge(invoice.status, underReview);
  // A payment already awaiting review blocks re-submitting until the manager
  // decides — if they reject it, `underReview` drops and the invoice is payable
  // again with no state change of its own.
  const payable =
    !deleted &&
    !underReview &&
    (invoice.status === InvoiceStatus.PENDING ||
      invoice.status === InvoiceStatus.OVERDUE);

  function choose(file: File) {
    if (exceedsMaxSize(file.size)) {
      toast.error(`Image too large — please choose one under ${MAX_UPLOAD_LABEL}.`);
      return;
    }
    setPicked(file);
  }

  const refTrimmed = reference.trim();
  const isCash = method === PaymentMethod.CASH;
  // Cash needs no proof; UPI needs at least one — a screenshot OR a reference
  // number (some apps block screenshots of the success screen).
  const canSubmit = isCash || Boolean(picked) || refTrimmed.length >= 6;

  function resetSheet() {
    setSheetOpen(false);
    setMethod(PaymentMethod.UPI);
    setPicked(null);
    setReference("");
    setShowQr(false);
  }

  async function submit() {
    if (!invoice || !canSubmit) return;
    setSubmitting(true);
    try {
      if (isCash) {
        await api.resident.payments.submit({
          invoiceId: invoice.id,
          method: PaymentMethod.CASH,
        });
      } else {
        let screenshotKey: string | undefined;
        if (picked) {
          const contentType = contentTypeOf(picked);
          const post = await api.resident.payments.uploadUrl({
            invoiceId: invoice.id,
            contentType,
          });
          const ok = await uploadToPresignedPost(post, picked);
          if (!ok) throw new Error("Upload failed. Please try a smaller image.");
          screenshotKey = post.key;
        }
        await api.resident.payments.submit({
          invoiceId: invoice.id,
          method: PaymentMethod.UPI,
          screenshotKey,
          referenceId: refTrimmed || undefined,
        });
      }
      await queryClient.invalidateQueries({ queryKey: qk.invoices });
      await queryClient.invalidateQueries({ queryKey: qk.invoicePayments(invoice.id) });
      resetSheet();
      toast.success(
        isCash
          ? "Submitted — your manager will confirm the cash payment."
          : "Payment submitted for review.",
      );
    } catch (err) {
      toast.error(toMessage(err, "Could not submit. Please try again."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen contentClassName="gap-4">
      <Appbar title="Invoice" />

      {/* Amount hero */}
      <Card>
        <div className="flex flex-row items-center justify-between">
          <AppText variant="caption" className="uppercase tracking-wider">
            {formatPeriod(invoice.period)} · Rent
          </AppText>
          {deleted ? (
            <Badge label="Cancelled" variant="neutral" />
          ) : (
            <Badge label={status.label} variant={status.variant} />
          )}
        </div>
        <AppText variant="display" className="mt-2 text-[34px] leading-[40px]">
          {formatPaise(invoice.amountPaise)}
        </AppText>
        <AppText variant="sub" className="mt-0.5">
          Due {formatDate(invoice.dueDate)}
        </AppText>

        {charges && charges.length > 0 ? (
          <>
            <div className="my-3 h-px bg-line2" />
            <div className="flex flex-col gap-1.5">
              {/* "Rent & adjustments" is the remainder — it also covers proration
                  and any transfer/carry-forward corrections. */}
              <div className="flex flex-row items-center justify-between">
                <AppText variant="sub">Rent &amp; adjustments</AppText>
                <AppText variant="sub" className="text-ink">
                  {formatPaise(
                    invoice.amountPaise -
                      charges.reduce((s, c) => s + c.amountPaise, 0),
                  )}
                </AppText>
              </div>
              {charges.map((c) => (
                <div key={c.id} className="flex flex-row items-center justify-between">
                  <AppText variant="sub">{c.label}</AppText>
                  <AppText variant="sub" className="text-ink">
                    {formatPaise(c.amountPaise)}
                  </AppText>
                </div>
              ))}
            </div>
          </>
        ) : null}
      </Card>

      {/* Payment(s) the resident submitted for this invoice — mode (UPI/cash),
          the UPI reference, and the proof screenshot. Newest first, so the
          current attempt leads and any earlier rejected try sits below it. */}
      {payments && payments.length > 0
        ? payments.map((p, i) => <PaymentCard key={p.id} payment={p} first={i === 0} />)
        : null}

      {deleted ? (
        <Card className="bg-surface2">
          <AppText variant="caption" className="uppercase tracking-wider">
            Invoice cancelled
          </AppText>
          <AppText variant="sub" className="mt-1.5 leading-5">
            Your manager cancelled this invoice
            {invoice.deletedReason ? `: ${invoice.deletedReason}` : "."} Nothing is owed — no
            payment is needed.
          </AppText>
        </Card>
      ) : underReview ? (
        <Card className="flex-row items-start gap-3 bg-surface2">
          <Icon name="hourglass-outline" size={20} className="mt-0.5 shrink-0 text-info" />
          <div className="min-w-0 flex-1">
            <AppText variant="caption" className="uppercase tracking-wider">
              Payment under review
            </AppText>
            <AppText variant="sub" className="mt-1.5 leading-5">
              You&apos;ve submitted a payment for this invoice. Your manager is confirming it —
              once approved it&apos;ll show as paid. If it&apos;s rejected, you can submit again
              here.
            </AppText>
          </div>
        </Card>
      ) : payable ? (
        <Card className="bg-surface2">
          <AppText variant="caption" className="uppercase tracking-wider">
            How to pay
          </AppText>
          <AppText variant="sub" className="mt-1.5 leading-5">
            Pay the amount to your PG by UPI or in cash. For UPI, submit a screenshot or your
            reference number; for cash, just tap &ldquo;Paid by cash&rdquo;. Your manager reviews
            and approves it.
          </AppText>
        </Card>
      ) : null}

      {payable ? <Button title="Submit payment" onClick={() => setSheetOpen(true)} /> : null}

      <Sheet
        visible={sheetOpen}
        onClose={resetSheet}
        title="Submit payment"
        subtitle={`How did you pay ${formatPaise(invoice.amountPaise)}?`}
      >
        <Segmented<PaymentMethod>
          options={[
            { label: "Pay by UPI", value: PaymentMethod.UPI },
            { label: "Paid by cash", value: PaymentMethod.CASH },
          ]}
          value={method}
          onChange={setMethod}
        />

        {/* Where to send the money — only relevant when paying by UPI. Compact
            by default: a copiable UPI ID row with the QR tucked behind a toggle. */}
        {!isCash && (paymentInfo?.upiId || paymentInfo?.upiQrUrl) ? (
          <div className="flex flex-col gap-2.5 rounded-tile border border-line bg-surface2 p-4">
            <AppText variant="caption" className="uppercase tracking-wider">
              Pay to
            </AppText>

            {paymentInfo?.upiId ? (
              <PressableScale
                onClick={copyUpiId}
                aria-label={`Copy UPI ID ${paymentInfo.upiId}`}
                className="flex w-full flex-row items-center gap-3 rounded-tile border border-line bg-surface p-3"
              >
                <div className="min-w-0 flex-1">
                  <AppText variant="body" className="text-ink" numberOfLines={1}>
                    {paymentInfo.upiId}
                  </AppText>
                  <AppText variant="caption" className="text-ink3">
                    Tap to copy
                  </AppText>
                </div>
                <Icon name="copy-outline" size={20} className="shrink-0 text-brand-deep" />
              </PressableScale>
            ) : null}

            {paymentInfo?.upiQrUrl ? (
              showQr ? (
                <div className="flex flex-col items-center gap-2.5 pt-0.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={paymentInfo.upiQrUrl}
                    alt="UPI QR code"
                    className="h-44 w-44 rounded-lg object-contain"
                  />
                  <div className="flex w-full flex-row gap-2">
                    <QrAction
                      icon="download-outline"
                      label={saving ? "Saving…" : "Save"}
                      disabled={saving || sharing}
                      onPress={saveQr}
                    />
                    <QrAction
                      icon="share-outline"
                      label={sharing ? "Opening…" : "Share"}
                      disabled={saving || sharing}
                      onPress={shareQr}
                    />
                  </div>
                </div>
              ) : (
                <PressableScale
                  onClick={() => setShowQr(true)}
                  aria-label="Show QR code"
                  className="flex w-full flex-row items-center justify-center gap-2 rounded-btn border border-line bg-surface py-2.5 text-brand-deep"
                >
                  <Icon name="qr-code-outline" size={16} />
                  <AppText variant="label" className="text-brand-deep">
                    Show QR code
                  </AppText>
                </PressableScale>
              )
            ) : null}
          </div>
        ) : null}

        {isCash ? (
          <div className="rounded-tile border border-line bg-surface2 p-3">
            <AppText variant="sub" className="leading-5">
              You paid your manager in cash. Submit this so they can confirm receipt and mark the
              invoice paid. No screenshot needed.
            </AppText>
          </div>
        ) : (
          // Grouped panel so the screenshot pickers + reference read as proof
          // belonging to the UPI choice above — not a peer set of boxes.
          <div className="flex flex-col gap-3 rounded-tile border border-line bg-surface2 p-3.5">
            <AppText variant="caption" className="uppercase tracking-wider">
              Add payment proof
            </AppText>
            {picked && pickedUrl ? (
              <div className="flex flex-row items-center gap-3 rounded-tile border border-line bg-surface p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={pickedUrl}
                  alt="Payment screenshot"
                  className="h-12 w-12 rounded-lg object-cover"
                />
                <AppText variant="sub" className="min-w-0 flex-1 text-ink" numberOfLines={1}>
                  {picked.name}
                </AppText>
                <PressableScale
                  onClick={() => setPicked(null)}
                  aria-label="Remove screenshot"
                  className="flex h-9 w-9 items-center justify-center text-ink3"
                >
                  <Icon name="close-circle" size={22} />
                </PressableScale>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <AppText variant="sub">Upload a screenshot of your UPI payment.</AppText>
                <div className="flex flex-row gap-3">
                  <PickButton
                    icon="image-outline"
                    label="Gallery"
                    onPress={() => galleryRef.current?.open()}
                  />
                  <PickButton
                    icon="camera-outline"
                    label="Camera"
                    onPress={() => cameraRef.current?.open()}
                  />
                </div>
                <AppText variant="caption" className="text-center text-[12px]">
                  JPG, PNG or WebP · max {MAX_UPLOAD_LABEL}
                </AppText>
              </div>
            )}

            <div className="flex flex-row items-center gap-3">
              <span className="h-px flex-1 bg-line" />
              <AppText variant="caption" className="text-[12px]">
                OR enter reference
              </AppText>
              <span className="h-px flex-1 bg-line" />
            </div>

            <Input
              label="UPI reference number"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="e.g. 4012 3456 7890"
              autoCapitalize="characters"
              autoCorrect="off"
              hint="Can't screenshot? Copy the UPI transaction / reference ID (UTR) from your UPI app's payment history."
            />
          </div>
        )}

        <Button
          title={isCash ? "Submit cash payment" : "Submit for review"}
          onClick={submit}
          loading={submitting}
          disabled={!canSubmit}
        />
      </Sheet>

      <FilePicker ref={galleryRef} accept="image/jpeg,image/png,image/webp" onPick={choose} />
      <FilePicker ref={cameraRef} accept="image/*" capture="environment" onPick={choose} />
    </Screen>
  );
}

function PaymentCard({ payment, first }: { payment: ResidentPayment; first: boolean }) {
  const badge = paymentStatus(payment.status);
  const isCash = payment.method === PaymentMethod.CASH;
  const isRejected = payment.status === PaymentStatus.REJECTED;

  return (
    <Card>
      <div className="flex flex-row items-center justify-between">
        <AppText variant="caption" className="uppercase tracking-wider">
          {first ? "Your payment" : "Earlier attempt"}
        </AppText>
        <Badge label={badge.label} variant={badge.variant} />
      </div>

      <div className="mt-3 flex flex-col gap-2.5">
        <DetailRow
          icon={isCash ? "cash-outline" : "phone-portrait-outline"}
          label="Paid by"
          value={isCash ? "Cash" : "UPI"}
        />
        <DetailRow icon="wallet-outline" label="Amount" value={formatPaise(payment.amountPaise)} />
        {payment.referenceId ? (
          <DetailRow icon="receipt-outline" label="UPI reference" value={payment.referenceId} />
        ) : null}
        <DetailRow icon="time-outline" label="Submitted" value={formatDate(payment.createdAt)} />
      </div>

      {isRejected && payment.reviewNote ? (
        <div className="mt-3 rounded-tile border border-line bg-surface2 p-3">
          <AppText variant="caption" className="uppercase tracking-wider">
            Reason
          </AppText>
          <AppText variant="sub" className="mt-1 leading-5">
            {payment.reviewNote}
          </AppText>
        </div>
      ) : null}

      {payment.screenshotUrl ? (
        <div className="mt-3 flex flex-col gap-1.5">
          <AppText variant="caption" className="uppercase tracking-wider">
            Payment proof
          </AppText>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={payment.screenshotUrl}
            alt="Payment proof"
            className="h-64 w-full rounded-tile bg-surface2 object-contain"
          />
        </div>
      ) : null}
    </Card>
  );
}

function DetailRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex flex-row items-center gap-3">
      <Icon name={icon} size={16} className="shrink-0 text-ink3" />
      <AppText variant="sub" className="flex-1">
        {label}
      </AppText>
      <AppText variant="sub" className="text-ink">
        {value}
      </AppText>
    </div>
  );
}

function QrAction({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: string;
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <PressableScale
      onClick={onPress}
      disabled={disabled}
      className={`flex flex-1 flex-row items-center justify-center gap-1.5 rounded-btn border border-line bg-surface py-2.5 text-brand-deep ${disabled ? "opacity-40" : ""}`}
    >
      <Icon name={icon} size={16} />
      <AppText variant="label" className="text-brand-deep">
        {label}
      </AppText>
    </PressableScale>
  );
}

function PickButton({
  icon,
  label,
  onPress,
}: {
  icon: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <PressableScale
      onClick={onPress}
      className="flex min-h-[48px] flex-1 flex-row items-center justify-center gap-2 rounded-btn border border-line bg-surface py-3 text-brand-deep"
    >
      <Icon name={icon} size={20} />
      <AppText variant="label" className="text-ink2">
        {label}
      </AppText>
    </PressableScale>
  );
}
