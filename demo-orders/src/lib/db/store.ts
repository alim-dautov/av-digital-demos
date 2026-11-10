import fs from "fs";
import path from "path";
import type { AppData } from "@/types";
import { ensureGulyaUser } from "./gulya";

const DATA_DIR = process.env.MEBELDEMO_DATA_DIR || path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "mebeldemo.json");

let cache: AppData | null = null;
let cacheMtimeMs = 0;

function fileMtimeMs(): number {
  try {
    return fs.statSync(DATA_FILE).mtimeMs;
  } catch {
    return 0;
  }
}

export function getDataPath(): string {
  return DATA_FILE;
}

function ensureDataDir(): void {
  // MEBELDEMO_DATA_DIR makes the path unknown at build time; without the ignore
  // comment Turbopack traces the whole project root into the deploy bundle.
  if (!fs.existsSync(/*turbopackIgnore: true*/ DATA_DIR)) {
    fs.mkdirSync(/*turbopackIgnore: true*/ DATA_DIR, { recursive: true });
  }
}

function emptyAppData(): AppData {
  return {
    companies: [],
    users: [],
    employees: [],
    clients: [],
    orders: [],
    orderStages: [],
    checklistItems: [],
    materials: [],
    inventoryMovements: [],
    tasks: [],
    reports: [],
    attendance: [],
    attendanceQr: [],
    salaries: [],
    salaryPayments: [],
    advances: [],
    penalties: [],
    settings: [],
    userSettings: [],
    notifications: [],
    activityLog: [],
    orderAuditLogs: [],
    calculatorProjects: [],
    commercialProposals: [],
    atelierCornicePrices: [],
    atelierFabrics: [],
    atelierAssemblyCoeffs: [],
    atelierCoverPrices: [],
    atelierPillowPrices: [],
    atelierAccessoryPrices: [],
    atelierRollerPrices: [],
    atelierInstallPrices: [],
    atelierServicePrices: [],
    atelierLabels: [],
    measurements: [],
    clientMeasurements: [],
    galleryFolders: [],
    galleryPhotos: [],
    furniturePriceItems: [],
    cashEntries: [],
    purchases: [],
    orderExpenses: [],
    expenseCategories: [],
    pushSubscriptions: [],
    grokConnectors: [],
    grokLogs: [],
    migrations: [],
  };
}

export function getData(): AppData {
  // Route handlers and pages can hold separate module instances, so another one may have rewritten the file.
  const mtimeMs = fileMtimeMs();
  if (cache && mtimeMs === cacheMtimeMs) return cache;
  cacheMtimeMs = mtimeMs;

  if (!fs.existsSync(DATA_FILE)) {
    cache = emptyAppData();
    return cache;
  }

  const raw = fs.readFileSync(DATA_FILE, "utf-8").trim();
  if (!raw) {
    cache = emptyAppData();
    return cache;
  }

  const parsed = JSON.parse(raw) as Partial<AppData>;
  cache = {
    ...emptyAppData(),
    ...parsed,
    salaryPayments: parsed.salaryPayments ?? [],
    userSettings: parsed.userSettings ?? [],
    orderAuditLogs: parsed.orderAuditLogs ?? [],
    advances: (parsed.advances ?? []).map((a) => ({
      ...a,
      paymentMethod: a.paymentMethod ?? "cash",
      receipt: a.receipt ?? null,
    })),
    atelierCornicePrices: parsed.atelierCornicePrices ?? [],
    atelierFabrics: parsed.atelierFabrics ?? [],
    atelierAssemblyCoeffs: parsed.atelierAssemblyCoeffs ?? [],
    atelierCoverPrices: parsed.atelierCoverPrices ?? [],
    atelierPillowPrices: parsed.atelierPillowPrices ?? [],
    atelierAccessoryPrices: parsed.atelierAccessoryPrices ?? [],
    atelierRollerPrices: parsed.atelierRollerPrices ?? [],
    atelierInstallPrices: parsed.atelierInstallPrices ?? [],
    atelierServicePrices: parsed.atelierServicePrices ?? [],
    atelierLabels: parsed.atelierLabels ?? [],
    measurements: parsed.measurements ?? [],
    clientMeasurements: parsed.clientMeasurements ?? [],
    galleryFolders: parsed.galleryFolders ?? [],
    galleryPhotos: parsed.galleryPhotos ?? [],
    furniturePriceItems: parsed.furniturePriceItems ?? [],
    cashEntries: parsed.cashEntries ?? [],
    purchases: parsed.purchases ?? [],
    orderExpenses: parsed.orderExpenses ?? [],
    expenseCategories: parsed.expenseCategories ?? [],
    pushSubscriptions: parsed.pushSubscriptions ?? [],
    grokConnectors: parsed.grokConnectors ?? [],
    grokLogs: parsed.grokLogs ?? [],
    migrations: parsed.migrations ?? [],
  };
  if (ensureGulyaUser(cache)) saveData(cache);
  return cache;
}

/** Re-reads the file even if the cached mtime looks current. */
export function reloadData(): AppData {
  cache = null;
  cacheMtimeMs = 0;
  return getData();
}

const LOCK_FILE = path.join(DATA_DIR, ".lock");
const LOCK_STALE_MS = 10_000;
const LOCK_WAIT_MS = 5_000;

function sleepSync(ms: number) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Runs `fn` on fresh data under an exclusive lock file, then saves.
 * Several app processes can run behind Passenger, so in-memory state alone is not enough
 * for check-then-write operations.
 */
export function mutateDataLocked<T>(fn: (data: AppData) => T): T {
  ensureDataDir();
  const started = Date.now();
  let fd: number | null = null;
  while (fd === null) {
    try {
      fd = fs.openSync(LOCK_FILE, "wx");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      try {
        if (Date.now() - fs.statSync(LOCK_FILE).mtimeMs > LOCK_STALE_MS) {
          fs.rmSync(LOCK_FILE, { force: true });
          continue;
        }
      } catch {
        continue;
      }
      if (Date.now() - started > LOCK_WAIT_MS) {
        throw new Error("База занята, повторите попытку");
      }
      sleepSync(25);
    }
  }
  try {
    const data = reloadData();
    const result = fn(data);
    saveData(data);
    return result;
  } finally {
    fs.closeSync(fd);
    fs.rmSync(LOCK_FILE, { force: true });
  }
}

export function saveData(data: AppData): void {
  ensureDataDir();
  const tmp = `${DATA_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tmp, DATA_FILE);
  cache = data;
  cacheMtimeMs = fileMtimeMs();
}

export function mutateData(fn: (data: AppData) => void): AppData {
  const data = getData();
  fn(data);
  saveData(data);
  return data;
}

export function resetData(): void {
  cache = null;
  cacheMtimeMs = 0;
}
