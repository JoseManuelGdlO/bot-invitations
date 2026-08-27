import { jest } from "@jest/globals";

const sendMail = jest.fn(async () => ({ messageId: "m1" }));
const createTransport = jest.fn(() => ({ sendMail }));

await jest.unstable_mockModule("nodemailer", () => ({
  default: { createTransport },
}));

describe("email.service", () => {
  const prev = { ...process.env };

  beforeEach(() => {
    process.env.SMTP_USER = "mailer@test.com";
    process.env.SMTP_PASS = "secret";
    process.env.SMTP_FROM = "mailer@test.com";
    sendMail.mockClear();
    createTransport.mockClear();
  });

  afterAll(() => {
    process.env = prev;
  });

  test("sendPasswordResetEmail no pone el token en el subject", async () => {
    const { sendPasswordResetEmail } = await import("../../src/services/email.service.js");
    await sendPasswordResetEmail({
      to: "ana@test.com",
      name: "Ana",
      resetLink: "http://localhost:8080/restablecer-contrasena?token=supersecrettoken",
    });
    expect(createTransport).toHaveBeenCalled();
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "ana@test.com",
        subject: "Restablece tu contraseña de Alanna Confirmaciones",
      }),
    );
    const mail = sendMail.mock.calls[0][0];
    expect(mail.subject).not.toContain("supersecrettoken");
    expect(mail.html).toContain("http://localhost:8080/restablecer-contrasena?token=supersecrettoken");
  });
});
