import qrcode from 'qrcode-generator'
import { LogOut } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'
import { qrUrl, type DisplayCurrent } from '../lib/attendance'
import { useAuth } from '../lib/auth'

function qrSvg(text: string): string {
  const qr = qrcode(0, 'M')
  qr.addData(text)
  qr.make()
  return qr.createSvgTag({ cellSize: 8, margin: 2, scalable: true })
}

/** Full-screen QR for the office screen. The token comes from the server every second; no secret here. */
export function AttendanceDisplayPage() {
  const { logout } = useAuth()
  const [cur, setCur] = useState<DisplayCurrent | null>(null)
  const [fails, setFails] = useState(0)
  const [disabled, setDisabled] = useState(false)
  const [receivedAt, setReceivedAt] = useState(0)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    let alive = true
    const poll = async () => {
      try {
        const data = await api<DisplayCurrent>('/attendance/display/current', { cache: 'no-store' })
        if (!alive) return
        setCur(data)
        setReceivedAt(Date.now())
        setFails(0)
        setDisabled(false)
      } catch (e) {
        if (!alive) return
        const status = (e as { status?: number }).status
        if (status === 401) window.location.reload()
        if (status === 403) setDisabled(true)
        setFails((f) => f + 1)
      }
    }
    void poll()
    const id = window.setInterval(poll, 1000)
    const clock = window.setInterval(() => setNow(Date.now()), 250)
    return () => {
      alive = false
      window.clearInterval(id)
      window.clearInterval(clock)
    }
  }, [])

  const svg = useMemo(() => (cur ? qrSvg(qrUrl(window.location.origin, cur.token)) : ''), [cur?.token]) // eslint-disable-line react-hooks/exhaustive-deps
  const offline = fails >= 2
  const left = cur ? Math.max(0, Math.ceil((cur.ms_left - (now - receivedAt)) / 1000)) : 0

  return (
    <div className="safe-screen flex min-h-[100dvh] flex-col items-center justify-center gap-6 bg-white p-6 text-black">
      <h1 className="text-2xl font-semibold">{cur?.name ?? 'Посещаемость'}</h1>
      {disabled ? (
        <p className="text-xl text-red-600">Экран отключён владельцем</p>
      ) : offline || !cur || left <= 0 ? (
        <p className="text-xl text-red-600">{offline ? 'Нет связи — QR не показывается' : cur && left <= 0 ? 'Обновление QR…' : 'Загрузка…'}</p>
      ) : (
        <>
          <div className="w-[min(80vw,70vh)]" aria-label="QR для отметки" dangerouslySetInnerHTML={{ __html: svg }} />
          <p className="text-lg">Наведите камеру телефона или откройте «Посещаемость» в приложении. Обновится через {left} с</p>
        </>
      )}
      <button type="button" onClick={() => void logout()} className="mt-4 inline-flex items-center gap-2 text-sm text-gray-500">
        <LogOut size={16} /> Выйти
      </button>
    </div>
  )
}
