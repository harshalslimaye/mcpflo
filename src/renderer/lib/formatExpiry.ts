// Renders an access-token expiry as a coarse countdown for the auth details
// card. Null expiresAt means the server reported no lifetime — say so rather
// than implying permanence.
export function formatExpiry(expiresAt: number | null, now: number): string {
  if (expiresAt === null) return 'No expiry reported'
  const seconds = Math.floor((expiresAt - now) / 1000)
  if (seconds <= 0) return 'Expired'
  if (seconds < 60) return 'in under a minute'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `in ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `in ${hours} hr ${minutes % 60} min`
  const days = Math.floor(hours / 24)
  return `in ${days} day${days === 1 ? '' : 's'}`
}
