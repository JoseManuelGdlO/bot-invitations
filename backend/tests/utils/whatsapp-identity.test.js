import {
  extractInboundIdentity,
  formatWhatsappGraphTo,
  formatWhatsappTo,
  normalizeWaIdTo10,
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

  test("deja intactos JID completo, LID y grupos", () => {
    expect(formatWhatsappTo("5216183218624@s.whatsapp.net")).toBe("5216183218624@s.whatsapp.net");
    expect(formatWhatsappTo("123456789012345@lid")).toBe("123456789012345@lid");
    expect(formatWhatsappTo("1203630-group@g.us")).toBe("1203630-group@g.us");
  });

  test("reescribe JID de usuario de 10 dígitos con 521", () => {
    expect(formatWhatsappTo("6181020927@s.whatsapp.net")).toBe("5216181020927@s.whatsapp.net");
  });

  test("no inventa 521 en vacío o corto", () => {
    expect(formatWhatsappTo("")).toBe("");
    expect(formatWhatsappTo("   ")).toBe("");
    expect(formatWhatsappTo("55")).toBe("55");
    expect(formatWhatsappTo("123456")).toBe("123456");
  });
});

describe("resolveWhatsappTo", () => {
  test("usa el chatId LID sin cambiarlo", () => {
    expect(resolveWhatsappTo({ whatsappChatId: "abc@lid", phone: "6183218624" })).toBe("abc@lid");
  });

  test("formatea JID incompleto de 10 dígitos", () => {
    expect(resolveWhatsappTo({
      whatsappChatId: "6181020927@s.whatsapp.net",
      phone: "6181020927",
    })).toBe("5216181020927@s.whatsapp.net");
  });

  test("formatea el teléfono de lista cuando no hay chatId", () => {
    expect(resolveWhatsappTo({ phone: "6183218624" })).toBe("5216183218624");
  });
});

describe("formatWhatsappGraphTo", () => {
  test("siempre entrega 521 + 10 dígitos para Graph", () => {
    expect(formatWhatsappGraphTo("6183218624")).toBe("5216183218624");
    expect(formatWhatsappGraphTo("5216183218624")).toBe("5216183218624");
    expect(formatWhatsappGraphTo("+52 1 618 321 8624")).toBe("5216183218624");
    expect(formatWhatsappGraphTo("6183218624@s.whatsapp.net")).toBe("5216183218624");
  });

  test("vacío si no hay 10 dígitos locales", () => {
    expect(formatWhatsappGraphTo("")).toBe("");
    expect(formatWhatsappGraphTo("55")).toBe("");
    expect(formatWhatsappGraphTo("abc@lid")).toBe("");
  });
});

describe("normalizeWaIdTo10", () => {
  test("toma los últimos 10 dígitos de un wa_id 521", () => {
    expect(normalizeWaIdTo10("5216183218624")).toBe("6183218624");
    expect(normalizeWaIdTo10("+52 1 618 321 8624")).toBe("6183218624");
  });

  test("deja un número que ya tiene 10 dígitos", () => {
    expect(normalizeWaIdTo10("6183218624")).toBe("6183218624");
  });

  test("extrae dígitos de un JID", () => {
    expect(normalizeWaIdTo10("5216183218624@s.whatsapp.net")).toBe("6183218624");
  });

  test("vacío si no hay dígitos", () => {
    expect(normalizeWaIdTo10("")).toBe("");
    expect(normalizeWaIdTo10("abc@lid")).toBe("");
  });
});

describe("extractInboundIdentity", () => {
  test("usa wa_id de 10 dígitos como displayPhone", () => {
    expect(extractInboundIdentity({ from: "5216181556489", fromPhone: "6181556489" })).toEqual(
      expect.objectContaining({
        chatId: "5216181556489",
        displayPhone: "6181556489",
      }),
    );
  });

  test("si solo viene from numérico, normaliza a 10 dígitos", () => {
    expect(extractInboundIdentity({ from: "5216181556489" }).displayPhone).toBe("6181556489");
  });
});
