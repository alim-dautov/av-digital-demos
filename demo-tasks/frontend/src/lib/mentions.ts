export type MentionUser = { name: string }

export type ActiveMention<U> = { at: number; query: string; matches: U[] }

// Characters that make "@" part of an e-mail address rather than a mention: "name@mail.kz".
const EMAIL_CHAR = /[A-Za-z0-9._%+-]/

/**
 * The @mention being typed right before the caret, with matching people, or null.
 * "@" opens the list at the start, after a space or punctuation, and after Cyrillic text
 * ("Привет@"), but not inside a Latin e-mail address. Matches any word of the name.
 */
export function activeMention<U extends MentionUser>(text: string, caret: number, users: U[]): ActiveMention<U> | null {
  const before = text.slice(0, caret)
  const at = before.lastIndexOf('@')
  if (at < 0 || (at > 0 && EMAIL_CHAR.test(before[at - 1]))) return null
  const query = before.slice(at + 1)
  if (query.length > 30 || /[\n@]/.test(query) || /\s\s/.test(query)) return null
  const q = query.trim().toLowerCase()
  const matches = users
    .filter((u) => {
      const name = u.name.toLowerCase()
      return q === '' || name.startsWith(q) || name.split(/\s+/).some((word) => word.startsWith(q))
    })
    .slice(0, 6)
  if (matches.length === 0 || matches.some((u) => u.name.toLowerCase() === q)) return null
  return { at, query, matches }
}
