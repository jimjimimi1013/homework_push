import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';

// Browser-visible production endpoints. Environment variables may override these
// in Vercel; no server-side or private credentials are included here.
const config = {
  LIN_API_URL: process.env.LIN_API_URL || 'https://vuucplkujislvarqvdzf.supabase.co/functions/v1/homework-api',
  LIN_PUSH_API_URL: process.env.LIN_PUSH_API_URL || 'https://vuucplkujislvarqvdzf.supabase.co/functions/v1/push-api',
  LIN_SUPABASE_ANON_KEY: process.env.LIN_SUPABASE_ANON_KEY || 'sb_publishable_ojfvrnCUjsDu5MIVthuQpQ_FO81LRCX',
};
const required = Object.keys(config);

const dist = new URL('../dist/', import.meta.url);
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(new URL('../public/', import.meta.url), dist, { recursive: true });

const buildVersion = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || String(Date.now());
let serviceWorker = await readFile(new URL('sw.js', dist), 'utf8');
serviceWorker = serviceWorker.replaceAll('__LIN_BUILD_VERSION__', buildVersion);
await writeFile(new URL('sw.js', dist), serviceWorker);

let app = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
for (const key of required) app = app.replaceAll(`__${key}__`, config[key]);
await writeFile(new URL('app.js', dist), app);

const zipped = gzipSync(app, { mtime: 0 });
const parts = 8;
const size = Math.ceil(zipped.length / parts);
for (let i = 0; i < parts; i += 1) {
  await writeFile(new URL(`g${i}.bin`, dist), zipped.subarray(i * size, (i + 1) * size));
}

let index = await readFile(new URL('index.html', dist), 'utf8');
index = index.replace(/g(\d+)\.bin\?v=\d+/g, `g$1.bin?v=${Date.now()}`);
await writeFile(new URL('index.html', dist), index);
