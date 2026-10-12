// The bell: notifications, plus the live event stream for the open app.
export default function notifications({ store, route, hub }) {
  route('GET', '/api/notifications', async ({ user }) => ({ body: { notifications: store.data.notifications?.[user.id] || [] } }));

  route('POST', '/api/notifications/read', async ({ user, body }) => {
    for (const n of store.data.notifications?.[user.id] || []) if (!body.id || n.id === body.id) n.read = true;
    return { body: { ok: true } };
  });

  route('GET', '/api/events', async ({ user, req, res }) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write('retry: 5000\n\n');
    const off = hub.subscribe(user.id, res);
    req.on('close', off);
    return { handled: true };
  });
}
