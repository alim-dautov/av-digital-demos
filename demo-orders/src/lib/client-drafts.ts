"use client";

type DraftEnvelope<T> = {
  version: number;
  savedAt: number;
  expiresAt: number;
  value: T;
};

const DRAFT_VERSION = 1;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function storageKey(scope: string) {
  return `mebeldemo:draft:v${DRAFT_VERSION}:${scope}`;
}

export function readDraft<T>(scope: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(scope));
    if (!raw) return null;
    const envelope = JSON.parse(raw) as DraftEnvelope<T>;
    if (envelope.version !== DRAFT_VERSION || envelope.expiresAt < Date.now()) {
      window.localStorage.removeItem(storageKey(scope));
      return null;
    }
    return envelope.value;
  } catch {
    return null;
  }
}

export function writeDraft<T>(scope: string, value: T) {
  if (typeof window === "undefined") return;
  try {
    const savedAt = Date.now();
    window.localStorage.setItem(
      storageKey(scope),
      JSON.stringify({ version: DRAFT_VERSION, savedAt, expiresAt: savedAt + MAX_AGE_MS, value } satisfies DraftEnvelope<T>),
    );
  } catch {
    // Local storage can be disabled or full; drafts are a convenience only.
  }
}

export function clearDraft(scope: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKey(scope));
  } catch {
    // Ignore storage errors.
  }
}
