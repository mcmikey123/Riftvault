import type {
  Adjustment,
  AdjustResult,
  BulkResponse,
  Card,
  DeckDiff,
  EntrySource,
  Product,
  RecommendationsResponse,
  ScanResponse,
  SetSummary,
  VaultRow,
} from '@riftvault/types';

export function getVaultKey(): string {
  return localStorage.getItem('vault_key') ?? '';
}
export function setVaultKey(key: string) {
  localStorage.setItem('vault_key', key);
}

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const key = getVaultKey();
  if (key) headers.set('x-vault-key', key);
  const res = await fetch(path, { ...init, headers });
  if (!res.ok) {
    let message = `${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      /* not json */
    }
    throw new ApiError(res.status, message);
  }
  return res.json() as Promise<T>;
}

function post<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export type DeckJson = {
  id: number;
  name: string;
  kind: string;
  source_url: string | null;
  archetype: string | null;
  popularity_rank: number | null;
  source_text: string;
  created_at: string;
  updated_at: string | null;
  card_count: number;
  unresolved: string[];
};

export const api = {
  me: () => request<{ id: number; name: string }>('/api/me'),
  sets: () => request<SetSummary[]>('/api/sets'),
  cards: (params: { set?: string; q?: string; page?: number; pageSize?: number }) => {
    const search = new URLSearchParams();
    if (params.set) search.set('set', params.set);
    if (params.q) search.set('q', params.q);
    if (params.page) search.set('page', String(params.page));
    if (params.pageSize) search.set('pageSize', String(params.pageSize));
    return request<{ cards: Card[]; total: number | null }>(`/api/cards?${search}`);
  },
  vault: () => request<VaultRow[]>('/api/vault'),
  adjust: (adjustments: Adjustment[], source: EntrySource, batch_id?: string) =>
    post<AdjustResult>('/api/vault/adjust', { adjustments, source, batch_id }),
  undo: (batchId: string) =>
    request<AdjustResult>(`/api/vault/undo?batch_id=${encodeURIComponent(batchId)}`, {
      method: 'POST',
    }),
  products: () => request<Product[]>('/api/products'),
  addProduct: (product_id: string) => post<AdjustResult>('/api/vault/add-product', { product_id }),
  bulk: (set_code: string, input: string) =>
    post<BulkResponse>('/api/vault/bulk', { set_code, input }),
  importCsv: (csv: string) => post<BulkResponse>('/api/import/csv', { csv }),
  decks: () => request<DeckJson[]>('/api/decks'),
  deck: (id: number | string) =>
    request<DeckJson & { cards: { card: Card; qty: number }[] }>(`/api/decks/${id}`),
  createDeck: (body: {
    name?: string;
    kind: 'mine' | 'meta';
    text?: string;
    url?: string;
    archetype?: string;
    popularity_rank?: number;
  }) => post<DeckJson>('/api/decks', body),
  deleteDeck: (id: number) => request<{ ok: true }>(`/api/decks/${id}`, { method: 'DELETE' }),
  setDeckCard: (id: number, card_id: string, qty: number, resolves_line?: string) =>
    post<DeckJson>(`/api/decks/${id}/cards`, { card_id, qty, resolves_line }),
  diff: (id: number | string) => request<DeckDiff>(`/api/decks/${id}/diff`),
  recommendations: () => request<RecommendationsResponse>('/api/recommendations'),
  scanUsage: () => request<ScanResponse['usage']>('/api/scan/usage'),
  scan: (images: Blob[], model: 'default' | 'fallback'): Promise<ScanResponse> => {
    const form = new FormData();
    images.forEach((img, i) => form.append('images', img, `scan-${i}.jpg`));
    if (model === 'fallback') form.append('model', 'fallback');
    return request<ScanResponse>('/api/scan', { method: 'POST', body: form });
  },
  exportCsv: async (): Promise<Blob> => {
    const headers = new Headers();
    const key = getVaultKey();
    if (key) headers.set('x-vault-key', key);
    const res = await fetch('/api/export', { headers });
    if (!res.ok) throw new ApiError(res.status, 'export failed');
    return res.blob();
  },
};

export function thumbUrl(cardId: string): string {
  return `/img/${cardId}.webp`;
}
