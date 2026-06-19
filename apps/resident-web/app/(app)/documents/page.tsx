"use client";

import { DocumentStatus, DocumentType } from "@pg/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";

import { Appbar } from "@/components/ui/appbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FilePicker, type FilePickerHandle } from "@/components/ui/file-picker";
import { Icon } from "@/components/ui/icon";
import { Ricon, Row } from "@/components/ui/row";
import { Screen } from "@/components/ui/screen";
import { ListSkeleton } from "@/components/ui/skeleton";
import { Sheet } from "@/components/ui/sheet";
import { documentStatus } from "@/components/ui/status";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { qk, useDocuments } from "@/lib/queries";
import {
  contentTypeOf,
  exceedsMaxSize,
  MAX_UPLOAD_LABEL,
  uploadToPresignedPost,
} from "@/lib/upload";
import { cn, toMessage } from "@/lib/utils";

const DOC_TYPES: { type: DocumentType; label: string }[] = [
  { type: DocumentType.AADHAAR, label: "Aadhaar card" },
  { type: DocumentType.PAN, label: "PAN card" },
  { type: DocumentType.PHOTO, label: "Photograph" },
  { type: DocumentType.RENTAL_AGREEMENT, label: "Rental agreement" },
  { type: DocumentType.OTHER, label: "Other document" },
];

const RICON: Record<string, { name: string; bg: string; color: string }> = {
  [DocumentStatus.VERIFIED]: { name: "checkmark-circle", bg: "bg-success-bg", color: "#15803d" },
  [DocumentStatus.REJECTED]: { name: "close-circle", bg: "bg-danger-bg", color: "#b91c1c" },
  [DocumentStatus.PENDING]: { name: "time-outline", bg: "bg-amber-bg", color: "#b45309" },
};

export default function DocumentsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data, isLoading } = useDocuments();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [chosenType, setChosenType] = useState<DocumentType | null>(null);
  const [busy, setBusy] = useState(false);
  const filesPicker = useRef<FilePickerHandle>(null);
  const cameraPicker = useRef<FilePickerHandle>(null);

  const verified =
    data?.filter((d) => d.status === DocumentStatus.VERIFIED).length ?? 0;

  async function upload(file: File) {
    if (!chosenType) return;
    if (exceedsMaxSize(file.size)) {
      toast.error(`Please choose a file under ${MAX_UPLOAD_LABEL}.`);
      return;
    }
    setBusy(true);
    try {
      const contentType = contentTypeOf(file);
      const post = await api.resident.documents.uploadUrl({
        type: chosenType,
        contentType,
      });
      const ok = await uploadToPresignedPost(post, file);
      if (!ok) throw new Error("Upload failed. Please try a smaller file.");
      await api.resident.documents.submit({ type: chosenType, s3Key: post.key });
      await queryClient.invalidateQueries({ queryKey: qk.documents });
      setSheetOpen(false);
      setChosenType(null);
      toast.success("Your document is awaiting verification.");
    } catch (err) {
      toast.error(toMessage(err, "Could not upload. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-full bg-page">
      <Appbar title="My documents" />
      <Screen contentClassName="flex flex-col gap-4 pt-1">
        {isLoading ? (
          <ListSkeleton />
        ) : (
          <>
            <Card className="flex flex-row items-center gap-3 bg-brand-soft">
              <Icon name="shield-checkmark" size={22} color="#0b7d73" />
              <span className="flex-1 text-[14px] font-semibold text-brand-deep">
                {verified} of {data?.length ?? 0} documents verified
              </span>
            </Card>

            {data?.length ? (
              <Card padded={false} className="px-4">
                {data.map((d, i) => {
                  const r = RICON[d.status] ?? RICON[DocumentStatus.PENDING];
                  const s = documentStatus(d.status);
                  const label =
                    DOC_TYPES.find((t) => t.type === d.type)?.label ?? d.type;
                  return (
                    <Row
                      key={d.id}
                      first={i === 0}
                      leading={<Ricon name={r.name} className={r.bg} color={r.color} />}
                      title={label}
                      subtitle={d.reviewNote ?? undefined}
                      trailing={<Badge label={s.label} variant={s.variant} />}
                    />
                  );
                })}
              </Card>
            ) : (
              <p className="px-1 text-[13px] text-ink2">
                No documents uploaded yet.
              </p>
            )}

            <Button title="Upload a document" onClick={() => setSheetOpen(true)} />
          </>
        )}
      </Screen>

      <FilePicker
        ref={filesPicker}
        accept="image/jpeg,image/png,image/webp,application/pdf"
        onPick={upload}
      />
      <FilePicker
        ref={cameraPicker}
        accept="image/*"
        capture="environment"
        onPick={upload}
      />

      <Sheet
        visible={sheetOpen}
        onClose={() => {
          setSheetOpen(false);
          setChosenType(null);
        }}
        title="Upload a document"
        subtitle="Pick the document type, then choose a source."
      >
        <div className="flex flex-col gap-2">
          {DOC_TYPES.map((t) => (
            <button
              key={t.type}
              type="button"
              onClick={() => setChosenType(t.type)}
              className={cn(
                "flex flex-row items-center justify-between rounded-btn border px-4 py-3 active:opacity-70",
                chosenType === t.type ? "border-brand bg-brand-soft" : "border-line",
              )}
            >
              <span
                className={cn(
                  "text-[14px] font-medium",
                  chosenType === t.type ? "text-brand-deep" : "text-ink",
                )}
              >
                {t.label}
              </span>
              {chosenType === t.type ? (
                <Icon name="checkmark" size={18} color="#0b7d73" />
              ) : null}
            </button>
          ))}
        </div>
        <div className="flex flex-row gap-3">
          <Button
            title="Files / PDF"
            variant="ghost"
            onClick={() => filesPicker.current?.open()}
            loading={busy}
            disabled={!chosenType}
            className="flex-1"
          />
          <Button
            title="Camera"
            variant="ghost"
            onClick={() => cameraPicker.current?.open()}
            disabled={!chosenType || busy}
            className="flex-1"
          />
        </div>
        <p className="text-center text-[12px] text-ink3">
          JPG, PNG, WebP or PDF · max {MAX_UPLOAD_LABEL}
        </p>
      </Sheet>
    </div>
  );
}
