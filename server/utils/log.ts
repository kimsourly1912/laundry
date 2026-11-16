import type { H3Event } from 'h3'

type Level = 'debug' | 'info' | 'warn' | 'error'

/**
 * Keys whose values never reach a log line (docs/server/security.md → Logging and privacy):
 * credentials, and personal data (phone numbers, Telegram chat ids).
 */
const SECRET_KEY = /pass(?:word)?|secret|token|cookie|authorization|session|api[-_]?key|signature|phone|chat[-_]?id/i
const MAX_STRING = 4000
const MAX_ENTRIES = 50
const MAX_DEPTH = 6

/** Path segments that are bearer tokens: a ticket's public token (`/t/<token>`, the ticket APIs). */
const TOKEN_SEGMENT = /\/(t|tickets)\/[^/\s"'<>?#]+/g

function safePath(path: string): string {
  return path.split(/[?#]/)[0]!.replace(TOKEN_SEGMENT, '/$1/[redacted]')
}

function safeUrl(value: string): string {
  try {
    const url = new URL(value)
    url.username = ''
    url.password = ''
    url.search = ''
    url.hash = ''
    url.pathname = safePath(url.pathname)
    // A Telegram Bot API URL carries the bot token in its path.
    if (url.hostname === 'api.telegram.org') url.pathname = url.pathname.replace(/^\/bot[^/]+/, '/bot[redacted]')
    return url.toString()
  }
  catch {
    return '[redacted URL]'
  }
}

/**
 * Free text made safe: no query strings, URL credentials, ticket tokens, credential assignments or
 * Cambodian phone numbers (`+855…`, `0…`). It can't recognize every secret: callers pass ids and
 * codes, never bodies or tokens.
 */
export function safeText(text: string): string {
  return text.slice(0, MAX_STRING)
    .replace(/https?:\/\/[^\s"'<>]+/gi, safeUrl)
    .replace(/\/[^\s"'<>]*[?#][^\s"'<>]*/g, safePath)
    .replace(TOKEN_SEGMENT, '/$1/[redacted]')
    .replace(/\b(Bearer|Basic)\s+[^\s,"';}]+/gi, '$1 [redacted]')
    .replace(/\b(password|secret|[\w-]*token|api[-_]?key|authorization|cookie|session|signature)["']?\s*[:=]\s*["']?[^\s,;"'}]+/gi, '$1=[redacted]')
    .replace(/(?:\+855|\b0)(?:[\s-]?\d){8,9}\b/g, '[phone]')
}

function redact(value: unknown, seen = new WeakSet<object>(), depth = 0): unknown {
  if (typeof value === 'string') return safeText(value)
  if (typeof value === 'bigint') return String(value)
  if (!value || typeof value !== 'object') return value
  if (seen.has(value)) return '[circular]'
  if (depth >= MAX_DEPTH) return '[truncated]'
  seen.add(value)
  if (value instanceof Error) {
    return redact({ name: value.name, message: value.message, stack: value.stack, cause: value.cause }, seen, depth + 1)
  }
  if (Array.isArray(value)) return value.slice(0, MAX_ENTRIES).map(item => redact(item, seen, depth + 1))
  return Object.fromEntries(Object.entries(value).slice(0, MAX_ENTRIES).map(([key, item]) => [
    safeText(key),
    SECRET_KEY.test(key) ? '[redacted]' : redact(item, seen, depth + 1),
  ]))
}

/**
 * One structured log line (JSON), with the request id, method and path when there is an event.
 * Workers Logs index these fields. Never pass request bodies, passwords, tokens or phone numbers;
 * the redaction is a safety net, not permission.
 */
export function log(level: Level, message: string, fields: Record<string, unknown> = {}, event?: H3Event) {
  const line = {
    ...redact(fields) as Record<string, unknown>,
    level,
    message: safeText(message),
    ...(event ? { requestId: redact(event.context.requestId), method: event.method, path: safePath(event.path) } : {}),
  }
  const write = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
  write(JSON.stringify(line))
}
