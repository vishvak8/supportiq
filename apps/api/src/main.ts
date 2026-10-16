import { createApp } from './app.js';
const app = await createApp();
await app.listen(Number(process.env.API_PORT || 4000), '127.0.0.1');
console.log(
  'SupportIQ API listening on loopback; OpenAPI at http://127.0.0.1:' +
    (process.env.API_PORT || 4000) +
    '/docs',
);
