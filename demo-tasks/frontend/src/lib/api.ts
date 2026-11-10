export type ApiError = { error: string; needs_totp?: boolean; detail?: string }

let csrfToken = ''
let lastUpdatedAt: Date | null = null

export function getCsrf(): string {
  return csrfToken
}

export function setCsrf(token: string) {
  csrfToken = token
}

export function getLastUpdated(): Date | null {
  return lastUpdatedAt
}

export async function api<T>(
  path: string,
  options: RequestInit & { idempotencyKey?: string } = {},
): Promise<T> {
  const headers = new Headers(options.headers || {})
  if (!headers.has('Content-Type') && options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }
  if (csrfToken && options.method && options.method !== 'GET') {
    headers.set('X-CSRF-Token', csrfToken)
  }
  if (options.idempotencyKey) {
    headers.set('X-Idempotency-Key', options.idempotencyKey)
  }

  const res = await fetch(`/api${path}`, {
    ...options,
    headers,
    credentials: 'include',
  })

  lastUpdatedAt = new Date()

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = data as ApiError
    throw Object.assign(new Error(err.error || 'Ошибка запроса'), {
      status: res.status,
      ...err,
    })
  }
  return data as T
}
