// Map the UI's virtual remote path (rooted at '/') to the real server path
// ('/Files/...'). Purely for user-facing display and clipboard strings.
export function toDisplayRemotePath(virtualPath: string): string {
  if (!virtualPath || virtualPath === '/') return '/Files/'
  return `/Files${virtualPath}`
}

/** Parses a typed "/Files/…" path back to a virtual remote path; null when outside /Files. */
export function fromDisplayRemotePath(input: string): string | null {
  const v = input.trim().replace(/\\/g, '/')
  if (!/^\/?files(\/|$)/i.test(v)) return null
  const rest = v.replace(/^\/?files/i, '').replace(/\/+$/, '')
  if (!rest) return '/'
  return rest.startsWith('/') ? rest : `/${rest}`
}

// Characters Windows and the server's path resolver reject in a path segment.
const INVALID_NAME_CHARS = /[\\/:*?"<>|]/

export function validateName(name: string): string | null {
  if (name === '.' || name === '..') return 'That name is reserved.'
  if (INVALID_NAME_CHARS.test(name)) return 'A name can’t contain \\ / : * ? " < > |'
  return null
}
