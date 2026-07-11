import Anthropic from '@anthropic-ai/sdk';
import type { ScanExtraction } from '@riftvault/types';

/**
 * Photo batch scan: images → Anthropic vision → strict-JSON extraction.
 * Name-primary — the card name is the largest text on the card and survives
 * downscaling; the collector number is tiny corner print, an optional
 * tiebreaker. Validation/resolution happens in resolveScan.ts.
 */

export const SCAN_PROMPT = `You are reading a photo of physical Riftbound TCG cards laid out face-up (possibly binder pages through plastic sleeves). Multiple images, if present, are crops/regions of the same layout — count each distinct physical card exactly once across all images; if the same card at the same position appears in two overlapping crops, do not double-count it.

Find EVERY distinct card and respond with strict JSON only — a single JSON array, no markdown fences, no commentary:

[{"name": "Void Gate", "set_code": "OGN", "collector_number": 45, "count": 1, "confidence": "high"}]

Rules:
- "name" is the PRIMARY target: the large title text on each card. Read it carefully; it matters more than anything else.
- "set_code" and "collector_number" come from the tiny corner print (like OGN 045/298). Include them ONLY when clearly legible; otherwise use null. Never guess them.
- "count": how many identical physical copies of that card are visible.
- "confidence": "high" when the name is clearly readable, "low" when glare/blur/angle makes it uncertain.
- If a card is face-down, fully obscured, or unreadable, skip it rather than inventing a name.`;

export interface ScanImage {
  data: Buffer;
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp';
}

export interface ScanRunResult {
  extractions: ScanExtraction[];
  input_tokens: number;
  output_tokens: number;
  raw_text: string;
}

/** Parse the model's response into validated extractions. Pure, unit-tested. */
export function parseScanJson(text: string): ScanExtraction[] {
  let body = text.trim();
  const fence = body.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) body = fence[1]!.trim();
  // Tolerate stray prose around the array
  if (!body.startsWith('[')) {
    const start = body.indexOf('[');
    const end = body.lastIndexOf(']');
    if (start === -1 || end <= start) return [];
    body = body.slice(start, end + 1);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const out: ScanExtraction[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const name = typeof o.name === 'string' ? o.name.trim() : '';
    if (!name) continue;
    const rawCount = typeof o.count === 'number' ? o.count : parseInt(String(o.count ?? '1'), 10);
    const collector =
      typeof o.collector_number === 'number'
        ? o.collector_number
        : typeof o.collector_number === 'string' && /^\d+/.test(o.collector_number)
          ? parseInt(o.collector_number, 10)
          : null;
    out.push({
      name,
      set_code:
        typeof o.set_code === 'string' && /^[A-Za-z]{2,5}$/.test(o.set_code.trim())
          ? o.set_code.trim().toUpperCase()
          : null,
      collector_number: collector && collector > 0 ? collector : null,
      count: Number.isFinite(rawCount) && rawCount > 0 ? Math.min(rawCount, 20) : 1,
      confidence: o.confidence === 'low' ? 'low' : 'high',
    });
  }
  return out;
}

export async function runScan(
  images: ScanImage[],
  model: string,
  apiKey: string,
): Promise<ScanRunResult> {
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model,
    max_tokens: 2000,
    messages: [
      {
        role: 'user',
        content: [
          ...images.map((img) => ({
            type: 'image' as const,
            source: {
              type: 'base64' as const,
              media_type: img.mediaType,
              data: img.data.toString('base64'),
            },
          })),
          { type: 'text' as const, text: SCAN_PROMPT },
        ],
      },
    ],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n');

  return {
    extractions: parseScanJson(text),
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
    raw_text: text,
  };
}
