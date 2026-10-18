import { createApp } from './app.js';
const app = await createApp();
const port = Number(process.env.PORT || process.env.API_PORT || 4000);
const host =
  process.env.API_HOST ||
  (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');
await app.listen(port, host);
console.log(
  `SupportIQ API listening on ${host}:${port}` +
    (process.env.NODE_ENV === 'production'
      ? ''
      : `; OpenAPI at http://127.0.0.1:${port}/docs`),
);
