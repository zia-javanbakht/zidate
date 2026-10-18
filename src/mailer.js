// Outgoing email. Every message is kept in an outbox (memory, plus a folder when configured),
// and optionally POSTed as JSON to PISHI_MAIL_WEBHOOK so any email API or relay can deliver it.
import fs from 'node:fs';
import path from 'node:path';

export function createMailer({ dir = null, webhook = null, from = 'Pishi <hello@pishi.local>' } = {}) {
  const sent = [];
  return {
    sent,
    async send({ to, subject, text }) {
      const mail = { from, to, subject, text, at: new Date().toISOString() };
      sent.push(mail);
      if (sent.length > 200) sent.shift();
      if (dir) {
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`), JSON.stringify(mail, null, 2));
      }
      if (webhook) {
        try {
          await fetch(webhook, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(mail) });
        } catch (err) {
          console.warn(`[mail] webhook failed: ${err.message}`);
        }
      }
      return mail;
    },
  };
}
