// Profile photos: validated by their bytes (not the name), stored under random names.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const MAX_PHOTOS = 4;
export const MAX_BYTES = 3 * 1024 * 1024;

const TYPES = [
  { ext: 'jpg', mime: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'png', mime: 'image/png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: 'webp', mime: 'image/webp', test: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
];

export function sniff(buf) {
  return TYPES.find((t) => buf.length > 12 && t.test(buf)) || null;
}

export function mimeFor(file) {
  return TYPES.find((t) => file.endsWith(`.${t.ext}`))?.mime || 'application/octet-stream';
}

// dataUrl: "data:image/jpeg;base64,...." as produced by a FileReader in the browser.
export function decodeUpload(dataUrl) {
  const m = /^data:[\w/+.-]+;base64,([A-Za-z0-9+/=\s]+)$/.exec(String(dataUrl || ''));
  if (!m) return { error: 'That does not look like an image.' };
  const buf = Buffer.from(m[1], 'base64');
  if (buf.length > MAX_BYTES) return { error: 'Photos can be up to 3 MB.' };
  const type = sniff(buf);
  if (!type) return { error: 'Use a JPEG, PNG or WebP photo.' };
  return { buf, type };
}

export function createPhotoStore(dir) {
  const mem = new Map(); // used when no directory is configured (tests)
  return {
    save(buf, type) {
      const id = `${crypto.randomBytes(12).toString('base64url')}.${type.ext}`;
      if (dir) {
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, id), buf);
      } else mem.set(id, buf);
      return id;
    },
    read(id) {
      if (!/^[\w-]+\.(jpg|png|webp)$/.test(id)) return null;
      if (!dir) return mem.get(id) || null;
      const file = path.join(dir, id);
      return fs.existsSync(file) ? fs.readFileSync(file) : null;
    },
    remove(id) {
      if (!/^[\w-]+\.(jpg|png|webp)$/.test(id)) return;
      if (!dir) return void mem.delete(id);
      fs.rmSync(path.join(dir, id), { force: true });
    },
  };
}
