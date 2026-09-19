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

export type BgRequest = {
  type: 'FETCH_GOONBOX_IMAGE';
  id: string;
};

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
  | { ok: true; data: GoonBoxImagePayload }
  | { ok: false; error: string };

export type LoadKind = 'strip' | 'api' | 'attachment' | 'direct';
export type ResolvePhase = 'strip' | 'after-strip-error' | 'after-api-error';

export type ResolveResult =
  | { kind: 'strip' | 'attachment' | 'direct'; url: string }
  | { kind: 'api'; id: string };
