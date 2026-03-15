function parseAdminIds(raw: string | undefined): number[] {
  if (!raw) return []

  return raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => /^\d+$/.test(part))
    .map((part) => Number(part))
    .filter((id) => Number.isFinite(id) && id > 0)
}

export function getAdminUserIds(): number[] {
  return parseAdminIds(process.env.ADMIN_USER_IDS)
}

export function isAdminUserId(userId: number | undefined): boolean {
  if (!userId) return false
  return getAdminUserIds().includes(userId)
}
