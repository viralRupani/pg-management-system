import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
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
import { SafeAreaView } from 'react-native-safe-area-context';

import { Appbar } from '@/components/ui/appbar';
import { Badge } from '@/components/ui/badge';
import { categoryMeta } from '@/components/ui/categories';
import { complaintStatus } from '@/components/ui/status';
import { api, currentUser } from '@/lib/api';
import { qk, useComplaints, useComplaintThread } from '@/lib/queries';
import { cn, timeAgo, toMessage } from '@/lib/utils';
import { Alert } from 'react-native';

export default function ComplaintThreadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const me = currentUser()?.sub;

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
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
        keyboardVerticalOffset={90}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerClassName="px-4 py-4 gap-3"
        >
          {complaint ? (
            <View className="rounded-card bg-surface p-4 shadow-sm shadow-black/5">
              <Text className="text-[15px] text-ink">{complaint.description}</Text>
              {photo.data?.downloadUrl ? (
                <Image
                  source={{ uri: photo.data.downloadUrl }}
                  className="mt-3 h-44 w-full rounded-lg"
                  resizeMode="cover"
                />
              ) : null}
              <Text className="mt-2 text-[12px] text-ink3">
                Raised {timeAgo(complaint.createdAt)}
              </Text>
            </View>
          ) : null}

          {thread.data?.map((u) => {
            const mine = u.authorUserId === me;
            return (
              <View
                key={u.id}
                className={cn('max-w-[80%]', mine ? 'self-end' : 'self-start')}
              >
                <View
                  className={cn(
                    'rounded-2xl px-3.5 py-2.5',
                    mine ? 'bg-brand' : 'bg-surface shadow-sm shadow-black/5',
                  )}
                >
                  <Text className={cn('text-[14px]', mine ? 'text-brand-foreground' : 'text-ink')}>
                    {u.note}
                  </Text>
                </View>
                <Text
                  className={cn(
                    'mt-1 text-[11px] text-ink3',
                    mine ? 'text-right' : 'text-left',
                  )}
                >
                  {mine ? 'You' : 'Manager'} · {timeAgo(u.createdAt)}
                </Text>
              </View>
            );
          })}

          {thread.data && thread.data.length === 0 ? (
            <Text className="py-6 text-center text-[13px] text-ink3">
              No replies yet. Add a note for your manager.
            </Text>
          ) : null}
        </ScrollView>

        {/* Reply bar */}
        <View className="flex-row items-center gap-2 border-t border-line bg-surface px-3 py-2">
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Write a reply…"
            placeholderTextColor="#9ca3af"
            className="flex-1 rounded-pill bg-page px-4 py-2.5 text-[15px] text-ink"
            multiline
          />
          <Pressable
            onPress={send}
            disabled={!note.trim() || sending}
            className={cn(
              'h-10 w-10 items-center justify-center rounded-full bg-brand',
              (!note.trim() || sending) && 'opacity-50',
            )}
          >
            <Ionicons name="arrow-up" size={20} color="#fff" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
