const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIRS = ['mods', 'shaderpacks', 'resourcepacks'];

function sanitize(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_+/g, '_');
}

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    const safe = sanitize(entry.name);
    if (safe === entry.name) continue;
    const target = path.join(dir, safe);
    if (fs.existsSync(target)) {
      console.warn(`  SKIP (target exists): ${entry.name} → ${safe}`);
      continue;
    }
    fs.renameSync(full, target);
    console.log(`  ${entry.name} → ${safe}`);
  }
}

for (const d of DIRS) {
  const full = path.join(ROOT, d);
  if (!fs.existsSync(full)) continue;
  console.log(`\n== ${d} ==`);
  walk(full);
}
console.log('\nDone.');
