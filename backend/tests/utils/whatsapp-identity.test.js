import {
  formatWhatsappTo,
  resolveWhatsappTo,
} from "../../src/utils/whatsapp-identity.js";

describe("formatWhatsappTo", () => {
  test("prefija 521 cuando hay exactamente 10 dígitos", () => {
    expect(formatWhatsappTo("6183218624")).toBe("5216183218624");
    expect(formatWhatsappTo("618 321 8624")).toBe("5216183218624");
  });

  test("no duplica 521 si ya viene el internacional", () => {
    expect(formatWhatsappTo("5216183218624")).toBe("5216183218624");
    expect(formatWhatsappTo("+52 1 618 321 8624")).toBe("5216183218624");
  });

  test("deja intactos JID y LID", () => {
    expect(formatWhatsappTo("5216183218624@s.whatsapp.net")).toBe("5216183218624@s.whatsapp.net");
    expect(formatWhatsappTo("123456789012345@lid")).toBe("123456789012345@lid");
  });

  test("no inventa 521 en vacío o corto", () => {
    expect(formatWhatsappTo("")).toBe("");
    expect(formatWhatsappTo("   ")).toBe("");
    expect(formatWhatsappTo("55")).toBe("55");
    expect(formatWhatsappTo("123456")).toBe("123456");
  });
});

describe("resolveWhatsappTo", () => {
  test("usa el chatId si es un JID", () => {
    expect(resolveWhatsappTo({ whatsappChatId: "abc@lid", phone: "6183218624" })).toBe("abc@lid");
  });

  test("formatea el teléfono de lista cuando no hay chatId", () => {
    expect(resolveWhatsappTo({ phone: "6183218624" })).toBe("5216183218624");
  });
});
