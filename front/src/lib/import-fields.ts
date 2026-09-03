export const IMPORT_FIELDS = [
  { id: "rep", label: "Nombre del representante" },
  { id: "phone", label: "Número de WhatsApp" },
  { id: "invited", label: "Número de personas invitadas" },
  { id: "table", label: "Mesa asignada" },
  { id: "family", label: "Familia" },
  { id: "guestType", label: "Tipo de invitado" },
  { id: "notes", label: "Notas" },
  { id: "tag", label: "Etiqueta" },
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
};

export const MAX_CUSTOM_TEMPLATE_COLUMNS = 30;

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
