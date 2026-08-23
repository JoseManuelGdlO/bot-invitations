import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { serializeGuest } from "../utils/serialize.js";

export function guestsToRows(guests, eventSlug) {
  return guests.map((g) => serializeGuest(g, eventSlug));
}

export async function toCsv(rows) {
  const headers = [
    "Representante",
    "Teléfono",
    "Invitados",
    "Confirmados",
    "Mesa",
    "Familia",
    "Tipo",
    "Etiqueta",
    "Estado",
    "WhatsApp",
    "Notas",
  ];
  const lines = [
    headers.join(","),
    ...rows.map((g) =>
      [
        g.rep,
        g.phone,
        g.invited,
        g.confirmed,
        g.table,
        g.family,
        g.guestType,
        g.tag,
        g.status,
        g.whatsapp,
        g.notes,
      ]
        .map((v) => `"${String(v ?? "").replaceAll('"', '""')}"`)
        .join(","),
    ),
  ];
  return Buffer.from(lines.join("\n"), "utf8");
}

export async function toXlsx(rows, title = "Invitados") {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet(title);
  sheet.columns = [
    { header: "Representante", key: "rep", width: 28 },
    { header: "Teléfono", key: "phone", width: 20 },
    { header: "Invitados", key: "invited", width: 12 },
    { header: "Confirmados", key: "confirmed", width: 14 },
    { header: "Mesa", key: "table", width: 14 },
    { header: "Familia", key: "family", width: 16 },
    { header: "Tipo", key: "guestType", width: 16 },
    { header: "Etiqueta", key: "tag", width: 16 },
    { header: "Estado", key: "status", width: 18 },
    { header: "WhatsApp", key: "whatsapp", width: 14 },
    { header: "Notas", key: "notes", width: 32 },
  ];
  rows.forEach((r) => sheet.addRow(r));
  sheet.getRow(1).font = { bold: true };
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function toPdf(event, rows) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: "A4" });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.fontSize(18).text(event.name);
    doc.fontSize(11).fillColor("#666").text(`${event.date} · ${event.venue}`);
    doc.moveDown();
    doc.fillColor("#111").fontSize(12).text("Lista de confirmados");
    doc.moveDown(0.5);
    rows.forEach((g) => {
      doc.fontSize(11).text(`${g.rep} — ${g.confirmed}/${g.invited} · ${g.table || "Sin mesa"}`);
    });
    doc.end();
  });
}
