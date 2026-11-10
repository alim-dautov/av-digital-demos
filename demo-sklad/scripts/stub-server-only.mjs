// Подменяет пакет «server-only» пустым модулем для запуска серверного кода вне Next (скрипты)
import { register } from "node:module";

register("data:text/javascript," + encodeURIComponent(
  "export async function resolve(s, c, next) { if (s === 'server-only') return { url: 'data:text/javascript,', shortCircuit: true }; return next(s, c); }",
));
