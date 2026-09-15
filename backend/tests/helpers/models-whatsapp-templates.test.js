import { jest } from "@jest/globals";
import { DataTypes } from "sequelize";
import { createModelsBundle } from "./models.js";
import {
  ChannelIntegration,
  WhatsappMessageTemplate,
  sequelize,
  ensureWhatsappTemplateDisplayName,
} from "../../src/models/index.js";
import {
  displayNameOrPreview,
  normalizeDisplayName,
} from "../../src/services/whatsapp-template-slots.js";

describe("createModelsBundle whatsapp templates", () => {
  test("incluye WhatsappMessageTemplate y EventWhatsappTemplate", () => {
    const models = createModelsBundle();
    expect(models.WhatsappMessageTemplate.create).toEqual(expect.any(Function));
    expect(models.EventWhatsappTemplate.create).toEqual(expect.any(Function));
  });
});

describe("WhatsappMessageTemplate.displayName", () => {
  test("es STRING(120) nullable con default null, distinto del de integraciones", () => {
    const attr = WhatsappMessageTemplate.rawAttributes.displayName;
    expect(attr).toBeDefined();
    expect(attr.type).toBeInstanceOf(DataTypes.STRING);
    expect(attr.type.options.length).toBe(120);
    expect(attr.allowNull).toBe(true);
    expect(attr.defaultValue ?? null).toBeNull();
    expect(ChannelIntegration.rawAttributes.displayName.type.options.length).toBe(160);
  });
});

describe("ensureWhatsappTemplateDisplayName", () => {
  test("hace addColumn si la tabla existe y falta displayName", async () => {
    const qi = sequelize.getQueryInterface();
    const describeTable = jest.spyOn(qi, "describeTable").mockResolvedValue({
      id: { type: "CHAR(36)" },
    });
    const addColumn = jest.spyOn(qi, "addColumn").mockResolvedValue();
    try {
      await ensureWhatsappTemplateDisplayName();
      expect(describeTable).toHaveBeenCalledWith("whatsapp_message_templates");
      expect(addColumn).toHaveBeenCalledTimes(1);
      expect(addColumn.mock.calls[0][0]).toBe("whatsapp_message_templates");
      expect(addColumn.mock.calls[0][1]).toBe("displayName");
      const spec = addColumn.mock.calls[0][2];
      expect(spec.allowNull).toBe(true);
      expect(spec.defaultValue ?? null).toBeNull();
      expect(spec.type.options.length).toBe(120);
    } finally {
      describeTable.mockRestore();
      addColumn.mockRestore();
    }
  });

  test("no llama addColumn si displayName ya existe", async () => {
    const qi = sequelize.getQueryInterface();
    const describeTable = jest.spyOn(qi, "describeTable").mockResolvedValue({
      displayName: { type: "VARCHAR(120)" },
    });
    const addColumn = jest.spyOn(qi, "addColumn").mockResolvedValue();
    try {
      await ensureWhatsappTemplateDisplayName();
      expect(addColumn).not.toHaveBeenCalled();
    } finally {
      describeTable.mockRestore();
      addColumn.mockRestore();
    }
  });

  test("sale si la tabla aún no existe", async () => {
    const qi = sequelize.getQueryInterface();
    const describeTable = jest.spyOn(qi, "describeTable").mockRejectedValue(new Error("no table"));
    const addColumn = jest.spyOn(qi, "addColumn").mockResolvedValue();
    try {
      await ensureWhatsappTemplateDisplayName();
      expect(addColumn).not.toHaveBeenCalled();
    } finally {
      describeTable.mockRestore();
      addColumn.mockRestore();
    }
  });
});

describe("displayNameOrPreview", () => {
  test("normalizeDisplayName recorta, trim y vacío a null", () => {
    expect(normalizeDisplayName("  Formal  ")).toBe("Formal");
    expect(normalizeDisplayName("   ")).toBeNull();
    expect(normalizeDisplayName(null)).toBeNull();
    expect(normalizeDisplayName(`${"a".repeat(130)}`)).toHaveLength(120);
  });

  test("usa displayName persistido si hay texto", () => {
    expect(displayNameOrPreview({
      displayName: "  Invitación formal  ",
      body: "Hola {{1}}, tienes {{2}} pases reservados. Confirma por este chat, por favor.",
    })).toBe("Invitación formal");
  });

  test("si displayName es null recorta el body sin placeholders", () => {
    expect(displayNameOrPreview({
      displayName: null,
      body: "Hola {{1}}, tienes {{2}} pases reservados. Confirma por este chat, por favor.",
    })).toBe("Hola, tienes pases reservados. Confirma por este chat, por favor.");
  });

  test("trunca el preview a 80 caracteres y lee el body de components", () => {
    const body = `Inicio ${"palabra ".repeat(30)}fin`;
    const preview = displayNameOrPreview({
      displayName: "  ",
      components: [{ type: "BODY", text: body }],
    });
    expect(preview).toHaveLength(80);
    expect(preview.startsWith("Inicio")).toBe(true);
  });
});
