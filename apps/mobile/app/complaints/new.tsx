import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Image, View } from 'react-native';

import { useTokens } from '@/components/theme-provider';
import { Appbar } from '@/components/ui/appbar';
import { Button } from '@/components/ui/button';
import { COMPLAINT_CATEGORIES } from '@/components/ui/categories';
import { Input } from '@/components/ui/input';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Screen } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { toast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { qk } from '@/lib/queries';
import { ComplaintCategory } from '@pg/shared';
import {
  MAX_UPLOAD_LABEL,
  contentTypeOf,
  exceedsMaxSize,
  pickImage,
  uploadToPresignedPost,
  type PickedImage,
} from '@/lib/upload';
import { cn, toMessage } from '@/lib/utils';

const ENTRIES = Object.entries(COMPLAINT_CATEGORIES) as [
  ComplaintCategory,
  { label: string; icon: keyof typeof Ionicons.glyphMap },
][];

export default function NewComplaintScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const tokens = useTokens();
  const [category, setCategory] = useState<ComplaintCategory | null>(null);
  const [description, setDescription] = useState('');
  const [photo, setPhoto] = useState<PickedImage | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const valid = category && description.trim().length >= 3;

  async function selectPhoto(source: 'library' | 'camera') {
    const img = await pickImage(source);
    if (!img) return;
    if (exceedsMaxSize(img.size)) {
      Alert.alert('Image too large', `Please choose an image under ${MAX_UPLOAD_LABEL}.`);
      return;
    }
    setPhoto(img);
  }

  async function submit() {
    if (!valid || !category) return;
    setSubmitting(true);
    try {
      let photoKey: string | undefined;
      if (photo) {
        const contentType = contentTypeOf(photo);
        const post = await api.resident.complaints.photoUrl({ contentType });
        const ok = await uploadToPresignedPost(post, photo.uri, contentType, photo.fileName);
        if (!ok) throw new Error('Photo upload failed. Please try a smaller image.');
        photoKey = post.key;
      }
      await api.resident.complaints.file({
        category,
        description: description.trim(),
        photoKey,
      });
      await queryClient.invalidateQueries({ queryKey: qk.complaints });
      toast.success('Complaint submitted — your manager will pick it up.');
      router.back();
    } catch (err) {
      Alert.alert('Could not submit', toMessage(err, 'Please try again.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen contentClassName="gap-5">
      <Appbar title="Raise a complaint" />

      <View className="gap-2">
        <AppText variant="label" className="text-ink2">
          Category
        </AppText>
        <View className="flex-row flex-wrap gap-2.5">
          {ENTRIES.map(([value, meta]) => {
            const selected = category === value;
            return (
              <PressableScale
                key={value}
                onPress={() => setCategory(value)}
                haptic="selection"
                pressedScale={0.94}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                className={cn(
                  'w-[30%] items-center gap-2 rounded-tile border py-4',
                  selected ? 'border-brand bg-brand-soft' : 'border-line bg-surface',
                )}
              >
                <Ionicons
                  name={meta.icon}
                  size={22}
                  color={selected ? tokens.brandDeep : tokens.ink2}
                />
                <AppText
                  variant="caption"
                  weight="medium"
                  className={cn('text-[12px]', selected ? 'text-brand-deep' : 'text-ink2')}
                >
                  {meta.label}
                </AppText>
              </PressableScale>
            );
          })}
        </View>
      </View>

      <Input
        label="Description"
        value={description}
        onChangeText={setDescription}
        placeholder="Describe the issue…"
        multiline
        hint={
          description.trim().length > 0 && description.trim().length < 3
            ? 'A few more words help your manager act faster.'
            : undefined
        }
      />

      <View className="gap-2">
        <AppText variant="label" className="text-ink2">
          Photo (optional)
        </AppText>
        <AppText variant="caption" className="text-[12px]">
          JPG, PNG or WebP · max {MAX_UPLOAD_LABEL}
        </AppText>
        {photo ? (
          <View className="flex-row items-center gap-3 rounded-tile border border-line bg-surface2 p-3">
            <Image source={{ uri: photo.uri }} className="h-12 w-12 rounded-lg" />
            <AppText variant="sub" className="flex-1 text-ink" numberOfLines={1}>
              {photo.fileName}
            </AppText>
            <PressableScale
              onPress={() => setPhoto(null)}
              accessibilityRole="button"
              accessibilityLabel="Remove photo"
              className="h-9 w-9 items-center justify-center"
            >
              <Ionicons name="close-circle" size={22} color={tokens.ink3} />
            </PressableScale>
          </View>
        ) : (
          <View className="flex-row gap-3">
            <AttachButton icon="image-outline" label="Gallery" onPress={() => selectPhoto('library')} />
            <AttachButton icon="camera-outline" label="Camera" onPress={() => selectPhoto('camera')} />
          </View>
        )}
      </View>

      <Button
        title="Submit complaint"
        onPress={submit}
        loading={submitting}
        disabled={!valid}
      />
    </Screen>
  );
}

function AttachButton({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  const tokens = useTokens();
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      className="min-h-[52px] flex-1 flex-row items-center justify-center gap-2 rounded-tile border border-dashed border-line py-4"
    >
      <Ionicons name={icon} size={20} color={tokens.ink2} />
      <AppText variant="label" className="text-ink2">
        {label}
      </AppText>
    </PressableScale>
  );
}
