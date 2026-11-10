import { X } from 'lucide-react'
import { Select } from '../ui'

export type AssigneeOption = { id: number; name: string; initials?: string; role_name?: string }

export function AssigneePicker({
  id,
  users,
  known = [],
  value,
  onChange,
  disabled,
}: {
  id?: string
  users: AssigneeOption[]
  known?: AssigneeOption[]
  value: number[]
  onChange: (ids: number[]) => void
  disabled?: boolean
}) {
  const byId = new Map<number, AssigneeOption>()
  for (const person of [...known, ...users]) byId.set(person.id, person)
  const available = users.filter((user) => !value.includes(user.id))

  return (
    <div className="grid gap-2">
      {value.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {value.map((personId) => {
            const person = byId.get(personId)
            const name = person?.name || `Сотрудник #${personId}`
            return (
              <span key={personId} className="inline-flex min-h-11 items-center gap-1 rounded-full border border-border bg-bg pr-1 pl-1 text-xs">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-panel-2 text-[10px]">
                  {person?.initials || name.slice(0, 2)}
                </span>
                <span className="pr-1">{name}</span>
                {!disabled && value.length > 1 ? (
                  <button
                    type="button"
                    className="flex h-11 w-11 items-center justify-center rounded-full text-muted hover:text-danger"
                    aria-label={`Убрать ${name}`}
                    onClick={() => onChange(value.filter((id) => id !== personId))}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </span>
            )
          })}
        </div>
      ) : (
        <p className="text-xs text-muted">Выберите хотя бы одного ответственного</p>
      )}
      {!disabled ? (
        <Select
          id={id}
          aria-label={value.length === 0 ? 'Ответственные' : 'Добавить ответственного'}
          value=""
          disabled={available.length === 0}
          onChange={(e) => {
            const next = Number(e.target.value)
            if (next > 0 && !value.includes(next)) onChange([...value, next])
          }}
        >
          <option value="">{value.length === 0 ? 'Выберите сотрудника' : '+ Ещё сотрудник'}</option>
          {available.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name}
              {user.role_name ? ` · ${user.role_name}` : ''}
            </option>
          ))}
        </Select>
      ) : null}
    </div>
  )
}
