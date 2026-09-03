import assert from "node:assert/strict";
import { describe, test } from "node:test";
import * as XLSX from "xlsx";
import { buildGuestTemplateWorkbook } from "./download-guest-template.ts";

describe("buildGuestTemplateWorkbook", () => {
  test("genera una hoja con solo encabezados", () => {
    const wb = buildGuestTemplateWorkbook(["Nombre", "Teléfono", "Mesa"]);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    assert.equal(wb.SheetNames[0], "Invitados");
    assert.ok(sheet);
    assert.deepEqual(XLSX.utils.sheet_to_json(sheet, { header: 1 }), [
      ["Nombre", "Teléfono", "Mesa"],
    ]);
  });
});
