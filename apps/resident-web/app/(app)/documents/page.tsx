"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";

import { Appbar } from "@/components/ui/appbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { FilePicker, type FilePickerHandle } from "@/components/ui/file-picker";
import { Icon } from "@/components/ui/icon";
import { PressableScale } from "@/components/ui/pressable-scale";
import { Row, Ricon, type RiconTone } from "@/components/ui/row";
import { Screen } from "@/components/ui/screen";
import { ListSkeleton } from "@/components/ui/skeleton";
import { Sheet } from "@/components/ui/sheet";
import { documentStatus } from "@/components/ui/status";
import { AppText } from "@/components/ui/text";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { qk, useDocuments } from "@/lib/queries";
import {
  MAX_UPLOAD_LABEL,
  contentTypeOf,
  exceedsMaxSize,
  uploadToPresignedPost,
} from "@/lib/upload";
import { cn, toMessage } from "@/lib/utils";
import {
  DOCUMENT_TYPE_META,
  DOCUMENT_UPLOAD_WARNING,
  DocumentStatus,
  type DocumentType,
} from "@pg/shared";

const DOC_TYPES = (
  Object.entries(DOCUMENT_TYPE_META) as [
    DocumentType,
    (typeof DOCUMENT_TYPE_META)[DocumentType],
  ][]
).map(([type, meta]) => ({ type, label: meta.label }));

const RICON: Record<string, { name: string; tone: RiconTone }> = {
  [DocumentStatus.VERIFIED]: { name: "checkmark-circle", tone: "success" },
  [DocumentStatus.REJECTED]: { name: "close-circle", tone: "danger" },
  [DocumentStatus.PENDING]: { name: "time-outline", tone: "amber" },
};

export default function DocumentsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch } = useDocuments();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [chosenType, setChosenType] = useState<DocumentType | null>(null);
  const [busy, setBusy] = useState(false);
  const filesRef = useRef<FilePickerHandle>(null);
  const cameraRef = useRef<FilePickerHandle>(null);

  const verified = data?.filter((d) => d.status === DocumentStatus.VERIFIED).length ?? 0;

  async function upload(file: File) {
    if (!chosenType) return;
    if (exceedsMaxSize(file.size)) {
      toast.error(`File too large — please choose one under ${MAX_UPLOAD_LABEL}.`);
      return;
    }
    setBusy(true);
    try {
      const contentType = contentTypeOf(file);
      const post = await api.resident.documents.uploadUrl({ type: chosenType, contentType });
      const ok = await uploadToPresignedPost(post, file);
      if (!ok) throw new Error("Upload failed. Please try a smaller file.");
      await api.resident.documents.submit({ type: chosenType, s3Key: post.key, contentType });
      await queryClient.invalidateQueries({ queryKey: qk.documents });
      setSheetOpen(false);
      setChosenType(null);
      toast.success("Uploaded — awaiting verification.");
    } catch (err) {
      toast.error(toMessage(err, "Could not upload. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen contentClassName="gap-4">
      <Appbar title="My documents" />

      {isLoading ? (
        <ListSkeleton />
      ) : isError ? (
        <ErrorState title="Couldn't load documents" onRetry={() => refetch()} />
      ) : (
        <>
          <Card className="flex-row items-center gap-3 bg-brand-soft">
            <Icon name="shield-checkmark" size={22} className="shrink-0 text-brand-deep" />
            <AppText
              variant="body"
              weight="semibold"
              className="flex-1 text-[14px] text-brand-deep"
            >
              {verified} of {data?.length ?? 0} documents verified
            </AppText>
          </Card>

          {data?.length ? (
            <Card padded={false} className="px-4">
              {data.map((d, i) => {
                const r = RICON[d.status] ?? RICON[DocumentStatus.PENDING];
                const s = documentStatus(d.status);
                const label =
                  DOCUMENT_TYPE_META[d.type as DocumentType]?.label ?? d.type;
                return (
                  <Row
                    key={d.id}
                    first={i === 0}
                    leading={<Ricon name={r.name} tone={r.tone} />}
                    title={label}
                    subtitle={d.reviewNote ?? undefined}
                    trailing={<Badge label={s.label} variant={s.variant} />}
                  />
                );
              })}
            </Card>
          ) : (
            <AppText variant="sub" className="px-1">
              No documents uploaded yet.
            </AppText>
          )}

          <Button title="Upload a document" onClick={() => setSheetOpen(true)} />
        </>
      )}

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
          {DOC_TYPES.map((t) => {
            const selected = chosenType === t.type;
            return (
              <PressableScale
                key={t.type}
                onClick={() => setChosenType(t.type)}
                haptic="selection"
                pressedScale={0.98}
                aria-pressed={selected}
                className={cn(
                  "flex min-h-[48px] w-full flex-row items-center justify-between rounded-tile border px-4 py-3",
                  selected ? "border-brand bg-brand-soft" : "border-line",
                )}
              >
                <AppText
                  variant="body"
                  weight="medium"
                  className={cn("text-[14px]", selected ? "text-brand-deep" : "text-ink")}
                >
                  {t.label}
                </AppText>
                {selected ? (
                  <Icon name="checkmark" size={18} className="text-brand-deep" />
                ) : null}
              </PressableScale>
            );
          })}
        </div>

        {chosenType ? (
          <div className="flex flex-row items-start gap-2 rounded-tile bg-surface2 px-3 py-2.5">
            <Icon
              name="information-circle"
              size={16}
              className="mt-0.5 shrink-0 text-ink3"
            />
            <AppText variant="caption" className="flex-1 text-[12px] text-ink2">
              {DOCUMENT_TYPE_META[chosenType].instruction}
            </AppText>
          </div>
        ) : null}

        <div className="flex flex-row items-start gap-2 rounded-tile border border-amber-line bg-amber-bg px-3 py-2.5">
          <Icon
            name="shield-checkmark"
            size={16}
            className="mt-0.5 shrink-0 text-amber"
          />
          <AppText variant="caption" className="flex-1 text-[12px] text-amber">
            {DOCUMENT_UPLOAD_WARNING}
          </AppText>
        </div>

        <div className="flex flex-row gap-3">
          <Button
            title="Files / PDF"
            variant="ghost"
            onClick={() => filesRef.current?.open()}
            loading={busy}
            disabled={!chosenType}
            className="flex-1"
          />
          <Button
            title="Camera"
            variant="ghost"
            onClick={() => cameraRef.current?.open()}
            disabled={!chosenType || busy}
            className="flex-1"
          />
        </div>
        <AppText variant="caption" className="text-center text-[12px]">
          JPG, PNG, WebP or PDF · max {MAX_UPLOAD_LABEL}
        </AppText>
      </Sheet>

      <FilePicker
        ref={filesRef}
        accept="image/jpeg,image/png,image/webp,application/pdf"
        onPick={upload}
      />
      <FilePicker
        ref={cameraRef}
        accept="image/*"
        capture="environment"
        onPick={upload}
      />
    </Screen>
  );
}
