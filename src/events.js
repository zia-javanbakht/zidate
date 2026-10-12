// Server-sent events: one stream per open tab, pushed per user.
export function createHub() {
  const streams = new Map(); // userId -> Set(res)
  return {
    subscribe(userId, res) {
      if (!streams.has(userId)) streams.set(userId, new Set());
      streams.get(userId).add(res);
      return () => {
        streams.get(userId)?.delete(res);
        if (!streams.get(userId)?.size) streams.delete(userId);
      };
    },
    publish(userId, type, data) {
      for (const res of streams.get(userId) || []) res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
    },
    count(userId) {
      return streams.get(userId)?.size || 0;
    },
    ping() {
      for (const set of streams.values()) for (const res of set) res.write(': ping\n\n');
    },
    closeAll() {
      for (const set of streams.values()) for (const res of set) res.end();
      streams.clear();
    },
  };
}
