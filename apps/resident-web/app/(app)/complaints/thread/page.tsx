"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

import { Appbar } from "@/components/ui/appbar";
import { Badge } from "@/components/ui/badge";
import { categoryMeta } from "@/components/ui/categories";
import { Icon } from "@/components/ui/icon";
import { PressableScale } from "@/components/ui/pressable-scale";
import { complaintStatus } from "@/components/ui/status";
import { AppText } from "@/components/ui/text";
import { toast } from "@/components/ui/toast";
import { api, currentUser } from "@/lib/api";
import { qk, useComplaints, useComplaintThread } from "@/lib/queries";
import { clock, cn, toMessage } from "@/lib/utils";

export default function ComplaintThreadPage() {
  return (
    <Suspense fallback={null}>
      <ComplaintThread />
    </Suspense>
  );
}

function ComplaintThread() {
  const id = useSearchParams().get("id") ?? "";
  const queryClient = useQueryClient();
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
  const scrollToBottom = () =>
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });

  // Pin to the latest message whenever the thread loads or grows.
  const threadCount = thread.data?.length ?? 0;
  useEffect(() => {
    if (threadCount > 0) scrollToBottom();
  }, [threadCount]);

  async function send() {
    const text = note.trim();
    if (!text || sending) return;
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
    // The (app) layout pads 68px for the fixed tab bar; fill the rest exactly
    // so the reply bar sits flush above the tabs and only the thread scrolls.
    <div className="flex h-[calc(100dvh-68px)] flex-col bg-page">
      <div className="px-4">
        <Appbar
          title={meta?.label ?? "Complaint"}
          action={
            status ? <Badge label={status.label} variant={status.variant} /> : undefined
          }
        />
      </div>

      <div
        ref={scrollRef}
        className="chat-scroll flex flex-1 flex-col gap-2.5 overflow-y-auto px-3 py-4"
      >
        {/* Day pill */}
        {complaint ? (
          <AppText
            variant="caption"
            weight="semibold"
            className="self-center rounded-pill border border-line bg-surface px-3 py-1 text-ink2"
          >
            {new Date(complaint.createdAt).toLocaleDateString(undefined, {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </AppText>
        ) : null}

        {/* The complaint itself = the resident's first (outgoing) message */}
        {complaint ? (
          <div className="max-w-[78%] self-end rounded-[16px] rounded-br-[4px] bg-brand p-1.5 shadow-sm shadow-black/5">
            {photo.data?.downloadUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={photo.data.downloadUrl}
                alt="Complaint photo"
                className="h-44 w-60 rounded-xl object-cover"
              />
            ) : null}
            <AppText
              variant="sub"
              className="px-2 pt-1.5 text-[13.5px] leading-[19px] text-brand-foreground"
            >
              {complaint.description}
            </AppText>
            <AppText
              variant="caption"
              className="px-2 pb-0.5 pt-1 text-[10.5px] text-brand-foreground-dim"
            >
              You · {clock(complaint.createdAt)}
            </AppText>
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
                  ? "self-end rounded-[16px] rounded-br-[4px] bg-brand"
                  : "self-start rounded-[16px] rounded-bl-[4px] border border-line2 bg-surface",
              )}
            >
              <AppText
                variant="sub"
                className={cn(
                  "text-[13.5px] leading-[19px]",
                  mine ? "text-brand-foreground" : "text-ink",
                )}
              >
                {u.note}
              </AppText>
              <AppText
                variant="caption"
                className={cn(
                  "mt-1 text-[10.5px]",
                  mine ? "text-brand-foreground-dim" : "text-ink3",
                )}
              >
                {mine ? "You" : "Manager"} · {clock(u.createdAt)}
              </AppText>
            </div>
          );
        })}

        {thread.data && thread.data.length === 0 ? (
          <AppText
            variant="caption"
            className="my-2 self-center rounded-pill border border-line bg-surface px-3 py-1.5 text-center text-[12px] text-ink2"
          >
            No replies yet. Add a note for your manager.
          </AppText>
        ) : null}
      </div>

      {/* Reply bar */}
      <form
        className="flex flex-row items-end gap-2.5 border-t border-line bg-surface px-3.5 pb-2.5 pt-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Message…"
          rows={1}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          className="max-h-28 flex-1 resize-none rounded-field border-[1.5px] border-line bg-surface px-3.5 py-2.5 text-[15px] text-ink outline-none placeholder:text-ink3 focus:border-brand"
        />
        <PressableScale
          type="submit"
          disabled={!note.trim() || sending}
          pressedScale={0.88}
          aria-label="Send message"
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand text-brand-foreground shadow-sm shadow-black/10",
            (!note.trim() || sending) && "opacity-50",
          )}
        >
          <Icon name="send" size={18} />
        </PressableScale>
      </form>
    </div>
  );
}
