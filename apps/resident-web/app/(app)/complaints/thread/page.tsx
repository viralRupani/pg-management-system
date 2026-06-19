"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

import { Appbar } from "@/components/ui/appbar";
import { Badge } from "@/components/ui/badge";
import { categoryMeta } from "@/components/ui/categories";
import { Icon } from "@/components/ui/icon";
import { complaintStatus } from "@/components/ui/status";
import { useToast } from "@/components/ui/toast";
import { api, currentUser } from "@/lib/api";
import { qk, useComplaints, useComplaintThread } from "@/lib/queries";
import { clock, cn, toMessage } from "@/lib/utils";

export default function ComplaintThreadPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-full bg-page">
          <Appbar title="Complaint" />
        </div>
      }
    >
      <ComplaintThread />
    </Suspense>
  );
}

function ComplaintThread() {
  const id = useSearchParams().get("id") ?? "";
  const queryClient = useQueryClient();
  const toast = useToast();
  const me = currentUser()?.sub;

  const { data: complaints } = useComplaints();
  const complaint = complaints?.find((c) => c.id === id);
  const thread = useComplaintThread(id);

  const photo = useQuery({
    queryKey: ["complaints", id, "photo"],
    queryFn: () => api.resident.complaints.photo(id),
    enabled: !!complaint?.photoKey,
    retry: false,
  });

  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Pin to the latest message whenever the thread loads or grows.
  const threadCount = thread.data?.length ?? 0;
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [threadCount, photo.data?.downloadUrl]);

  async function send() {
    const text = note.trim();
    if (!text) return;
    setSending(true);
    try {
      await api.resident.complaints.addUpdate(id, text);
      setNote("");
      await queryClient.invalidateQueries({ queryKey: qk.complaintThread(id) });
    } catch (err) {
      toast.error(toMessage(err, "Could not send. Please try again."));
    } finally {
      setSending(false);
    }
  }

  const meta = complaint ? categoryMeta(complaint.category) : null;
  const status = complaint ? complaintStatus(complaint.status) : null;

  return (
    <div className="flex h-[calc(100dvh-68px)] flex-col bg-page">
      <Appbar
        title={meta?.label ?? "Complaint"}
        action={
          status ? <Badge label={status.label} variant={status.variant} /> : undefined
        }
      />

      <div
        ref={scrollRef}
        className="chat-scroll flex flex-1 flex-col gap-2.5 overflow-y-auto px-3 py-4"
      >
        {complaint ? (
          <span className="self-center rounded-pill border border-line bg-surface px-3 py-1 text-[11px] font-semibold text-ink2">
            {new Date(complaint.createdAt).toLocaleDateString(undefined, {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </span>
        ) : null}

        {/* The complaint itself = the resident's first (outgoing) message */}
        {complaint ? (
          <div className="max-w-[78%] self-end rounded-[15px] rounded-br-[4px] bg-brand p-1.5 shadow-sm shadow-black/5">
            {photo.data?.downloadUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={photo.data.downloadUrl}
                alt=""
                className="h-44 w-60 rounded-xl object-cover"
              />
            ) : null}
            <p className="px-2 pt-1.5 text-[13.5px] leading-[19px] text-brand-foreground">
              {complaint.description}
            </p>
            <p className="px-2 pb-0.5 pt-1 text-[10.5px] text-brand-foreground/70">
              You · {clock(complaint.createdAt)}
            </p>
          </div>
        ) : null}

        {thread.data?.map((u) => {
          const mine = u.authorUserId === me;
          return (
            <div
              key={u.id}
              className={cn(
                "max-w-[78%] px-[13px] py-[10px] shadow-sm shadow-black/5",
                mine
                  ? "self-end rounded-[15px] rounded-br-[4px] bg-brand"
                  : "self-start rounded-[15px] rounded-bl-[4px] bg-surface",
              )}
            >
              <p
                className={cn(
                  "text-[13.5px] leading-[19px]",
                  mine ? "text-brand-foreground" : "text-ink",
                )}
              >
                {u.note}
              </p>
              <p
                className={cn(
                  "mt-1 text-[10.5px]",
                  mine ? "text-brand-foreground/70" : "text-ink3",
                )}
              >
                {mine ? "You" : "Manager"} · {clock(u.createdAt)}
              </p>
            </div>
          );
        })}

        {thread.data && thread.data.length === 0 ? (
          <span className="my-2 self-center rounded-pill border border-line bg-surface px-3 py-1.5 text-center text-[12px] text-ink2">
            No replies yet. Add a note for your manager.
          </span>
        ) : null}
      </div>

      {/* Reply bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="flex flex-row items-end gap-2.5 border-t border-line bg-surface px-3.5 py-2.5"
      >
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Message…"
          rows={1}
          className="max-h-28 flex-1 resize-none rounded-btn border-[1.5px] border-line bg-surface px-3.5 py-2.5 text-[15px] text-ink placeholder:text-ink3 focus:border-brand focus:outline-none"
        />
        <button
          type="submit"
          disabled={!note.trim() || sending}
          aria-label="Send"
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand text-brand-foreground shadow-sm shadow-black/10",
            (!note.trim() || sending) && "opacity-50",
          )}
        >
          <Icon name="send" size={18} color="#fff" />
        </button>
      </form>
    </div>
  );
}
