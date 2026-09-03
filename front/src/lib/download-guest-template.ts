import * as XLSX from "xlsx";

export type GuestTemplateFormat = "xlsx" | "xls" | "csv";

export const GUEST_TEMPLATE_FILENAME = "plantilla-invitados";

export function buildGuestTemplateWorkbook(headers: string[]) {
  const ws = XLSX.utils.aoa_to_sheet([headers]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Invitados");
  return wb;
}

export function downloadGuestTemplate(
  headers: string[],
  format: GuestTemplateFormat,
) {
  if (headers.length === 0) {
    throw new Error("La plantilla no tiene columnas.");
  }
  const wb = buildGuestTemplateWorkbook(headers);
  XLSX.writeFile(wb, `${GUEST_TEMPLATE_FILENAME}.${format}`, {
    bookType: format,
  });
}
