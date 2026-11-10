import { ensureDatabase } from "./db/seed";

let ready: Promise<void> | null = null;

export function bootstrap() {
  if (!ready) ready = Promise.resolve(ensureDatabase());
  return ready;
}
