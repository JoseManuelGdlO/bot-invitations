/**
 * Contrato para conectar WhatsApp Cloud API más adelante.
 *
 * CloudWhatsAppProvider debería:
 * - POST https://graph.facebook.com/v21.0/{PHONE_NUMBER_ID}/messages
 * - Autenticar con WHATSAPP_TOKEN
 * - Devolver el wamid del mensaje
 *
 * El worker solo depende de esta interfaz: { sendMessage(to, text) }
 */
export class StubWhatsAppProvider {
  async sendMessage(to, text) {
    console.log(`[whatsapp:stub] queued send to ${to}: ${String(text).slice(0, 80)}`);
    return {
      provider: "stub",
      providerId: `stub-${Date.now()}`,
      to,
      skipped: true,
    };
  }
}

export function createWhatsAppProvider() {
  return new StubWhatsAppProvider();
}
