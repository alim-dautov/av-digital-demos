import "server-only";

/**
 * Интеграция WhatsApp — заглушка с готовым интерфейсом.
 * Чтобы подключить реальную отправку (WhatsApp Cloud API, Wazzup, Green-API …), реализуйте WhatsAppProvider
 * и верните его из getWhatsApp() по переменной окружения WHATSAPP_PROVIDER.
 */
export type WaResult = { mode: "sent"; messageId: string } | { mode: "link"; url: string };

export interface WhatsAppProvider {
  readonly name: string;
  /** true — сообщение уходит через API без участия пользователя */
  readonly canSend: boolean;
  sendText(to: string, text: string): Promise<WaResult>;
  /** Документ по публичной ссылке (PDF КП, акта сверки, прайса) */
  sendDocument(to: string, url: string, caption: string): Promise<WaResult>;
}

/** Нормализация казахстанского номера: 8 707… / +7 707… → 7707… */
export function normalizePhone(raw: string) {
  let d = raw.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("8")) d = "7" + d.slice(1);
  if (d.length === 10) d = "7" + d;
  return d;
}

/** Заглушка: формирует ссылку wa.me с готовым текстом — пользователь отправляет сам */
class LinkProvider implements WhatsAppProvider {
  readonly name = "wa.me (заглушка)";
  readonly canSend = false;
  async sendText(to: string, text: string): Promise<WaResult> {
    const phone = to ? normalizePhone(to) : "";
    return { mode: "link", url: `https://wa.me/${phone}?text=${encodeURIComponent(text)}` };
  }
  async sendDocument(to: string, url: string, caption: string) {
    return this.sendText(to, `${caption}\n${url}`);
  }
}

let instance: WhatsAppProvider | null = null;
export function getWhatsApp(): WhatsAppProvider {
  if (instance) return instance;
  switch (process.env.WHATSAPP_PROVIDER) {
    // case "cloud": instance = new CloudApiProvider(process.env.WHATSAPP_TOKEN!, process.env.WHATSAPP_PHONE_ID!); break;
    default: instance = new LinkProvider();
  }
  return instance;
}
