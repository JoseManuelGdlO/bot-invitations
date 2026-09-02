const RESERVED = new Set([
  "nombre",
  "nombre_completo",
  "numero_invitados",
  "numero_confirmados",
  "confirmados",
  "mesa",
  "evento",
  "fecha",
  "lugar",
  "direccion",
  "hora",
  "planner",
  "familia",
  "tipo",
  "notas",
  "etiqueta",
]);

export function slugifyColumn(header: string) {
  const raw = String(header || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return raw || "columna";
}

export function columnVarKeys(columns: string[]) {
  const used = new Set<string>();
  const keys: Record<string, string> = {};
  for (const col of columns) {
    let base = slugifyColumn(col);
    if (RESERVED.has(base)) base = `col_${base}`;
    let key = base;
    let n = 2;
    while (used.has(key)) {
      key = `${base}_${n}`;
      n += 1;
    }
    used.add(key);
    keys[col] = key;
  }
  return keys;
}
