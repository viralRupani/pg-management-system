"use client";

import { ComplaintCategory } from "@pg/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Appbar } from "@/components/ui/appbar";
import { Button } from "@/components/ui/button";
import { COMPLAINT_CATEGORIES } from "@/components/ui/categories";
import { FilePicker, type FilePickerHandle } from "@/components/ui/file-picker";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Screen } from "@/components/ui/screen";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { qk } from "@/lib/queries";
import {
  contentTypeOf,
  exceedsMaxSize,
  MAX_UPLOAD_LABEL,
  uploadToPresignedPost,
} from "@/lib/upload";
import { cn, toMessage } from "@/lib/utils";

const ENTRIES = Object.entries(COMPLAINT_CATEGORIES) as [
  ComplaintCategory,
  { label: string; icon: string },
][];

export default function NewComplaintPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [category, setCategory] = useState<ComplaintCategory | null>(null);
  const [description, setDescription] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const picker = useRef<FilePickerHandle>(null);

  const valid = category && description.trim().length >= 3;

  useEffect(() => {
    if (!photo) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  function selectPhoto(file: File) {
    if (exceedsMaxSize(file.size)) {
      toast.error(`Please choose an image under ${MAX_UPLOAD_LABEL}.`);
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
      router.back();
    } catch (err) {
      toast.error(toMessage(err, "Could not submit. Please try again."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-full bg-page">
      <Appbar title="Raise a complaint" />
      <Screen contentClassName="flex flex-col gap-5 pt-1">
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-semibold text-ink2">Category</span>
          <div className="flex flex-row flex-wrap gap-2.5">
            {ENTRIES.map(([value, meta]) => {
              const selected = category === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setCategory(value)}
                  className={cn(
                    "flex w-[30%] flex-col items-center gap-2 rounded-btn border py-4 active:opacity-70",
                    selected ? "border-brand bg-brand-soft" : "border-line bg-surface",
                  )}
                >
                  <Icon
                    name={meta.icon}
                    size={22}
                    color={selected ? "#0b7d73" : "#6b7280"}
                  />
                  <span
                    className={cn(
                      "text-[12px] font-medium",
                      selected ? "text-brand-deep" : "text-ink2",
                    )}
                  >
                    {meta.label}
                  </span>
                </button>
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
        />

        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-semibold text-ink2">
            Photo (optional)
          </span>
          <span className="text-[12px] text-ink3">
            JPG, PNG or WebP · max {MAX_UPLOAD_LABEL}
          </span>
          <FilePicker ref={picker} accept="image/jpeg,image/png,image/webp" onPick={selectPhoto} />
          {photo && previewUrl ? (
            <div className="flex flex-row items-center gap-3 rounded-btn border border-line bg-surface2 p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewUrl} alt="" className="h-12 w-12 rounded-lg object-cover" />
              <span className="flex-1 truncate text-[13px] text-ink">
                {photo.name}
              </span>
              <button type="button" onClick={() => setPhoto(null)} aria-label="Remove">
                <Icon name="close-circle" size={22} color="#9ca3af" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => picker.current?.open()}
              className="flex flex-row items-center justify-center gap-2 rounded-btn border border-dashed border-line py-4 active:opacity-60"
            >
              <Icon name="image-outline" size={20} color="#6b7280" />
              <span className="text-[13px] font-semibold text-ink2">
                Add a photo
              </span>
            </button>
          )}
        </div>

        <Button
          title="Submit complaint"
          onClick={submit}
          loading={submitting}
          disabled={!valid}
        />
      </Screen>
    </div>
  );
}
