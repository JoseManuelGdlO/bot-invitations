import XLSX from "xlsx";

const FIELD_ALIASES = {
  nombre: "rep",
  representante: "rep",
  name: "rep",
  telefono: "phone",
  teléfono: "phone",
  whatsapp: "phone",
  phone: "phone",
  invitados: "invited",
  personas: "invited",
  mesa: "table",
  familia: "family",
  tipo: "guestType",
  notas: "notes",
  etiqueta: "tag",
  tag: "tag",
};

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
    mapping[col] = FIELD_ALIASES[key] || "ignore";
  }
  return mapping;
}

export function mapRows(columns, rows, mapping) {
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
      };
      columns.forEach((col, i) => {
        const field = mapping[col];
        if (!field || field === "ignore") return;
        const value = row[i] ?? "";
        if (field === "invited") item.invited = Math.max(1, Number(value) || 1);
        else item[field] = String(value);
      });
      return item;
    })
    .filter((item) => item.rep && item.phone);
}
