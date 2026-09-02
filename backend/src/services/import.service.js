import XLSX from "xlsx";

const FIELD_ALIASES = {
  nombre: "rep",
  "nombre completo": "rep",
  representante: "rep",
  name: "rep",
  telefono: "phone",
  teléfono: "phone",
  celular: "phone",
  whatsapp: "phone",
  phone: "phone",
  invitados: "invited",
  "nro invitados": "invited",
  cupo: "invited",
  personas: "invited",
  mesa: "table",
  familia: "family",
  tipo: "guestType",
  notas: "notes",
  etiqueta: "tag",
  tag: "tag",
};

export const CORE_IMPORT_FIELDS = new Set([
  "rep",
  "phone",
  "invited",
  "table",
  "family",
  "guestType",
  "notes",
  "tag",
]);

export const RESERVED_TEMPLATE_KEYS = new Set([
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

const MAX_CUSTOM_COLUMNS = 30;
const MAX_CUSTOM_VALUE = 240;

export function slugifyColumn(header) {
  const raw = String(header || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return raw || "columna";
}

export function columnVarKeys(columns) {
  const used = new Set();
  const keys = {};
  for (const col of columns) {
    let base = slugifyColumn(col);
    if (RESERVED_TEMPLATE_KEYS.has(base)) base = `col_${base}`;
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

export function parseSpreadsheet(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  const columns = (matrix[0] || []).map((c) => String(c || "").trim() || "Columna");
  const rows = matrix
    .slice(1)
    .filter((row) => row.some((cell) => String(cell).trim() !== ""))
    .map((row) => columns.map((_, i) => String(row[i] ?? "").trim()));
  return { filename: "", columns, rows };
}

export function suggestMapping(columns) {
  const mapping = {};
  for (const col of columns) {
    const key = col.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    mapping[col] = FIELD_ALIASES[key] || "custom";
  }
  return mapping;
}

export function mapRows(columns, rows, mapping) {
  const varKeys = columnVarKeys(columns);
  return rows
    .map((row) => {
      const item = {
        rep: "",
        phone: "",
        invited: 1,
        table: "",
        family: "",
        guestType: "",
        notes: "",
        tag: "Sin etiqueta",
        customData: {},
      };
      let extraCount = 0;
      columns.forEach((col, i) => {
        const field = mapping[col];
        if (!field || field === "ignore") return;
        const value = row[i] ?? "";
        if (CORE_IMPORT_FIELDS.has(field)) {
          if (field === "invited") item.invited = Math.max(1, Number(value) || 1);
          else item[field] = String(value);
          return;
        }
        if (extraCount >= MAX_CUSTOM_COLUMNS) return;
        const key = varKeys[col];
        if (!key) return;
        item.customData[key] = String(value).slice(0, MAX_CUSTOM_VALUE);
        extraCount += 1;
      });
      return item;
    })
    .filter((item) => item.rep && item.phone);
}
