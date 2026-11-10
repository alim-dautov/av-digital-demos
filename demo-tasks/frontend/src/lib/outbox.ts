import { openDB } from 'idb'
import { api } from './api'

type OutboxItem = {
  id: string
  action: string
  payload: Record<string, unknown>
  createdAt: string
  status: 'pending' | 'sending' | 'done' | 'error'
  error?: string
}

const DB = 'demo-outbox'
const STORE = 'items'

async function db() {
  return openDB(DB, 1, {
    upgrade(database) {
      database.createObjectStore(STORE, { keyPath: 'id' })
    },
  })
}

export async function enqueueOutbox(action: string, payload: Record<string, unknown>) {
  const item: OutboxItem = {
    id: crypto.randomUUID(),
    action,
    payload,
    createdAt: new Date().toISOString(),
    status: 'pending',
  }
  const database = await db()
  await database.put(STORE, item)
  void flushOutbox()
  return item
}

export async function listOutbox(): Promise<OutboxItem[]> {
  const database = await db()
  return (await database.getAll(STORE)) as OutboxItem[]
}

export async function pendingCount(): Promise<number> {
  const items = await listOutbox()
  return items.filter((i) => i.status === 'pending' || i.status === 'sending' || i.status === 'error').length
}

export async function flushOutbox(): Promise<void> {
  if (!navigator.onLine) return
  const database = await db()
  const items = (await database.getAll(STORE)) as OutboxItem[]
  for (const item of items) {
    if (item.status === 'done') {
      await database.delete(STORE, item.id)
      continue
    }
    item.status = 'sending'
    await database.put(STORE, item)
    try {
      await api('/outbox', {
        method: 'POST',
        body: JSON.stringify({ action: item.action, payload: item.payload }),
        idempotencyKey: item.id,
      })
      item.status = 'done'
      await database.put(STORE, item)
      await database.delete(STORE, item.id)
    } catch (e) {
      item.status = 'error'
      item.error = e instanceof Error ? e.message : 'Ошибка отправки'
      await database.put(STORE, item)
    }
  }
}

export function bindOutboxOnline() {
  window.addEventListener('online', () => {
    void flushOutbox()
  })
}
