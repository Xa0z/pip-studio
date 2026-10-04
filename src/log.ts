const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

export const log = {
  step: (name: string, msg = '') => console.log(`\n[${stamp()}] ▶ ${name}${msg ? ': ' + msg : ''}`),
  info: (msg: string) => console.log(`[${stamp()}]   ${msg}`),
  ok: (msg: string) => console.log(`[${stamp()}] ✔ ${msg}`),
  warn: (msg: string) => console.warn(`[${stamp()}] ⚠ ${msg}`),
  error: (msg: string) => console.error(`[${stamp()}] ✖ ${msg}`),
};
