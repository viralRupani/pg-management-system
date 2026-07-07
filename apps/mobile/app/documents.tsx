import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, RefreshControl, View } from 'react-native';

import { useTokens } from '@/components/theme-provider';
import { Appbar } from '@/components/ui/appbar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/error-state';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Row, Ricon, type RiconTone } from '@/components/ui/row';
import { Screen } from '@/components/ui/screen';
import { ListSkeleton } from '@/components/ui/skeleton';
import { Sheet } from '@/components/ui/sheet';
import { documentStatus } from '@/components/ui/status';
import { AppText } from '@/components/ui/text';
import { toast } from '@/components/ui/toast';
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

const RICON: Record<string, { name: 'checkmark-circle' | 'close-circle' | 'time-outline'; tone: RiconTone }> = {
  [DocumentStatus.VERIFIED]: { name: 'checkmark-circle', tone: 'success' },
  [DocumentStatus.REJECTED]: { name: 'close-circle', tone: 'danger' },
  [DocumentStatus.PENDING]: { name: 'time-outline', tone: 'amber' },
};

export default function DocumentsScreen() {
  const queryClient = useQueryClient();
  const tokens = useTokens();
  const { data, isLoading, isError, isFetching, refetch } = useDocuments();
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
      // Close the sheet BEFORE toasting — the Modal sits above the root tree.
      setSheetOpen(false);
      setChosenType(null);
      toast.success('Uploaded — awaiting verification.');
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
      ) : isError ? (
        <ErrorState title="Couldn't load documents" onRetry={() => refetch()} />
      ) : (
        <>
          <Card className="flex-row items-center gap-3 bg-brand-soft" padded>
            <Ionicons name="shield-checkmark" size={22} color={tokens.brandDeep} />
            <AppText variant="body" weight="semibold" className="flex-1 text-[14px] text-brand-deep">
              {verified} of {data?.length ?? 0} documents verified
            </AppText>
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
          {DOC_TYPES.map((t) => {
            const selected = chosenType === t.type;
            return (
              <PressableScale
                key={t.type}
                onPress={() => setChosenType(t.type)}
                haptic="selection"
                pressedScale={0.98}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                className={cn(
                  'min-h-[48px] flex-row items-center justify-between rounded-tile border px-4 py-3',
                  selected ? 'border-brand bg-brand-soft' : 'border-line',
                )}
              >
                <AppText
                  variant="body"
                  weight="medium"
                  className={cn('text-[14px]', selected ? 'text-brand-deep' : 'text-ink')}
                >
                  {t.label}
                </AppText>
                {selected ? (
                  <Ionicons name="checkmark" size={18} color={tokens.brandDeep} />
                ) : null}
              </PressableScale>
            );
          })}
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
        <AppText variant="caption" className="text-center text-[12px]">
          JPG, PNG, WebP or PDF · max {MAX_UPLOAD_LABEL}
        </AppText>
      </Sheet>
    </Screen>
  );
}
