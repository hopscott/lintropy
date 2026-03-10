/**
 * One-time model download for Phi-3.5-mini-instruct Q4_K_M GGUF.
 * Uses bartowski/Phi-3.5-mini-instruct-GGUF (~2.3GB).
 */
import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';

const MODEL_URL =
  'https://huggingface.co/bartowski/Phi-3.5-mini-instruct-GGUF/resolve/main/Phi-3.5-mini-instruct-Q4_K_M.gguf';
const MODEL_DIR = path.join(process.cwd(), 'models');
const MODEL_PATH = path.join(MODEL_DIR, 'phi3.q4.gguf');

export async function downloadModel(force = false): Promise<string> {
  if (!force && fs.existsSync(MODEL_PATH)) {
    console.log('✅ Model already exists:', MODEL_PATH);
    return MODEL_PATH;
  }

  fs.mkdirSync(MODEL_DIR, { recursive: true });
  console.log('⬇️  Downloading Phi-3.5-mini (2.3GB), ~2-5min...');

  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(MODEL_PATH);
    https
      .get(MODEL_URL, (res) => {
        const total = parseInt(res.headers['content-length'] ?? '0', 10);
        let downloaded = 0;

        res.pipe(file);
        res.on('data', (chunk: Buffer) => {
          downloaded += chunk.length;
          const pct = total > 0 ? (downloaded / total) * 100 : 0;
          process.stdout.write(`\r${pct.toFixed(1)}%`);
        });

        file.on('finish', () => {
          file.close();
          console.log('\n✅ Model ready:', MODEL_PATH);
          resolve(MODEL_PATH);
        });
      })
      .on('error', (err) => {
        fs.unlink(MODEL_PATH, () => {});
        reject(err);
      });
  });
}

if (import.meta.main) {
  const force = process.argv.includes('--force');
  downloadModel(force).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
