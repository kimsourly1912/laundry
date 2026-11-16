/**
 * The body of every `/api/**` error response (spec §9): HTTP status = the kind, `code` = the reason.
 * `message` is written for the user. `fieldErrors` maps a field path (`lines.0.quantity`) to its
 * messages. `requestId` leads a screenshot of the error to the server's log lines.
 */
export interface ApiErrorBody {
  code: string
  message: string
  fieldErrors?: Record<string, string[]>
  requestId?: string
}
