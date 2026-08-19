import { signal } from "@preact/signals";

export type PromptRequest = {
  /** Identity for the dialog component, so each request mounts fresh. */
  id: number;
  title: string;
  label: string;
  initial: string;
  confirmLabel: string;
  /** Return a message to block submission, or null to allow it. */
  validate?: (value: string) => string | null;
  resolve: (value: string | null) => void;
};

export type ConfirmRequest = {
  id: number;
  title: string;
  message: string;
  /** Consequences worth spelling out before the user commits. */
  detail: string[];
  confirmLabel: string;
  danger: boolean;
  resolve: (ok: boolean) => void;
};

export const promptRequest = signal<PromptRequest | null>(null);
export const confirmRequest = signal<ConfirmRequest | null>(null);

let nextId = 1;

export function askText(opts: Omit<PromptRequest, "resolve" | "id">): Promise<string | null> {
  return new Promise((resolve) => {
    promptRequest.value = {
      id: nextId++,
      ...opts,
      resolve: (value) => {
        promptRequest.value = null;
        resolve(value);
      },
    };
  });
}

export function askConfirm(
  opts: Partial<Omit<ConfirmRequest, "resolve" | "id">> & { title: string; message: string },
): Promise<boolean> {
  return new Promise((resolve) => {
    confirmRequest.value = {
      id: nextId++,
      detail: [],
      confirmLabel: "Confirm",
      danger: false,
      ...opts,
      resolve: (ok) => {
        confirmRequest.value = null;
        resolve(ok);
      },
    };
  });
}

/** Slug rules, mirrored from the server so the dialog can object first. */
export function validateSlug(value: string): string | null {
  if (value === "") return "A slug is required";
  if (!/^[a-z0-9][a-z0-9-]*$/.test(value)) {
    return "Lowercase letters, digits and hyphens only";
  }
  return null;
}

/** "My New Note" → "my-new-note" */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
