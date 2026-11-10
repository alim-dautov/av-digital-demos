"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Mic, MicOff, Send, Loader2, Volume2 } from "lucide-react";
import { cn, formatKzt } from "@/lib/utils";
import type { VoiceResult } from "@/lib/ai/voice-assistant";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type VoiceState = "idle" | "listening" | "processing" | "speaking" | "error";

const SCENARIOS = [
  "Какие заказы сегодня?",
  "Кто опоздал сегодня?",
  "Какая прибыль?",
  "Загрузка мастеров",
  "Какие материалы заканчиваются?",
  "Покажи заказ 1028",
];

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionEventLike = {
  results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }>;
};

function getSpeechRecognitionCtor():
  | (new () => SpeechRecognitionLike)
  | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function speak(text: string, onEnd: () => void) {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    onEnd();
    return;
  }
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "ru-RU";
  utter.rate = 1;
  utter.onend = () => onEnd();
  utter.onerror = () => onEnd();
  window.speechSynthesis.speak(utter);
}

function Waveform({ active }: { active: boolean }) {
  return (
    <div className="flex h-10 items-end justify-center gap-1" aria-hidden>
      {Array.from({ length: 12 }).map((_, i) => (
        <span
          key={i}
          className={cn(
            "w-1 rounded-full bg-primary/80",
            active ? "animate-voice-bar" : "h-2 opacity-40",
          )}
          style={
            active
              ? {
                  animationDelay: `${i * 0.07}s`,
                  height: `${8 + ((i * 7) % 24)}px`,
                }
              : undefined
          }
        />
      ))}
    </div>
  );
}

function PanelResult({ result }: { result: VoiceResult }) {
  const { panel } = result;
  const data = panel.data;

  if (!data) {
    return (
      <p className="text-sm text-muted-foreground">Нет данных для отображения.</p>
    );
  }

  if (panel.type === "help" && typeof data === "object" && data !== null) {
    const hints = (data as { hints?: string[] }).hints ?? [];
    return (
      <ul className="space-y-1.5 text-sm text-muted-foreground">
        {hints.map((h) => (
          <li key={h}>· {h}</li>
        ))}
      </ul>
    );
  }

  if (Array.isArray(data)) {
    if (data.length === 0) {
      return <p className="text-sm text-muted-foreground">Список пуст.</p>;
    }
    const first = data[0] as Record<string, unknown>;
    if ("number" in first || "description" in first) {
      return (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="pb-2 pr-3 font-medium">№</th>
                <th className="pb-2 pr-3 font-medium">Описание</th>
                <th className="pb-2 font-medium">Сумма</th>
              </tr>
            </thead>
            <tbody>
              {data.slice(0, 6).map((row, i) => {
                const r = row as {
                  number?: string;
                  description?: string;
                  amount?: number;
                  status?: string;
                  employeeName?: string;
                  lateMinutes?: number;
                  name?: string;
                  quantity?: number;
                  unit?: string;
                  title?: string;
                };
                return (
                  <tr key={i} className="border-b border-border/60">
                    <td className="py-2 pr-3 tabular-nums">
                      {r.number ?? r.employeeName ?? r.name ?? r.title ?? "—"}
                    </td>
                    <td className="max-w-[180px] truncate py-2 pr-3 text-muted-foreground">
                      {r.description ??
                        r.status ??
                        (r.lateMinutes != null
                          ? `+${r.lateMinutes} мин`
                          : r.quantity != null
                            ? `${r.quantity} ${r.unit ?? ""}`
                            : "—")}
                    </td>
                    <td className="py-2 tabular-nums">
                      {r.amount != null ? formatKzt(r.amount) : ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      );
    }
    if ("employeeName" in first || "lateMinutes" in first) {
      return (
        <ul className="space-y-2">
          {(data as Array<{ employeeName: string; lateMinutes: number; penaltyAmount?: number }>).map(
            (a, i) => (
              <li
                key={i}
                className="flex items-center justify-between gap-2 rounded-lg bg-panel-elevated px-3 py-2 text-sm"
              >
                <span>{a.employeeName}</span>
                <Badge variant="warning">
                  +{a.lateMinutes} мин
                  {a.penaltyAmount != null ? ` · ${formatKzt(a.penaltyAmount)}` : ""}
                </Badge>
              </li>
            ),
          )}
        </ul>
      );
    }
    if ("title" in first) {
      return (
        <ul className="space-y-2">
          {(data as Array<{ title: string; priority?: string; status?: string }>).map(
            (t, i) => (
              <li
                key={i}
                className="rounded-lg bg-panel-elevated px-3 py-2 text-sm"
              >
                {t.title}
              </li>
            ),
          )}
        </ul>
      );
    }
    if ("employee" in first) {
      return (
        <ul className="space-y-2">
          {(
            data as Array<{
              employee: { fullName: string; firstName: string };
              activeOrders: number;
              loadPercent: number;
            }>
          ).map((m, i) => (
            <li
              key={i}
              className="flex items-center justify-between gap-2 rounded-lg bg-panel-elevated px-3 py-2 text-sm"
            >
              <span>{m.employee.fullName}</span>
              <span className="tabular-nums text-muted-foreground">
                {m.activeOrders} зак. · {m.loadPercent}%
              </span>
            </li>
          ))}
        </ul>
      );
    }
  }

  if (typeof data === "object" && data !== null) {
    const obj = data as Record<string, unknown>;
    if ("revenue" in obj || "profit" in obj) {
      return (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {[
            ["Выручка", obj.revenue],
            ["Прибыль", obj.profit],
            ["Расходы", obj.expenses],
            ["Зарплаты", obj.salaries],
            ["Средний чек", obj.averageCheck],
            ["Заказов", obj.ordersCount ?? obj.count],
          ]
            .filter((row): row is [string, number] => typeof row[1] === "number")
            .map(([label, value]) => (
              <div
                key={label}
                className="rounded-lg bg-panel-elevated px-3 py-2"
              >
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-sm font-semibold tabular-nums">
                  {label !== "Заказов" ? formatKzt(value) : value}
                </p>
              </div>
            ))}
        </div>
      );
    }
    if ("number" in obj) {
      return (
        <div className="space-y-1 text-sm">
          <p className="font-medium">
            Заказ №{String(obj.number)} — {String(obj.description ?? "")}
          </p>
          <p className="text-muted-foreground">
            {obj.amount != null ? formatKzt(Number(obj.amount)) : null}
          </p>
        </div>
      );
    }
  }

  return (
    <pre className="max-h-40 overflow-auto rounded-lg bg-panel-elevated p-3 text-xs text-muted-foreground">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

const STATE_LABEL: Record<VoiceState, string> = {
  idle: "Готов к команде",
  listening: "Слушаю…",
  processing: "Обрабатываю…",
  speaking: "Отвечаю…",
  error: "Ошибка",
};

export function VoiceAssistantPanel() {
  const router = useRouter();
  const [state, setState] = useState<VoiceState>("idle");
  const [transcript, setTranscript] = useState("");
  const [textFallback, setTextFallback] = useState("");
  const [speechSupported, setSpeechSupported] = useState(false);
  const [result, setResult] = useState<VoiceResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const listeningRef = useRef(false);

  useEffect(() => {
    setSpeechSupported(!!getSpeechRecognitionCtor());
    return () => {
      recognitionRef.current?.abort();
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    };
  }, []);

  const runCommand = useCallback(
    async (command: string) => {
      const trimmed = command.trim();
      if (!trimmed) return;

      setErrorMsg(null);
      setState("processing");
      setTranscript(trimmed);

      try {
        const res = await fetch("/api/voice", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ command: trimmed }),
        });
        if (!res.ok) {
          const err = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(err?.error ?? "Не удалось обработать команду");
        }
        const json = (await res.json()) as VoiceResult;
        setResult(json);
        setState("speaking");
        speak(json.speech, () => setState("idle"));
        if (json.navigateTo) {
          setTimeout(() => router.push(json.navigateTo!), 900);
        }
      } catch (e) {
        setState("error");
        setErrorMsg(e instanceof Error ? e.message : "Ошибка");
      }
    },
    [router],
  );

  const stopListening = useCallback(() => {
    listeningRef.current = false;
    recognitionRef.current?.stop();
    setState((s) => (s === "listening" ? "idle" : s));
  }, []);

  const startListening = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setSpeechSupported(false);
      return;
    }

    recognitionRef.current?.abort();
    const recognition = new Ctor();
    recognition.lang = "ru-RU";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognitionRef.current = recognition;
    listeningRef.current = true;

    recognition.onresult = (event) => {
      const last = event.results[event.results.length - 1];
      const text = last?.[0]?.transcript ?? "";
      setTranscript(text);
      if (last?.isFinal) {
        listeningRef.current = false;
        void runCommand(text);
      }
    };
    recognition.onerror = (event) => {
      listeningRef.current = false;
      if (event.error === "aborted" || event.error === "no-speech") {
        setState("idle");
        return;
      }
      setState("error");
      setErrorMsg("Не удалось распознать речь. Введите команду текстом.");
    };
    recognition.onend = () => {
      if (listeningRef.current) {
        listeningRef.current = false;
        setState((s) => (s === "listening" ? "idle" : s));
      }
    };

    try {
      setResult(null);
      setErrorMsg(null);
      setState("listening");
      recognition.start();
    } catch {
      setState("error");
      setErrorMsg("Микрофон недоступен");
    }
  }, [runCommand]);

  function toggleMic() {
    if (state === "listening") {
      stopListening();
      return;
    }
    if (state === "processing" || state === "speaking") return;
    if (speechSupported) startListening();
  }

  return (
    <Card className="h-full overflow-hidden border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <Volume2 className="h-4 w-4 text-primary" />
              Голосовой ассистент
            </CardTitle>
            <CardDescription>
              Спросите о заказах, складе, прибыли или сотрудниках
            </CardDescription>
          </div>
          <Badge
            variant={
              state === "error"
                ? "destructive"
                : state === "idle"
                  ? "secondary"
                  : "default"
            }
          >
            {STATE_LABEL[state]}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col items-center gap-4 rounded-xl border border-border bg-panel-elevated/60 px-4 py-6">
          <Waveform active={state === "listening" || state === "speaking"} />
          <Button
            type="button"
            size="icon"
            className={cn(
              "h-14 w-14 rounded-full shadow-lime",
              state === "listening" && "animate-pulse ring-2 ring-primary/60",
              state === "error" && "bg-destructive text-destructive-foreground",
            )}
            variant={state === "listening" ? "default" : "default"}
            disabled={
              state === "processing" ||
              state === "speaking" ||
              !speechSupported
            }
            onClick={toggleMic}
            aria-label={state === "listening" ? "Остановить" : "Говорить"}
            title={
              speechSupported
                ? undefined
                : "Распознавание речи недоступно в этом браузере"
            }
          >
            {state === "processing" ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : state === "listening" ? (
              <MicOff className="h-6 w-6" />
            ) : (
              <Mic className="h-6 w-6" />
            )}
          </Button>
          <p className="min-h-[1.25rem] text-center text-sm text-muted-foreground">
            {transcript ||
              (speechSupported
                ? "Нажмите на микрофон или выберите сценарий"
                : "Распознавание речи недоступно — введите команду")}
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {SCENARIOS.map((s) => (
            <Button
              key={s}
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs text-muted-foreground"
              disabled={state === "processing" || state === "listening"}
              onClick={() => void runCommand(s)}
            >
              {s}
            </Button>
          ))}
        </div>

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void runCommand(textFallback);
            setTextFallback("");
          }}
        >
          <Input
            value={textFallback}
            onChange={(e) => setTextFallback(e.target.value)}
            placeholder="Или введите команду…"
            disabled={state === "processing"}
          />
          <Button
            type="submit"
            size="icon"
            variant="secondary"
            disabled={!textFallback.trim() || state === "processing"}
            aria-label="Отправить"
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>

        {errorMsg && (
          <p className="text-sm text-destructive">{errorMsg}</p>
        )}

        {result && (
          <div className="space-y-2 rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">{result.panel.title}</p>
              {result.navigateTo && (
                <Badge variant="outline" className="text-xs">
                  {result.navigateTo}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{result.speech}</p>
            <PanelResult result={result} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
