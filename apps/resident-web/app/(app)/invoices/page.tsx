"use client";

import { InvoiceStatus, PaymentMethod } from "@pg/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

import { Appbar } from "@/components/ui/appbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FilePicker, type FilePickerHandle } from "@/components/ui/file-picker";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Screen } from "@/components/ui/screen";
import { Sheet } from "@/components/ui/sheet";
import { invoiceStatus } from "@/components/ui/status";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { qk, useInvoiceCharges, useInvoices, usePaymentInfo } from "@/lib/queries";
import {
  contentTypeOf,
  downloadCrossOrigin,
  exceedsMaxSize,
  MAX_UPLOAD_LABEL,
  shareImage,
  uploadToPresignedPost,
} from "@/lib/upload";
import { cn, formatDate, formatPaise, formatPeriod, toMessage } from "@/lib/utils";

export default function InvoiceDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-full bg-page">
          <Appbar title="Invoice" />
        </div>
      }
    >
      <InvoiceDetail />
    </Suspense>
  );
}

function InvoiceDetail() {
  const id = useSearchParams().get("id") ?? "";
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data } = useInvoices();
  const invoice = data?.find((i) => i.id === id);

  const { data: paymentInfo } = usePaymentInfo();
  const { data: charges } = useInvoiceCharges(id);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>(PaymentMethod.UPI);
  const [picked, setPicked] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [reference, setReference] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [busyQr, setBusyQr] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const galleryPicker = useRef<FilePickerHandle>(null);
  const cameraPicker = useRef<FilePickerHandle>(null);

  useEffect(() => {
    setCanShare(typeof navigator !== "undefined" && !!navigator.share);
  }, []);

  // Preview object URL lifecycle.
  useEffect(() => {
    if (!picked) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(picked);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [picked]);

  if (!invoice) {
    return (
      <div className="min-h-full bg-page">
        <Appbar title="Invoice" />
        <p className="px-4 text-ink2">Invoice not found.</p>
      </div>
    );
  }

  const status = invoiceStatus(invoice.status);
  const deleted = Boolean(invoice.deletedAt);
  const payable =
    !deleted &&
    (invoice.status === InvoiceStatus.PENDING ||
      invoice.status === InvoiceStatus.OVERDUE);

  function choose(file: File) {
    if (exceedsMaxSize(file.size)) {
      toast.error(`Please choose an image under ${MAX_UPLOAD_LABEL}.`);
      return;
    }
    setPicked(file);
  }

  async function saveQr() {
    if (!paymentInfo?.upiQrUrl) return;
    setBusyQr(true);
    try {
      await downloadCrossOrigin(paymentInfo.upiQrUrl, "upi-qr.png");
    } finally {
      setBusyQr(false);
    }
  }

  async function shareQr() {
    if (!paymentInfo?.upiQrUrl) return;
    setBusyQr(true);
    try {
      const ok = await shareImage(paymentInfo.upiQrUrl, "upi-qr.png", "UPI QR code");
      if (!ok) toast.error("Sharing isn't available on this device.");
    } finally {
      setBusyQr(false);
    }
  }

  const refTrimmed = reference.trim();
  const isCash = method === PaymentMethod.CASH;
  // Cash needs no proof; UPI needs a screenshot OR a reference number.
  const canSubmit = isCash || Boolean(picked) || refTrimmed.length >= 6;

  function resetSheet() {
    setSheetOpen(false);
    setMethod(PaymentMethod.UPI);
    setPicked(null);
    setReference("");
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
      resetSheet();
      toast.success(
        isCash
          ? "Your manager will confirm the cash payment."
          : "Your payment is awaiting manager approval.",
      );
    } catch (err) {
      toast.error(toMessage(err, "Could not submit. Please try again."));
    } finally {
      setSubmitting(false);
    }
  }

  const chargesTotal = charges?.reduce((s, c) => s + c.amountPaise, 0) ?? 0;

  return (
    <div className="min-h-full bg-page">
      <Appbar title="Invoice" />
      <Screen contentClassName="flex flex-col gap-4 pt-1">
        <Card>
          <div className="flex flex-row items-center justify-between">
            <span className="text-[15px] font-bold text-ink">
              {formatPeriod(invoice.period)}
            </span>
            {deleted ? (
              <Badge label="Cancelled" variant="neutral" />
            ) : (
              <Badge label={status.label} variant={status.variant} />
            )}
          </div>
          <div className="my-3 h-px bg-line2" />
          {charges && charges.length > 0 ? (
            <div className="mb-3 flex flex-col gap-1.5">
              <div className="flex flex-row items-center justify-between">
                <span className="text-[13px] text-ink2">Rent &amp; adjustments</span>
                <span className="text-[13px] text-ink">
                  {formatPaise(invoice.amountPaise - chargesTotal)}
                </span>
              </div>
              {charges.map((c) => (
                <div
                  key={c.id}
                  className="flex flex-row items-center justify-between"
                >
                  <span className="text-[13px] text-ink2">{c.label}</span>
                  <span className="text-[13px] text-ink">
                    {formatPaise(c.amountPaise)}
                  </span>
                </div>
              ))}
              <div className="my-1.5 h-px bg-line2" />
            </div>
          ) : null}
          <div className="flex flex-row items-center justify-between">
            <span className="text-[13px] text-ink2">Total payable</span>
            <span className="text-[22px] font-extrabold text-ink">
              {formatPaise(invoice.amountPaise)}
            </span>
          </div>
          <p className="mt-1 text-[13px] text-ink2">
            Due {formatDate(invoice.dueDate)}
          </p>
        </Card>

        {deleted ? (
          <Card className="bg-surface2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-ink3">
              Invoice cancelled
            </p>
            <p className="mt-1.5 text-[13px] leading-5 text-ink2">
              Your manager cancelled this invoice
              {invoice.deletedReason ? `: ${invoice.deletedReason}` : "."} Nothing
              is owed — no payment is needed.
            </p>
          </Card>
        ) : (
          <Card className="bg-surface2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-ink3">
              How to pay
            </p>
            <p className="mt-1.5 text-[13px] leading-5 text-ink2">
              Pay the amount to your PG by UPI or in cash. For UPI, submit a
              screenshot or your reference number; for cash, just tap “Paid by
              cash”. Your manager reviews and approves it.
            </p>
          </Card>
        )}

        {payable ? (
          <Button title="Submit payment" onClick={() => setSheetOpen(true)} />
        ) : null}
      </Screen>

      <FilePicker
        ref={galleryPicker}
        accept="image/jpeg,image/png,image/webp"
        onPick={choose}
      />
      <FilePicker
        ref={cameraPicker}
        accept="image/*"
        capture="environment"
        onPick={choose}
      />

      <Sheet
        visible={sheetOpen}
        onClose={resetSheet}
        title="Submit payment"
        subtitle={`How did you pay ${formatPaise(invoice.amountPaise)}?`}
      >
        {paymentInfo?.upiQrUrl ? (
          <div className="flex flex-col items-center gap-3 rounded-btn border border-line bg-surface2 p-4">
            <span className="text-[11px] font-bold uppercase tracking-wider text-ink3">
              Scan to pay
            </span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={paymentInfo.upiQrUrl}
              alt="UPI QR code"
              className="h-48 w-48 rounded-lg object-contain"
            />
            <div className="flex w-full flex-row gap-2">
              <button
                type="button"
                onClick={saveQr}
                disabled={busyQr}
                className="flex flex-1 flex-row items-center justify-center gap-1.5 rounded-btn border border-line bg-surface py-2.5 active:opacity-60 disabled:opacity-40"
              >
                <Icon name="download-outline" size={16} color="#0b7d73" />
                <span className="text-[13px] font-semibold text-brand">Save</span>
              </button>
              {canShare ? (
                <button
                  type="button"
                  onClick={shareQr}
                  disabled={busyQr}
                  className="flex flex-1 flex-row items-center justify-center gap-1.5 rounded-btn border border-line bg-surface py-2.5 active:opacity-60 disabled:opacity-40"
                >
                  <Icon name="share-outline" size={16} color="#0b7d73" />
                  <span className="text-[13px] font-semibold text-brand">
                    Share
                  </span>
                </button>
              ) : null}
            </div>
            <span className="text-center text-[11px] text-ink3">
              Scan with your UPI app, or save the QR and pay from there.
            </span>
          </div>
        ) : null}

        <div className="flex flex-row gap-3">
          <MethodOption
            icon="phone-portrait-outline"
            label="Pay by UPI"
            selected={method === PaymentMethod.UPI}
            onClick={() => setMethod(PaymentMethod.UPI)}
          />
          <MethodOption
            icon="cash-outline"
            label="Paid by cash"
            selected={isCash}
            onClick={() => setMethod(PaymentMethod.CASH)}
          />
        </div>

        {isCash ? (
          <div className="rounded-btn border border-line bg-surface2 p-3">
            <p className="text-[13px] leading-5 text-ink2">
              You paid your manager in cash. Submit this so they can confirm
              receipt and mark the invoice paid. No screenshot needed.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3 rounded-btn border border-line bg-surface2 p-3.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-ink3">
              Add payment proof
            </span>
            {picked && previewUrl ? (
              <div className="flex flex-row items-center gap-3 rounded-btn border border-line bg-surface p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={previewUrl} alt="" className="h-12 w-12 rounded-lg object-cover" />
                <span className="flex-1 truncate text-[13px] text-ink">
                  {picked.name}
                </span>
                <button type="button" onClick={() => setPicked(null)} aria-label="Remove">
                  <Icon name="close-circle" size={22} color="#9ca3af" />
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <span className="text-[13px] text-ink2">
                  Upload a screenshot of your UPI payment.
                </span>
                <div className="flex flex-row gap-3">
                  <PickButton
                    icon="image-outline"
                    label="Gallery"
                    onClick={() => galleryPicker.current?.open()}
                  />
                  <PickButton
                    icon="camera-outline"
                    label="Camera"
                    onClick={() => cameraPicker.current?.open()}
                  />
                </div>
                <span className="text-center text-[12px] text-ink3">
                  JPG, PNG or WebP · max {MAX_UPLOAD_LABEL}
                </span>
              </div>
            )}

            <div className="flex flex-row items-center gap-3">
              <div className="h-px flex-1 bg-line" />
              <span className="text-[12px] font-medium text-ink3">
                OR enter reference
              </span>
              <div className="h-px flex-1 bg-line" />
            </div>

            <Input
              label="UPI reference number"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="e.g. 4012 3456 7890"
              autoCapitalize="characters"
              autoCorrect="off"
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
    </div>
  );
}

function PickButton({
  icon,
  label,
  onClick,
}: {
  icon: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-1 flex-row items-center justify-center gap-2 rounded-btn border border-line bg-surface py-3.5 active:opacity-60"
    >
      <Icon name={icon} size={20} color="#0b7d73" />
      <span className="text-[13px] font-semibold text-ink2">{label}</span>
    </button>
  );
}

function MethodOption({
  icon,
  label,
  selected,
  onClick,
}: {
  icon: string;
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-1 flex-col items-center gap-2 rounded-btn border py-4 active:opacity-70",
        selected ? "border-brand bg-brand-soft" : "border-line bg-surface",
      )}
    >
      <Icon name={icon} size={24} color={selected ? "#0b7d73" : "#9ca3af"} />
      <span
        className={cn(
          "text-[13px] font-semibold",
          selected ? "text-brand" : "text-ink3",
        )}
      >
        {label}
      </span>
    </button>
  );
}
