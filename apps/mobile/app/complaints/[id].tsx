import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTokens } from '@/components/theme-provider';
import { Appbar } from '@/components/ui/appbar';
import { Badge } from '@/components/ui/badge';
import { categoryMeta } from '@/components/ui/categories';
import { PressableScale } from '@/components/ui/pressable-scale';
import { complaintStatus } from '@/components/ui/status';
import { AppText } from '@/components/ui/text';
import { api, currentUser } from '@/lib/api';
import { qk, useComplaints, useComplaintThread } from '@/lib/queries';
import { cn, toMessage } from '@/lib/utils';

// WhatsApp-style clock, e.g. "10:30 PM" (manual format — Hermes Intl is unreliable on Android).
function clock(iso: string) {
  const d = new Date(iso);
  const m = d.getMinutes().toString().padStart(2, '0');
  const ampm = d.getHours() >= 12 ? 'PM' : 'AM';
  const h = d.getHours() % 12 || 12;
  return `${h}:${m} ${ampm}`;
}

export default function ComplaintThreadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const tokens = useTokens();
  const me = currentUser()?.sub;
  const insets = useSafeAreaInsets();

  const { data: complaints } = useComplaints();
  const complaint = complaints?.find((c) => c.id === id);
  const thread = useComplaintThread(id);

  const photo = useQuery({
    queryKey: ['complaints', id, 'photo'],
    queryFn: () => api.resident.complaints.photo(id),
    enabled: !!complaint?.photoKey,
    retry: false,
  });

  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const scrollToBottom = (animated = true) =>
    // defer past layout so the ScrollView frame is measured before we scroll
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated }));

  // Pin to the latest message whenever the thread loads or grows.
  const threadCount = thread.data?.length ?? 0;
  useEffect(() => {
    if (threadCount > 0) scrollToBottom(false);
  }, [threadCount]);

  async function send() {
    const text = note.trim();
    if (!text) return;
    setSending(true);
    try {
      await api.resident.complaints.addUpdate(id, text);
      setNote('');
      await queryClient.invalidateQueries({ queryKey: qk.complaintThread(id) });
    } catch (err) {
      Alert.alert('Could not send', toMessage(err, 'Please try again.'));
    } finally {
      setSending(false);
    }
  }

  const meta = complaint ? categoryMeta(complaint.category) : null;
  const status = complaint ? complaintStatus(complaint.status) : null;

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-page">
      <Appbar
        title={meta?.label ?? 'Complaint'}
        action={status ? <Badge label={status.label} variant={status.variant} /> : undefined}
      />
      <KeyboardAvoidingView
        behavior="padding"
        className="flex-1"
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          className="bg-page"
          contentContainerClassName="gap-2.5 px-3 py-4"
          onContentSizeChange={() => scrollToBottom(false)}
        >
          {/* Day pill */}
          {complaint ? (
            <AppText
              variant="caption"
              weight="semibold"
              className="self-center rounded-pill border border-line bg-surface px-3 py-1 text-ink2"
            >
              {new Date(complaint.createdAt).toLocaleDateString(undefined, {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </AppText>
          ) : null}

          {/* The complaint itself = the resident's first (outgoing) message */}
          {complaint ? (
            <View className="max-w-[78%] self-end rounded-[16px] rounded-br-[4px] bg-brand p-1.5 shadow-sm shadow-black/5">
              {photo.data?.downloadUrl ? (
                <Image
                  source={{ uri: photo.data.downloadUrl }}
                  className="h-44 w-60 rounded-xl"
                  resizeMode="cover"
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
            </View>
          ) : null}

          {thread.data?.map((u) => {
            const mine = u.authorUserId === me;
            return (
              <View
                key={u.id}
                className={cn(
                  'max-w-[78%] px-[13px] py-[10px] shadow-sm shadow-black/5',
                  mine
                    ? 'self-end rounded-[16px] rounded-br-[4px] bg-brand'
                    : 'self-start rounded-[16px] rounded-bl-[4px] border border-line2 bg-surface',
                )}
              >
                <AppText
                  variant="sub"
                  className={cn(
                    'text-[13.5px] leading-[19px]',
                    mine ? 'text-brand-foreground' : 'text-ink',
                  )}
                >
                  {u.note}
                </AppText>
                <AppText
                  variant="caption"
                  className={cn(
                    'mt-1 text-[10.5px]',
                    mine ? 'text-brand-foreground-dim' : 'text-ink3',
                  )}
                >
                  {mine ? 'You' : 'Manager'} · {clock(u.createdAt)}
                </AppText>
              </View>
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
        </ScrollView>

        {/* Reply bar */}
        <View
          className="flex-row items-end gap-2.5 border-t border-line bg-surface px-3.5 pt-2.5"
          style={{ paddingBottom: insets.bottom + 10 }}
        >
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Message…"
            placeholderTextColor={tokens.ink3}
            className="max-h-28 flex-1 rounded-field border-[1.5px] border-line bg-surface px-3.5 py-2.5 text-[15px] text-ink"
            multiline
          />
          <PressableScale
            onPress={send}
            disabled={!note.trim() || sending}
            pressedScale={0.88}
            accessibilityRole="button"
            accessibilityLabel="Send message"
            className={cn(
              'h-11 w-11 items-center justify-center rounded-full bg-brand shadow-sm shadow-black/10',
              (!note.trim() || sending) && 'opacity-50',
            )}
          >
            <Ionicons name="send" size={18} color={tokens.brandForeground} />
          </PressableScale>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
