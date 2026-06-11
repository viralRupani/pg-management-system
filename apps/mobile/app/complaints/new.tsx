import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Image, Pressable, Text, View } from 'react-native';

import { Appbar } from '@/components/ui/appbar';
import { Button } from '@/components/ui/button';
import { COMPLAINT_CATEGORIES } from '@/components/ui/categories';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
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
        <Text className="text-[13px] font-semibold text-ink2">Category</Text>
        <View className="flex-row flex-wrap gap-2.5">
          {ENTRIES.map(([value, meta]) => {
            const selected = category === value;
            return (
              <Pressable
                key={value}
                onPress={() => setCategory(value)}
                className={cn(
                  'w-[30%] items-center gap-2 rounded-btn border py-4 active:opacity-70',
                  selected ? 'border-brand bg-brand-soft' : 'border-line bg-surface',
                )}
              >
                <Ionicons
                  name={meta.icon}
                  size={22}
                  color={selected ? '#0b7d73' : '#6b7280'}
                />
                <Text
                  className={cn(
                    'text-[12px] font-medium',
                    selected ? 'text-brand-deep' : 'text-ink2',
                  )}
                >
                  {meta.label}
                </Text>
              </Pressable>
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
      />

      <View className="gap-2">
        <Text className="text-[13px] font-semibold text-ink2">Photo (optional)</Text>
        <Text className="text-[12px] text-ink3">JPG, PNG or WebP · max {MAX_UPLOAD_LABEL}</Text>
        {photo ? (
          <View className="flex-row items-center gap-3 rounded-btn border border-line bg-surface2 p-3">
            <Image source={{ uri: photo.uri }} className="h-12 w-12 rounded-lg" />
            <Text className="flex-1 text-[13px] text-ink" numberOfLines={1}>
              {photo.fileName}
            </Text>
            <Pressable onPress={() => setPhoto(null)}>
              <Ionicons name="close-circle" size={22} color="#9ca3af" />
            </Pressable>
          </View>
        ) : (
          <View className="flex-row gap-3">
            <Pressable
              onPress={() => selectPhoto('library')}
              className="flex-1 flex-row items-center justify-center gap-2 rounded-btn border border-dashed border-line py-4 active:opacity-60"
            >
              <Ionicons name="image-outline" size={20} color="#6b7280" />
              <Text className="text-[13px] font-semibold text-ink2">Gallery</Text>
            </Pressable>
            <Pressable
              onPress={() => selectPhoto('camera')}
              className="flex-1 flex-row items-center justify-center gap-2 rounded-btn border border-dashed border-line py-4 active:opacity-60"
            >
              <Ionicons name="camera-outline" size={20} color="#6b7280" />
              <Text className="text-[13px] font-semibold text-ink2">Camera</Text>
            </Pressable>
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
