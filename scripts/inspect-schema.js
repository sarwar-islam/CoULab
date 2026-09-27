const db = require('../server/db');

const tables = db.all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
for (const row of tables) {
  const t = row.name;
  if (t.startsWith('sqlite_') || t.startsWith('_prisma')) continue;
  const cols = db.all(`PRAGMA table_info("${t}")`);
  console.log(`\n=== ${t} ===`);
  console.log(cols.map(c => `${c.name} (${c.type}${c.notnull ? ' NOT NULL' : ''}${c.dflt_value !== null ? ' DEFAULT ' + c.dflt_value : ''})`).join('\n  '));
}
