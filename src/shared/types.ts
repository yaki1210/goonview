export interface GalleryItem {
  previewUrl: string;
  wrapperHref: string | null;
  unwrappedHref: string | null;
  dataUrl: string | null;
  wrapperDataSrc: string | null;
  alt: string;
  originalUrl?: string;
  originalState: 'idle' | 'resolving' | 'ready' | 'unavailable';
  apiAttempted?: boolean;
}

export interface Settings {
  interceptEnabled: boolean;
  interceptXfAttachments: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  interceptEnabled: true,
  interceptXfAttachments: true,
};

export type BgRequest =
  | { type: 'FETCH_GOONBOX_IMAGE'; id: string }
  | { type: 'SAVE_IMAGE_AS'; url: string; filename: string }
  | { type: 'FETCH_IMAGE_BYTES'; url: string }
  | { type: 'ENSURE_BATCH_ACCESS'; origins: string[] }
  | { type: 'DOWNLOAD_URL'; url: string; filename: string };

export type GoonBoxImagePayload = {
  image?: {
    original_url?: string;
    url?: string;
    thumb_url?: string;
    mime?: string;
    original_filename?: string;
    encoded_id?: string;
  };
  redirect?: string;
};

export type BgResponse =
  | { ok: true; data?: GoonBoxImagePayload; base64?: string; mime?: string }
  | { ok: false; error: string; canceled?: boolean };

export type LoadKind = 'strip' | 'api' | 'attachment' | 'direct';
export type ResolvePhase = 'strip' | 'after-strip-error' | 'after-api-error';

export type ResolveResult =
  | { kind: 'strip' | 'attachment' | 'direct'; url: string }
  | { kind: 'api'; id: string };
