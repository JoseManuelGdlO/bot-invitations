import nodemailer from "nodemailer";

export async function sendTeamInvitationEmail({ to, name, eventName, role, inviteLink }) {
  const host = process.env.SMTP_HOST || "smtp.hostinger.com";
  const port = Number(process.env.SMTP_PORT) || 465;
  const secure = process.env.SMTP_SECURE === "true" || port === 465;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || user;

  if (!user || !pass) {
    throw new Error(
      `Credenciales SMTP faltantes en .env (SMTP_USER: ${user ? "OK" : "FALTA"}, SMTP_PASS: ${pass ? "OK" : "FALTA"})`
    );
  }

  // Configuración para Hostinger SMTP
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
  });

  const mailOptions = {
    from: `"Alanna Confirmaciones" <${from}>`,
    to,
    subject: `Invitación para unirte al equipo de ${eventName}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
        <h2 style="color: #1a1a1a;">¡Hola ${name}!</h2>
        <p>Has sido invitado a formar parte del equipo del evento <strong>${eventName}</strong> con el rol de <strong>${role}</strong>.</p>
        <p>Crea tu cuenta o inicia sesión con este correo. No necesitas pagar un plan: quien te invitó ya cubre el evento.</p>
        <div style="margin: 30px 0; text-align: center;">
          <a href="${inviteLink}" style="background-color: #d4af37; color: #000; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
            Aceptar Invitación
          </a>
        </div>
        <p style="font-size: 12px; color: #666;">Si no esperabas esta invitación, puedes ignorar este correo.</p>
      </div>
    `,
  };

  return transporter.sendMail(mailOptions);
}