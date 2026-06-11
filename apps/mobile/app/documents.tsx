import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, Pressable, RefreshControl, Text, View } from 'react-native';

import { Appbar } from '@/components/ui/appbar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Row, Ricon } from '@/components/ui/row';
import { Screen } from '@/components/ui/screen';
import { ListSkeleton } from '@/components/ui/skeleton';
import { Sheet } from '@/components/ui/sheet';
import { documentStatus } from '@/components/ui/status';
import { api } from '@/lib/api';
import { qk, useDocuments } from '@/lib/queries';
import { DocumentStatus, DocumentType } from '@pg/shared';
import {
  MAX_UPLOAD_LABEL,
  contentTypeOf,
  exceedsMaxSize,
  pickDocument,
  pickImage,
  uploadToPresignedPost,
} from '@/lib/upload';
import { cn, toMessage } from '@/lib/utils';

const DOC_TYPES: { type: DocumentType; label: string }[] = [
  { type: DocumentType.AADHAAR, label: 'Aadhaar card' },
  { type: DocumentType.PAN, label: 'PAN card' },
  { type: DocumentType.PHOTO, label: 'Photograph' },
  { type: DocumentType.RENTAL_AGREEMENT, label: 'Rental agreement' },
  { type: DocumentType.OTHER, label: 'Other document' },
];

const RICON: Record<string, { name: 'checkmark-circle' | 'close-circle' | 'time-outline'; bg: string; color: string }> = {
  [DocumentStatus.VERIFIED]: { name: 'checkmark-circle', bg: 'bg-success-bg', color: '#15803d' },
  [DocumentStatus.REJECTED]: { name: 'close-circle', bg: 'bg-danger-bg', color: '#b91c1c' },
  [DocumentStatus.PENDING]: { name: 'time-outline', bg: 'bg-amber-bg', color: '#b45309' },
};

export default function DocumentsScreen() {
  const queryClient = useQueryClient();
  const { data, isLoading, isFetching, refetch } = useDocuments();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [chosenType, setChosenType] = useState<DocumentType | null>(null);
  const [busy, setBusy] = useState(false);

  const verified = data?.filter((d) => d.status === DocumentStatus.VERIFIED).length ?? 0;

  async function upload(source: 'files' | 'camera') {
    if (!chosenType) return;
    const file = source === 'camera' ? await pickImage('camera') : await pickDocument();
    if (!file) return;
    if (exceedsMaxSize(file.size)) {
      Alert.alert('File too large', `Please choose a file under ${MAX_UPLOAD_LABEL}.`);
      return;
    }
    setBusy(true);
    try {
      const contentType = contentTypeOf(file);
      const post = await api.resident.documents.uploadUrl({ type: chosenType, contentType });
      const ok = await uploadToPresignedPost(post, file.uri, contentType, file.fileName);
      if (!ok) throw new Error('Upload failed. Please try a smaller file.');
      await api.resident.documents.submit({ type: chosenType, s3Key: post.key });
      await queryClient.invalidateQueries({ queryKey: qk.documents });
      setSheetOpen(false);
      setChosenType(null);
      Alert.alert('Uploaded', 'Your document is awaiting verification.');
    } catch (err) {
      Alert.alert('Could not upload', toMessage(err, 'Please try again.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      contentClassName="gap-4"
      refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} />}
    >
      <Appbar title="My documents" />

      {isLoading ? (
        <ListSkeleton />
      ) : (
        <>
          <Card className="flex-row items-center gap-3 bg-brand-soft" padded>
            <Ionicons name="shield-checkmark" size={22} color="#0b7d73" />
            <Text className="flex-1 text-[14px] font-semibold text-brand-deep">
              {verified} of {data?.length ?? 0} documents verified
            </Text>
          </Card>

          {data?.length ? (
            <Card padded={false} className="px-4">
              {data.map((d, i) => {
                const r = RICON[d.status] ?? RICON[DocumentStatus.PENDING];
                const s = documentStatus(d.status);
                const label = DOC_TYPES.find((t) => t.type === d.type)?.label ?? d.type;
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
            <Text className="px-1 text-[13px] text-ink2">
              No documents uploaded yet.
            </Text>
          )}

          <Button title="Upload a document" onPress={() => setSheetOpen(true)} />
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
        <View className="gap-2">
          {DOC_TYPES.map((t) => (
            <Pressable
              key={t.type}
              onPress={() => setChosenType(t.type)}
              className={cn(
                'flex-row items-center justify-between rounded-btn border px-4 py-3 active:opacity-70',
                chosenType === t.type ? 'border-brand bg-brand-soft' : 'border-line',
              )}
            >
              <Text
                className={cn(
                  'text-[14px] font-medium',
                  chosenType === t.type ? 'text-brand-deep' : 'text-ink',
                )}
              >
                {t.label}
              </Text>
              {chosenType === t.type ? (
                <Ionicons name="checkmark" size={18} color="#0b7d73" />
              ) : null}
            </Pressable>
          ))}
        </View>
        <View className="flex-row gap-3">
          <Button
            title="Files / PDF"
            variant="ghost"
            onPress={() => upload('files')}
            loading={busy}
            disabled={!chosenType}
            className="flex-1"
          />
          <Button
            title="Camera"
            variant="ghost"
            onPress={() => upload('camera')}
            disabled={!chosenType || busy}
            className="flex-1"
          />
        </View>
        <Text className="text-center text-[12px] text-ink3">
          JPG, PNG, WebP or PDF · max {MAX_UPLOAD_LABEL}
        </Text>
      </Sheet>
    </Screen>
  );
}
