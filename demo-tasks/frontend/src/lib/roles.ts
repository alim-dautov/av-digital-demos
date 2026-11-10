// Pure role checks (no imports, so node tests can compile this file alone).
type RoleUser = { role?: string; is_superadmin?: boolean } | null | undefined

/** Grok Bot is only for the real owner (Владелец), not employees and not the hidden superadmin. */
export function isRealOwner(user: RoleUser): boolean {
  return user?.role === 'owner' && user.is_superadmin !== true
}

/** CRM administrator: the real owner or the superadmin. Full access to every page except Grok Bot. */
export function isCrmAdmin(user: RoleUser): boolean {
  return user?.role === 'owner'
}
