import { MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL } from "@pg/shared";

export { MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL };

/** True if a known size exceeds the shared max. */
export function exceedsMaxSize(size?: number): boolean {
  return typeof size === "number" && size > MAX_UPLOAD_BYTES;
}

/**
 * The content-type to declare for an upload. Browsers populate File.type
 * reliably; fall back to an extension guess only when it's blank.
 */
export function contentTypeOf(file: File): string {
  return file.type || contentTypeFor(file.name);
}

/** Guess a content-type from a file name's extension. */
export function contentTypeFor(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "heic") return "image/heic";
  if (ext === "pdf") return "application/pdf";
  return "image/jpeg";
}

/**
 * Upload to an S3 presigned POST. `post.fields` MUST be appended first and the
 * binary `file` LAST — S3 ignores form fields that come after the file. On the
 * web the file is a real `File`/`Blob`, which FormData handles natively.
 *
 * Returns false on a failed upload (e.g. S3 rejects an oversize/wrong-type file
 * via the POST policy → HTTP 4xx); the caller surfaces that.
 */
export async function uploadToPresignedPost(
  post: { url: string; fields: Record<string, string> },
  file: File,
): Promise<boolean> {
  try {
    const form = new FormData();
    for (const [k, v] of Object.entries(post.fields)) form.append(k, v);
    form.append("file", file);

    const res = await fetch(post.url, { method: "POST", body: form });
    if (!res.ok) {
      console.warn(`[upload] POST failed (${res.status}) to ${post.url}`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[upload] POST errored:", err);
    return false;
  }
}

/**
 * Trigger a cross-origin file download (presigned S3 URLs ignore the <a download>
 * attribute, so fetch the bytes → object URL → click). Falls back to opening the
 * URL in a new tab if the fetch is blocked.
 */
export async function downloadCrossOrigin(
  url: string,
  filename: string,
): Promise<void> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  } catch {
    window.open(url, "_blank", "noopener");
  }
}

/**
 * Share a remote image via the Web Share API (with files when supported). Returns
 * false when sharing isn't available so the caller can hide/skip the button.
 */
export async function shareImage(
  url: string,
  filename: string,
  title: string,
): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.share) return false;
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const file = new File([blob], filename, { type: blob.type || "image/png" });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title });
      return true;
    }
    await navigator.share({ title, url });
    return true;
  } catch {
    return false;
  }
}
