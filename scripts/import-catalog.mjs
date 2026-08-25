import { readFileSync } from 'node:fs';
import { loadCatalogFile } from '../src/catalog.mjs';
import { GymStore } from '../src/store.mjs';

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

const source = argument('--source');
const revision = argument('--revision');
const configPath = process.env.GYM_CONFIG ?? '/home/ct/.config/personal-gym/config.json';

if (!source || !revision) {
  console.error('Usage: npm run catalog:import -- --source /path/to/exercises.json --revision <commit>');
  process.exit(1);
}

const config = JSON.parse(readFileSync(configPath, 'utf8'));
const store = new GymStore(config);
try {
  const records = loadCatalogFile(source);
  const imported = store.importCatalog(records, revision);
  console.log(`Imported ${imported} exercises from revision ${revision}.`);
} finally {
  store.close();
}
