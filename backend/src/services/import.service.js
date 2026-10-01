import XLSX from "xlsx";
import { normalizeGuestPhoneDigits } from "../utils/whatsapp-identity.js";

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
  enlace: "enlace",
  link: "enlace",
  url: "enlace",
  imagen: "image",
  image: "image",
  qr: "image",
  "codigo qr": "image",
  codigo_qr: "image",
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
  "enlace",
]);

const MAX_CUSTOM_COLUMNS = 30;
const MAX_CUSTOM_VALUE = 240;
const ENLACE_MAX = 1000;
const BLOCKED_CUSTOM_KEYS = new Set(["__proto__", "prototype", "constructor", "image"]);

export function sanitizeGuestCustomData(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out = {};
  let count = 0;
  for (const [key, value] of Object.entries(raw)) {
    if (count >= MAX_CUSTOM_COLUMNS) break;
    if (BLOCKED_CUSTOM_KEYS.has(key)) continue;
    if (!/^\w{1,40}$/.test(key)) continue;
    if (key !== "enlace" && RESERVED_TEMPLATE_KEYS.has(key)) continue;
    const text = String(value ?? "").trim();
    if (!text) continue;
    const max = key === "enlace" ? ENLACE_MAX : MAX_CUSTOM_VALUE;
    out[key] = text.slice(0, max);
    count += 1;
  }
  return out;
}

function enlaceFromCell(text, hyperlink) {
  const link = String(hyperlink || "").trim();
  const value = String(text || "").trim();
  const stored = /^https?:\/\//i.test(link) ? link : value;
  return stored.slice(0, ENLACE_MAX);
}

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
  const rows = [];
  const sheetRows = [];
  const hyperlinks = [];
  for (let r = 1; r < matrix.length; r += 1) {
    const row = matrix[r] || [];
    const cells = columns.map((_, i) => String(row[i] ?? "").trim());
    const links = columns.map((_, i) => {
      const addr = XLSX.utils.encode_cell({ r, c: i });
      const target = sheet?.[addr]?.l?.Target;
      return target ? String(target).trim() : "";
    });
    if (!cells.some((cell) => cell !== "")) continue;
    rows.push(cells);
    sheetRows.push(r + 1);
    hyperlinks.push(links);
  }
  return { filename: "", columns, rows, sheetRows, hyperlinks };
}

export function suggestMapping(columns) {
  const mapping = {};
  for (const col of columns) {
    const key = col.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    mapping[col] = FIELD_ALIASES[key] || "custom";
  }
  return mapping;
}

export function mapRows(columns, rows, mapping, options = {}) {
  const sheetRows = options.sheetRows || [];
  const hyperlinks = options.hyperlinks || [];
  const varKeys = columnVarKeys(columns);
  return rows
    .map((row, rowIndex) => {
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
        imageCell: "",
        sheetRow: sheetRows[rowIndex] || rowIndex + 2,
      };
      let extraCount = 0;
      columns.forEach((col, i) => {
        const field = mapping[col];
        if (!field || field === "ignore") return;
        const value = row[i] ?? "";
        if (field === "image") {
          const link = String(hyperlinks[rowIndex]?.[i] || "").trim();
          const text = String(value || "").trim();
          item.imageCell = /^https?:\/\//i.test(link) ? link : (text || link);
          return;
        }
        if (field === "enlace") {
          const stored = enlaceFromCell(value, hyperlinks[rowIndex]?.[i]);
          if (stored) item.customData.enlace = stored;
          return;
        }
        if (CORE_IMPORT_FIELDS.has(field)) {
          if (field === "invited") item.invited = Math.max(1, Number(value) || 1);
          else if (field === "phone") item.phone = normalizeGuestPhoneDigits(value);
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
