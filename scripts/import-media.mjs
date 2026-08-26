import { cpSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { GymStore } from '../src/store.mjs';

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function dimensions(path) {
  const bytes = readFileSync(path);
  if (bytes.subarray(0, 3).toString('ascii') === 'GIF' && bytes.length >= 10) return { width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) };
  if (bytes.subarray(1, 4).toString('ascii') === 'PNG' && bytes.length >= 24) return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    const sof = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
    while (offset + 8 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset += 1; continue; }
      const marker = bytes[offset + 1];
      offset += 2;
      if (marker === 0xd8 || marker === 0xd9) continue;
      const length = bytes.readUInt16BE(offset);
      if (sof.has(marker)) return { height: bytes.readUInt16BE(offset + 3), width: bytes.readUInt16BE(offset + 5) };
      if (length < 2) break;
      offset += length;
    }
  }
  return null;
}

function sourceFile(root, relativePath) {
  const file = resolve(root, relativePath);
  if (!file.startsWith(`${root}${sep}`)) throw new Error(`Unsafe media path: ${relativePath}`);
  return file;
}

const sourceArgument = argument('--source');
const configPath = process.env.GYM_CONFIG ?? join(homedir(), '.config', 'personal-gym', 'config.json');
if (!sourceArgument) {
  console.error('Usage: npm run catalog:media -- --source /path/to/licensed/exercises-dataset');
  process.exit(1);
}

const source = resolve(sourceArgument);
const notice = join(source, 'NOTICE.md');
if (!existsSync(notice) || !readFileSync(notice, 'utf8').includes('Gym visual')) throw new Error('The source must include the upstream Gym visual NOTICE.md.');
const config = JSON.parse(readFileSync(configPath, 'utf8'));
if (!config.licensedMediaDirectory) throw new Error('Configure licensedMediaDirectory before importing media.');
const destination = resolve(config.licensedMediaDirectory);
const store = new GymStore(config);
try {
  const records = store.catalogMediaRecords();
  const files = records.flatMap((record) => [record.imagePath, record.gifPath]).filter(Boolean);
  if (!files.length) throw new Error('Import exercise metadata before importing media.');
  for (const relativePath of files) {
    const file = sourceFile(source, relativePath);
    if (!existsSync(file)) throw new Error(`Missing licensed media: ${relativePath}`);
    const size = dimensions(file);
    if (!size || size.width !== 180 || size.height !== 180) throw new Error(`Media must be exactly 180x180: ${relativePath}`);
  }
  mkdirSync(destination, { recursive: true, mode: 0o700 });
  for (const relativePath of files) {
    const target = join(destination, relativePath);
    mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
    cpSync(sourceFile(source, relativePath), target, { force: true });
  }
  cpSync(notice, join(destination, 'NOTICE.md'), { force: true });
  console.log(`Imported ${files.length} licensed 180x180 media files with attribution.`);
} finally {
  store.close();
}
