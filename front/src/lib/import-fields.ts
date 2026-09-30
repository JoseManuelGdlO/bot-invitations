export const IMPORT_FIELDS = [
  { id: "rep", label: "Nombre del representante" },
  { id: "phone", label: "Número de WhatsApp" },
  { id: "invited", label: "Número de personas invitadas" },
  { id: "table", label: "Mesa asignada" },
  { id: "family", label: "Familia" },
  { id: "guestType", label: "Tipo de invitado" },
  { id: "notes", label: "Notas" },
  { id: "tag", label: "Etiqueta" },
  { id: "image", label: "Imagen o QR" },
  { id: "ignore", label: "No importar" },
] as const;

export type ImportFieldId = (typeof IMPORT_FIELDS)[number]["id"];

export type TemplateCoreFieldId = Exclude<ImportFieldId, "ignore">;

export const FIELD_IDS = new Set<string>(IMPORT_FIELDS.map((f) => f.id));

export const REQUIRED_TEMPLATE_FIELD_IDS: readonly TemplateCoreFieldId[] = [
  "rep",
  "phone",
];

export const TEMPLATE_CORE_FIELDS = IMPORT_FIELDS.filter(
  (f): f is (typeof IMPORT_FIELDS)[number] & { id: TemplateCoreFieldId } =>
    f.id !== "ignore",
);

export const TEMPLATE_FIELD_HEADERS: Record<TemplateCoreFieldId, string> = {
  rep: "Nombre",
  phone: "Teléfono",
  invited: "Invitados",
  table: "Mesa",
  family: "Familia",
  guestType: "Tipo",
  notes: "Notas",
  tag: "Etiqueta",
  image: "Imagen",
};

export const MAX_CUSTOM_TEMPLATE_COLUMNS = 30;

export type ImageImportStatus = "image" | "link" | "empty";

export function imageImportStatus(
  columns: string[],
  rows: string[][],
  mapping: Record<string, string>,
  extra: {
    sheetRows?: number[];
    hyperlinks?: string[][];
    embeddedImageCells?: string[];
  } = {},
): ImageImportStatus[] {
  const colIndex = columns.findIndex((col) => mapping[col] === "image");
  const embedded = new Set(extra.embeddedImageCells || []);
  return rows.map((row, index) => {
    if (colIndex < 0) return "empty";
    const sheetRow = extra.sheetRows?.[index] ?? index + 2;
    if (embedded.has(`${sheetRow}:${colIndex + 1}`)) return "image";
    const link = extra.hyperlinks?.[index]?.[colIndex]?.trim() || "";
    const text = String(row[colIndex] || "").trim();
    const candidate = /^https?:\/\//i.test(link) ? link : text;
    if (/^https:\/\//i.test(candidate)) return "link";
    return "empty";
  });
}

export function guestTemplateHeaders(
  selectedIds: Iterable<string>,
  customLabels: string[],
): string[] {
  const selected = new Set(selectedIds);
  for (const id of REQUIRED_TEMPLATE_FIELD_IDS) selected.add(id);
  const core = TEMPLATE_CORE_FIELDS.filter((f) => selected.has(f.id)).map(
    (f) => TEMPLATE_FIELD_HEADERS[f.id],
  );
  return [...core, ...customLabels.map((label) => label.trim()).filter(Boolean)];
}
