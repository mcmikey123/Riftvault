/**
 * Client-side image prep for scanning. The Anthropic API downscales to
 * ~1.15MP, so resolution — not the model — is the binding constraint:
 * single shots are resized to ~1600px long edge; binder-page shots are
 * sliced into 4 slightly-overlapping quadrant crops sent as one request.
 */

const MAX_LONG_EDGE = 1600;
const JPEG_QUALITY = 0.8;
const QUADRANT_OVERLAP = 0.06;

async function toBitmap(file: File): Promise<ImageBitmap> {
  return createImageBitmap(file);
}

function drawToBlob(
  source: ImageBitmap,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
): Promise<Blob> {
  const scale = Math.min(1, MAX_LONG_EDGE / Math.max(sw, sh));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(sw * scale);
  canvas.height = Math.round(sh * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('canvas encode failed'))),
      'image/jpeg',
      JPEG_QUALITY,
    );
  });
}

export async function prepareSingle(file: File): Promise<Blob[]> {
  const bmp = await toBitmap(file);
  try {
    return [await drawToBlob(bmp, 0, 0, bmp.width, bmp.height)];
  } finally {
    bmp.close();
  }
}

export async function prepareQuadrants(file: File): Promise<Blob[]> {
  const bmp = await toBitmap(file);
  try {
    const w = bmp.width;
    const h = bmp.height;
    const ox = Math.round(w * QUADRANT_OVERLAP);
    const oy = Math.round(h * QUADRANT_OVERLAP);
    const halfW = Math.round(w / 2);
    const halfH = Math.round(h / 2);
    const regions: [number, number, number, number][] = [
      [0, 0, halfW + ox, halfH + oy],
      [halfW - ox, 0, w - (halfW - ox), halfH + oy],
      [0, halfH - oy, halfW + ox, h - (halfH - oy)],
      [halfW - ox, halfH - oy, w - (halfW - ox), h - (halfH - oy)],
    ];
    const blobs: Blob[] = [];
    for (const [sx, sy, sw, sh] of regions) {
      blobs.push(await drawToBlob(bmp, sx, sy, sw, sh));
    }
    return blobs;
  } finally {
    bmp.close();
  }
}
