// A tiny JSON-file store. Good enough for a single-process app and easy to inspect.
// Writes are atomic (write temp file, then rename) and serialised.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

function blank() {
  return { users: {}, sessions: {}, conversations: {}, weeks: {}, likes: {}, matches: {}, messages: {}, reports: [] };
}

export class Store {
  constructor(file) {
    this.file = file;
    this.data = blank();
    this.pending = null;
    if (file && fs.existsSync(file)) {
      this.data = { ...blank(), ...JSON.parse(fs.readFileSync(file, 'utf8')) };
    }
  }

  id(prefix) {
    return `${prefix}_${crypto.randomBytes(9).toString('base64url')}`;
  }

  // Persist on the next tick so a burst of changes in one request becomes one write.
  save() {
    if (!this.file || this.pending) return;
    this.pending = setImmediate(() => {
      this.pending = null;
      this.flush();
    });
  }

  flush() {
    if (!this.file) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data));
    fs.renameSync(tmp, this.file);
  }
}
