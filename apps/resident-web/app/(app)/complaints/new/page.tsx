"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { Appbar } from "@/components/ui/appbar";
import { Button } from "@/components/ui/button";
import { COMPLAINT_CATEGORIES } from "@/components/ui/categories";
import { FilePicker, type FilePickerHandle } from "@/components/ui/file-picker";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { PressableScale } from "@/components/ui/pressable-scale";
import { Screen } from "@/components/ui/screen";
import { AppText } from "@/components/ui/text";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { qk } from "@/lib/queries";
import {
  MAX_UPLOAD_LABEL,
  contentTypeOf,
  exceedsMaxSize,
  uploadToPresignedPost,
} from "@/lib/upload";
import { cn, toMessage } from "@/lib/utils";
import { ComplaintCategory } from "@pg/shared";

const ENTRIES = Object.entries(COMPLAINT_CATEGORIES) as [
  ComplaintCategory,
  { label: string; icon: string },
][];

export default function NewComplaintPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [category, setCategory] = useState<ComplaintCategory | null>(null);
  const [description, setDescription] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const galleryRef = useRef<FilePickerHandle>(null);
  const cameraRef = useRef<FilePickerHandle>(null);

  const photoUrl = useMemo(
    () => (photo ? URL.createObjectURL(photo) : null),
    [photo],
  );
  useEffect(() => {
    return () => {
      if (photoUrl) URL.revokeObjectURL(photoUrl);
    };
  }, [photoUrl]);

  const valid = category && description.trim().length >= 3;

  function selectPhoto(file: File) {
    if (exceedsMaxSize(file.size)) {
      toast.error(`Image too large — please choose one under ${MAX_UPLOAD_LABEL}.`);
      return;
    }
    setPhoto(file);
  }

  async function submit() {
    if (!valid || !category) return;
    setSubmitting(true);
    try {
      let photoKey: string | undefined;
      if (photo) {
        const contentType = contentTypeOf(photo);
        const post = await api.resident.complaints.photoUrl({ contentType });
        const ok = await uploadToPresignedPost(post, photo);
        if (!ok) throw new Error("Photo upload failed. Please try a smaller image.");
        photoKey = post.key;
      }
      await api.resident.complaints.file({
        category,
        description: description.trim(),
        photoKey,
      });
      await queryClient.invalidateQueries({ queryKey: qk.complaints });
      toast.success("Complaint submitted — your manager will pick it up.");
      router.back();
    } catch (err) {
      toast.error(toMessage(err, "Could not submit. Please try again."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen contentClassName="gap-5">
      <Appbar title="Raise a complaint" />

      <div className="flex flex-col gap-2">
        <AppText variant="label" className="text-ink2">
          Category
        </AppText>
        <div className="grid grid-cols-3 gap-2.5">
          {ENTRIES.map(([value, meta]) => {
            const selected = category === value;
            return (
              <PressableScale
                key={value}
                onClick={() => setCategory(value)}
                haptic="selection"
                pressedScale={0.94}
                aria-pressed={selected}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-tile border py-4",
                  selected ? "border-brand bg-brand-soft" : "border-line bg-surface",
                )}
              >
                <Icon
                  name={meta.icon}
                  size={22}
                  className={selected ? "text-brand-deep" : "text-ink2"}
                />
                <AppText
                  variant="caption"
                  weight="medium"
                  className={cn("text-[12px]", selected ? "text-brand-deep" : "text-ink2")}
                >
                  {meta.label}
                </AppText>
              </PressableScale>
            );
          })}
        </div>
      </div>

      <Input
        label="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Describe the issue…"
        multiline
        hint={
          description.trim().length > 0 && description.trim().length < 3
            ? "A few more words help your manager act faster."
            : undefined
        }
      />

      <div className="flex flex-col gap-2">
        <AppText variant="label" className="text-ink2">
          Photo (optional)
        </AppText>
        <AppText variant="caption" className="text-[12px]">
          JPG, PNG or WebP · max {MAX_UPLOAD_LABEL}
        </AppText>
        {photo && photoUrl ? (
          <div className="flex flex-row items-center gap-3 rounded-tile border border-line bg-surface2 p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photoUrl}
              alt="Complaint photo"
              className="h-12 w-12 rounded-lg object-cover"
            />
            <AppText variant="sub" className="min-w-0 flex-1 text-ink" numberOfLines={1}>
              {photo.name}
            </AppText>
            <PressableScale
              onClick={() => setPhoto(null)}
              aria-label="Remove photo"
              className="flex h-9 w-9 items-center justify-center text-ink3"
            >
              <Icon name="close-circle" size={22} />
            </PressableScale>
          </div>
        ) : (
          <div className="flex flex-row gap-3">
            <AttachButton
              icon="image-outline"
              label="Gallery"
              onPress={() => galleryRef.current?.open()}
            />
            <AttachButton
              icon="camera-outline"
              label="Camera"
              onPress={() => cameraRef.current?.open()}
            />
          </div>
        )}
      </div>

      <Button
        title="Submit complaint"
        onClick={submit}
        loading={submitting}
        disabled={!valid}
      />

      <FilePicker
        ref={galleryRef}
        accept="image/jpeg,image/png,image/webp"
        onPick={selectPhoto}
      />
      <FilePicker ref={cameraRef} accept="image/*" capture="environment" onPick={selectPhoto} />
    </Screen>
  );
}

function AttachButton({
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
      className="flex min-h-[52px] flex-1 flex-row items-center justify-center gap-2 rounded-tile border border-dashed border-line py-4 text-ink2"
    >
      <Icon name={icon} size={20} />
      <AppText variant="label" className="text-ink2">
        {label}
      </AppText>
    </PressableScale>
  );
}
