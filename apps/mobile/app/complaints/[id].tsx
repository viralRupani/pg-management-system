import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Appbar } from '@/components/ui/appbar';
import { Badge } from '@/components/ui/badge';
import { categoryMeta } from '@/components/ui/categories';
import { complaintStatus } from '@/components/ui/status';
import { api, currentUser } from '@/lib/api';
import { qk, useComplaints, useComplaintThread } from '@/lib/queries';
import { cn, toMessage } from '@/lib/utils';
import { Alert } from 'react-native';

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
          className="bg-[#ECE5DD]"
          contentContainerClassName="px-3 py-3"
          onContentSizeChange={() => scrollToBottom(false)}
        >
          {/* Date chip */}
          {complaint ? (
            <View className="my-2 items-center">
              <Text className="rounded-md bg-white/80 px-2.5 py-1 text-[11px] font-medium text-[#54656f]">
                {new Date(complaint.createdAt).toLocaleDateString(undefined, {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </Text>
            </View>
          ) : null}

          {/* The complaint itself = the resident's first (outgoing) message */}
          {complaint ? (
            <View className="my-0.5 max-w-[82%] self-end">
              <View className="rounded-2xl rounded-tr-sm bg-brand p-1.5 shadow-sm shadow-black/10">
                {photo.data?.downloadUrl ? (
                  <Image
                    source={{ uri: photo.data.downloadUrl }}
                    className="h-44 w-60 rounded-xl"
                    resizeMode="cover"
                  />
                ) : null}
                <Text className="px-2 pt-1.5 text-[15px] leading-5 text-brand-foreground">
                  {complaint.description}
                </Text>
                <Text className="px-2 pb-0.5 pt-1 text-right text-[10px] text-brand-foreground/70">
                  {clock(complaint.createdAt)}
                </Text>
              </View>
            </View>
          ) : null}

          {thread.data?.map((u) => {
            const mine = u.authorUserId === me;
            return (
              <View
                key={u.id}
                className={cn('my-0.5 max-w-[82%]', mine ? 'self-end' : 'self-start')}
              >
                <View
                  className={cn(
                    'rounded-2xl px-3.5 pb-1.5 pt-2 shadow-sm shadow-black/10',
                    mine ? 'rounded-tr-sm bg-brand' : 'rounded-tl-sm bg-white',
                  )}
                >
                  {!mine ? (
                    <Text className="mb-0.5 text-[12px] font-semibold text-brand">Manager</Text>
                  ) : null}
                  <Text
                    className={cn(
                      'text-[15px] leading-5',
                      mine ? 'text-brand-foreground' : 'text-[#111b21]',
                    )}
                  >
                    {u.note}
                  </Text>
                  <View className="mt-1 flex-row items-center justify-end gap-1">
                    <Text
                      className={cn(
                        'text-[10px]',
                        mine ? 'text-brand-foreground/70' : 'text-[#667781]',
                      )}
                    >
                      {clock(u.createdAt)}
                    </Text>
                    {mine ? (
                      <Ionicons name="checkmark-done" size={14} color="rgba(255,255,255,0.85)" />
                    ) : null}
                  </View>
                </View>
              </View>
            );
          })}

          {thread.data && thread.data.length === 0 ? (
            <View className="my-3 items-center">
              <Text className="rounded-md bg-white/80 px-3 py-1.5 text-center text-[12px] text-[#54656f]">
                No replies yet. Add a note for your manager.
              </Text>
            </View>
          ) : null}
        </ScrollView>

        {/* Reply bar */}
        <View
          className="flex-row items-end gap-1.5 bg-[#ECE5DD] px-2 pt-1.5"
          style={{ paddingBottom: insets.bottom + 8 }}
        >
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Message"
            placeholderTextColor="#8696a0"
            className="max-h-28 flex-1 rounded-3xl bg-white px-4 py-2.5 text-[15px] text-[#111b21] shadow-sm shadow-black/10"
            multiline
          />
          <Pressable
            onPress={send}
            disabled={!note.trim() || sending}
            className={cn(
              'h-11 w-11 items-center justify-center rounded-full bg-brand shadow-sm shadow-black/10',
              (!note.trim() || sending) && 'opacity-50',
            )}
          >
            <Ionicons name="send" size={18} color="#fff" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
