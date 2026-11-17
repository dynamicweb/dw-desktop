/**
 * Reads a typed or pasted site address ("https://site.dk/", " HTTP://localhost:5000/admin")
 * as the protocol and host an environment stores. Anything after the host is dropped:
 * the APIs live at the site root. Without a scheme, https is assumed.
 */
export function parseHost(raw: string): { protocol: 'http' | 'https'; host: string } {
  const value = raw.trim()
  const scheme = /^(https?):\/\//i.exec(value)
  const rest = scheme ? value.slice(scheme[0].length) : value
  return {
    protocol: scheme?.[1].toLowerCase() === 'http' ? 'http' : 'https',
    host: rest.split(/[/?#]/)[0].trim()
  }
}
