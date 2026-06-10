/**
 * Binary upload to a presigned URL (the app owns this PUT; the API only mints
 * the URL + key and later persists the key). expo-image-picker gives a local
 * `file://` URI — we fetch it into a Blob and PUT the bytes.
 *
 * DEV CAVEAT: the API's StorageProvider stub returns `https://stub-storage.local`
 * URLs that don't resolve from the phone, so the PUT will fail in dev. The KEY is
 * what the submit step persists, so we treat the PUT as best-effort: on failure
 * we log and return false, letting the flow proceed against the stub. A real S3
 * driver (deploy time) makes the PUT a hard requirement — callers can surface the
 * `false` return if/when that matters.
 */
export async function uploadToPresignedUrl(
  uploadUrl: string,
  localUri: string,
  contentType = 'image/jpeg',
): Promise<boolean> {
  try {
    const fileRes = await fetch(localUri);
    const blob = await fileRes.blob();
    const res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: blob,
    });
    if (!res.ok) {
      console.warn(`[upload] PUT failed (${res.status}) to ${uploadUrl}`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[upload] PUT errored (dev stub URL is expected to fail):', err);
    return false;
  }
}

import * as ImagePicker from 'expo-image-picker';

export interface PickedImage {
  uri: string;
  fileName: string;
}

/**
 * Let the resident pick an image from the gallery or camera. Returns null if
 * they cancel or deny permission. Images are lightly compressed for upload.
 */
export async function pickImage(
  source: 'library' | 'camera',
): Promise<PickedImage | null> {
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return null;
  } else {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return null;
  }

  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync({ quality: 0.7 })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 0.7,
        });

  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  return {
    uri: asset.uri,
    fileName: asset.fileName ?? asset.uri.split('/').pop() ?? 'upload.jpg',
  };
}

/** Guess a content-type from a local file URI's extension. */
export function contentTypeFor(uri: string): string {
  const ext = uri.split('.').pop()?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'heic') return 'image/heic';
  if (ext === 'pdf') return 'application/pdf';
  return 'image/jpeg';
}
