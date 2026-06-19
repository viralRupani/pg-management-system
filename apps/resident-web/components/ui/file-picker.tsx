"use client";

import * as React from "react";

/**
 * Imperative file picker — a hidden <input type="file"> exposed via a ref so a
 * button elsewhere can open it. Replaces expo-image-picker / expo-document-picker.
 * `capture="environment"` (set per-instance) gives a camera affordance on mobile
 * browsers. Resets value after each pick so re-selecting the same file re-fires.
 */
export interface FilePickerHandle {
  open: () => void;
}

export const FilePicker = React.forwardRef<
  FilePickerHandle,
  {
    accept: string;
    capture?: "environment" | "user";
    onPick: (file: File) => void;
  }
>(function FilePicker({ accept, capture, onPick }, ref) {
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useImperativeHandle(ref, () => ({
    open: () => inputRef.current?.click(),
  }));

  return (
    <input
      ref={inputRef}
      type="file"
      accept={accept}
      capture={capture}
      className="hidden"
      onChange={(e) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (file) onPick(file);
      }}
    />
  );
});
