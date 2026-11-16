import type { FormErrorEvent } from '@nuxt/ui'

/**
 * A failed submit goes to the first error (docs/standards/forms.md → Errors): the first invalid
 * field in page order takes focus and scrolls into view. Every `UForm` passes it as `@error`.
 * In a new task: `UForm` disables its inputs while it validates and enables them after this
 * handler returns; a disabled input can't take focus, and the render that enables them runs first.
 */
export function focusFirstError(event: FormErrorEvent) {
  const ids = event.errors.map(error => error.id).filter(Boolean) as string[]
  setTimeout(() => {
    const fields = ids.map(id => document.getElementById(id)).filter(Boolean) as HTMLElement[]
    const first = fields.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))[0]
    first?.focus()
    first?.scrollIntoView({ block: 'center' })
  }, 0)
}

/** A server's `fieldErrors` as `UForm.setErrors` takes them: one message per field. */
export function formErrors(fieldErrors: Record<string, string[]> | undefined): { name: string, message: string }[] {
  return Object.entries(fieldErrors ?? {}).map(([name, messages]) => ({ name, message: messages[0] ?? '' }))
}
