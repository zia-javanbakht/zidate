// Load Playwright from the project or a global install; tests skip if neither exists.
export async function loadChromium() {
  for (const spec of ['playwright', '/opt/node22/lib/node_modules/playwright/index.mjs']) {
    try {
      return (await import(spec)).chromium;
    } catch { /* try next */ }
  }
  return null;
}
