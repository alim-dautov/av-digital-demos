/** Демо-режим (DEMO_MODE=1): выдуманные данные, вход одной кнопкой, нет внешних побочных эффектов. */
export const isDemo = () => process.env.DEMO_MODE === "1";
export const DEMO_CONTACT_URL = process.env.DEMO_CONTACT_URL || "https://av-digital.kz/#contact";
