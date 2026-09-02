function field(row, ...candidates) {
  for (const key of candidates) {
    if (row[key] != null) return row[key];
  }
  const lower = Object.fromEntries(Object.entries(row).map(([key, value]) => [key.toLowerCase(), value]));
  for (const key of candidates) {
    if (lower[key.toLowerCase()] != null) return lower[key.toLowerCase()];
  }
  return undefined;
}

function quoteId(name) {
  return `\`${String(name).replace(/`/g, "``")}\``;
}

function pickIndexToKeep(indexes) {
  const primary = indexes.find((idx) => idx.name === "PRIMARY");
  if (primary) return primary;
  const withoutSuffix = indexes.filter((idx) => !/_\d+$/.test(idx.name));
  const pool = withoutSuffix.length ? withoutSuffix : indexes;
  return [...pool].sort((a, b) => a.name.length - b.name.length || a.name.localeCompare(b.name))[0];
}

export function planDuplicateIndexDrops(indexRows) {
  const byKey = new Map();
  for (const row of indexRows) {
    const keyName = String(field(row, "Key_name", "key_name") || "");
    if (!keyName) continue;
    const seq = Number(field(row, "Seq_in_index", "seq_in_index") || 1);
    const column = String(field(row, "Column_name", "column_name") || "");
    const nonUnique = Number(field(row, "Non_unique", "non_unique") || 0);
    if (!byKey.has(keyName)) {
      byKey.set(keyName, { name: keyName, nonUnique, columns: [] });
    }
    byKey.get(keyName).columns[seq - 1] = column;
  }

  const groups = new Map();
  for (const idx of byKey.values()) {
    const sig = `${idx.nonUnique}:${idx.columns.join("\0")}`;
    if (!groups.has(sig)) groups.set(sig, []);
    groups.get(sig).push(idx);
  }

  const drops = [];
  for (const indexes of groups.values()) {
    if (indexes.length < 2) continue;
    const keep = pickIndexToKeep(indexes);
    for (const idx of indexes) {
      if (idx.name === keep.name || idx.name === "PRIMARY") continue;
      drops.push(idx.name);
    }
  }
  return drops;
}

async function pruneDuplicateIndexesForTable(sequelize, tableName) {
  let rows;
  try {
    [rows] = await sequelize.query(`SHOW INDEX FROM ${quoteId(tableName)}`);
  } catch {
    return 0;
  }
  const drops = planDuplicateIndexDrops(rows || []);
  let dropped = 0;
  for (const indexName of drops) {
    try {
      await sequelize.query(`ALTER TABLE ${quoteId(tableName)} DROP INDEX ${quoteId(indexName)}`);
      dropped += 1;
    } catch {
      // Un índice puede estar atado a una FK; se deja y se intenta el siguiente duplicado.
    }
  }
  if (dropped) {
    console.log(`[db] ${dropped} índice(s) duplicado(s) eliminados en ${tableName}`);
  }
  return dropped;
}

export async function pruneDuplicateIndexes(sequelize) {
  const [tables] = await sequelize.query(
    `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'`,
  );
  let dropped = 0;
  for (const table of tables || []) {
    const tableName = table.TABLE_NAME || table.table_name;
    if (!tableName) continue;
    dropped += await pruneDuplicateIndexesForTable(sequelize, tableName);
  }
  return dropped;
}
