import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL } from '@pg/shared';

export interface PickedFile {
  uri: string;
  fileName: string;
  /** Size in bytes when the picker reports it (used for the client-side guard). */
  size?: number;
  /** MIME type when the picker reports it (preferred over guessing from the name). */
  mimeType?: string;
}

/** The content-type to declare for an upload: picker MIME if known, else by extension. */
export function contentTypeOf(file: PickedFile): string {
  return file.mimeType ?? contentTypeFor(file.fileName);
}

/** Backwards-compatible alias (screens import this name). */
export type PickedImage = PickedFile;

/** True if a known size exceeds the shared max. Unknown size → allowed (S3 backstops). */
export function exceedsMaxSize(size?: number): boolean {
  return typeof size === 'number' && size > MAX_UPLOAD_BYTES;
}

export { MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL };

/**
 * Upload to an S3 presigned POST. `post.fields` MUST be appended first and the
 * binary `file` LAST — S3 ignores fields after the file. expo-image-picker gives
 * a local `file://` URI; React Native FormData streams it from the URI (no Blob).
 *
 * Returns false on a failed upload (e.g. S3 rejects an oversize/wrong-type file
 * via the POST policy → HTTP 4xx); the caller can surface that.
 */
export async function uploadToPresignedPost(
  post: { url: string; fields: Record<string, string> },
  localUri: string,
  contentType: string,
  fileName: string,
): Promise<boolean> {
  try {
    const form = new FormData();
    for (const [k, v] of Object.entries(post.fields)) form.append(k, v);
    // RN's FormData accepts a { uri, name, type } file descriptor.
    form.append('file', {
      uri: localUri,
      name: fileName,
      type: contentType,
    } as unknown as Blob);

    const res = await fetch(post.url, { method: 'POST', body: form });
    if (!res.ok) {
      console.warn(`[upload] POST failed (${res.status}) to ${post.url}`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[upload] POST errored:', err);
    return false;
  }
}

/**
 * Let the resident pick an image from the gallery or camera. Returns null if
 * they cancel or deny permission. Images are lightly compressed for upload.
 */
export async function pickImage(
  source: 'library' | 'camera',
): Promise<PickedFile | null> {
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
    size: asset.fileSize,
    mimeType: asset.mimeType,
  };
}

/**
 * Pick a document for KYC — PDFs (Aadhaar, agreements) as well as images. The
 * image picker is image-only, so KYC uses the document picker.
 */
export async function pickDocument(): Promise<PickedFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
    copyToCacheDirectory: true,
  });
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  return {
    uri: asset.uri,
    fileName: asset.name ?? asset.uri.split('/').pop() ?? 'document',
    size: asset.size ?? undefined,
    mimeType: asset.mimeType,
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
