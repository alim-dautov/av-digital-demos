/** Пароль всех демо-аккаунтов. Старые пароли переводятся на него при старте сервера. */
export const DEMO_PASSWORD = "password";

export const LEGACY_DEMO_PASSWORDS: readonly string[] = ["demo1234"];

/**
 * Демо-пользователи из сида. Когда демо разрешено, им при старте ставится DEMO_PASSWORD,
 * даже если пароль меняли в приложении.
 */
export const DEMO_EMAILS: readonly string[] = [
  "aidos@example.com",
  "madina@example.com",
  "ruslan@example.com",
  "serik@example.com",
  "daniyar@example.com",
  "bekzat@example.com",
  "azamat@example.com",
];
