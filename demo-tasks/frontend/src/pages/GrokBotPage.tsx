import { AppShell } from '../components/layout/AppShell'
import { MiniChat } from '../components/mini-chat/MiniChat'
import { Card } from '../components/ui'

export function GrokBotPage() {
  return (
    <AppShell title="Grok Bot" showFilters={false}>
      <div className="page-enter mx-auto grid w-full max-w-3xl gap-4">
        <MiniChat variant="embedded" />
        <Card className="p-5">
          <h2 className="text-base font-semibold text-text">Как пользоваться</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Это тот же чат, что открывается кнопкой «Чат» внизу справа: переписка общая. С любой другой страницы оранжевая кнопка с микрофоном сразу включает запись. Повторное нажатие отправляет фразу, Esc или «Отменить» её сбрасывает. Сообщение сохраняется в CRM и уходит на вебхук. Ответ бота появляется в чате.
          </p>
        </Card>
      </div>
    </AppShell>
  )
}
