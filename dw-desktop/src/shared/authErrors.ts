import type { StoredEnv } from './types'

/**
 * Translates the low-level errors produced while connecting to a DynamicWeb
 * host (fetch failures, HTTP status codes, OAuth/login responses) into a short,
 * plain-language message a non-technical user can act on.
 *
 * The original technical string is preserved by callers for the Debug panel —
 * this is purely for what's shown inline in the UI (toasts, banners, the
 * connection test result).
 */
export function humanizeAuthError(raw: string | undefined, env?: Pick<StoredEnv, 'host'>): string {
  const host = env?.host ? `"${env.host}"` : 'the host'
  const text = (raw ?? '').trim()
  const lower = text.toLowerCase()

  // Network-level failures: the request never reached a server.
  // Node/undici surface these as "fetch failed", "ENOTFOUND", "ECONNREFUSED", etc.
  if (
    lower.includes('fetch failed') ||
    lower.includes('enotfound') ||
    lower.includes('econnrefused') ||
    lower.includes('econnreset') ||
    lower.includes('eai_again') ||
    lower.includes('network') ||
    lower.includes('failed to fetch')
  ) {
    return `Couldn't reach ${host}. Check that the address is correct and the site is online.`
  }

  // Timeouts.
  if (lower.includes('timeout') || lower.includes('etimedout') || lower.includes('timed out')) {
    return `${host.charAt(0).toUpperCase() + host.slice(1)} took too long to respond. Check your connection and try again.`
  }

  // TLS / certificate problems.
  if (
    lower.includes('certificate') ||
    lower.includes('cert_') ||
    lower.includes('self-signed') ||
    lower.includes('self signed') ||
    lower.includes('depth_zero') ||
    lower.includes('unable to verify')
  ) {
    return `The security certificate for ${host} couldn't be verified. The site may be misconfigured or using a self-signed certificate.`
  }

  // Authentication failures — 401/403 from any of the auth flows.
  if (
    lower.includes('401') ||
    lower.includes('unauthorized') ||
    lower.includes('403') ||
    lower.includes('forbidden') ||
    lower.includes('invalid_client') ||
    lower.includes('invalid client') ||
    lower.includes('login failed')
  ) {
    return 'Authentication failed. Double-check your credentials for this environment.'
  }

  // Endpoint not found — usually the host is reachable but isn't a DynamicWeb site,
  // or the API isn't available at this address.
  if (lower.includes('404') || lower.includes('not found')) {
    return `${host.charAt(0).toUpperCase() + host.slice(1)} responded, but the DynamicWeb API wasn't found there. Check the address points to a DynamicWeb site.`
  }

  // Server-side errors.
  if (
    lower.includes('500') ||
    lower.includes('502') ||
    lower.includes('503') ||
    lower.includes('504') ||
    lower.includes('internal server error') ||
    lower.includes('bad gateway') ||
    lower.includes('service unavailable')
  ) {
    return `${host.charAt(0).toUpperCase() + host.slice(1)} returned a server error. Try again in a moment, or contact the site administrator.`
  }

  // Missing stored credentials.
  if (lower.includes('no api key found') || lower.includes('no oauth credentials found')) {
    return 'No saved credentials for this environment. Edit it and re-enter your credentials.'
  }

  // Unexpected response shape (not JSON, no token, …).
  if (lower.includes('was not json') || lower.includes('did not contain a token')) {
    return `${host.charAt(0).toUpperCase() + host.slice(1)} returned an unexpected response. Check the address points to a DynamicWeb site.`
  }

  // Fallback: keep the original if we have one, otherwise a generic message.
  return text || 'Something went wrong while connecting.'
}
