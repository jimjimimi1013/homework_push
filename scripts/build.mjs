import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';

const required = ['LIN_API_URL', 'LIN_PUSH_API_URL', 'LIN_SUPABASE_ANON_KEY'];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  throw new Error(`Missing environment variables: ${missing.join(', ')}`);
}

const dist = new URL('../dist/', import.meta.url);
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(new URL('../public/', import.meta.url), dist, { recursive: true });

let app = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
for (const key of required) app = app.replaceAll(`__${key}__`, process.env[key]);
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
