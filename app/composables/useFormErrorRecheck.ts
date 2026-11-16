import type { MaybeRefOrGetter } from 'vue'

/** The part of a Standard Schema (Valibot, Zod, …) this reads: its issues and their paths. */
interface StandardSchema {
  '~standard': {
    validate: (value: unknown) => { issues?: readonly { message: string, path?: readonly (PropertyKey | { key: PropertyKey })[] }[] }
      | Promise<{ issues?: readonly { message: string, path?: readonly (PropertyKey | { key: PropertyKey })[] }[] }>
  }
}

/**
 * What this reads of a `UForm` template ref: its exposed `getErrors` and `validate`, and its props.
 * The ref's own type is generic per schema (field names), so callers pass it as it is.
 */
interface FormLike {
  getErrors: () => { name?: string, message: string }[]
  validate: (options: { name: string[], silent: true }) => Promise<unknown>
  $props: { schema?: unknown, state?: unknown }
}

const key = (name: string | undefined, message: string) => `${name ?? ''}\u0000${message}`

/** The schema's errors for a state, named the way `UForm` names them (`modifiers.1.name`). */
async function schemaErrors(schema: unknown, state: unknown) {
  const standard = (schema as Partial<StandardSchema> | undefined)?.['~standard']
  if (!standard) return []
  const result = await standard.validate(state)
  return (result.issues ?? []).map(issue => ({
    name: (issue.path ?? []).map(part => String(typeof part === 'object' ? part.key : part)).join('.'),
    message: issue.message,
  }))
}

/**
 * Errors leave as soon as they're fixed (docs/standards/forms.md → Errors; from NUK). `UForm` checks
 * a field on input only after it was first left, and only the field being edited: a field fixed
 * without leaving it, filled by code (a suggested short name), or fixed by another field ("The two
 * passwords are different") kept its error, and the layout shift as errors left on the next click
 * could make that click miss its button.
 *
 * After every change, the fields that show an error the schema gave are checked again, silently:
 * fixed ones clear and changed ones update. Nothing new appears on a field the person hasn't
 * reached, and an error the server gave (`setErrors`) stays until its own field is edited, as `UForm`
 * already does.
 *
 * ```ts
 * const form = useTemplateRef('form')
 * useFormErrorRecheck(form)
 * ```
 */
export function useFormErrorRecheck(formRef: MaybeRefOrGetter<object | null | undefined>) {
  const form = () => toValue(formRef) as FormLike | null | undefined
  // Errors the schema confirmed when they appeared (server errors never are).
  const fromSchema = new Set<string>()

  watch(() => form()?.getErrors().map(e => key(e.name, e.message)).join('\n'), async (shown) => {
    const instance = form()
    if (!instance || !shown) return
    const confirmed = new Set((await schemaErrors(instance.$props.schema, instance.$props.state)).map(e => key(e.name, e.message)))
    for (const error of instance.getErrors()) {
      if (confirmed.has(key(error.name, error.message))) fromSchema.add(key(error.name, error.message))
    }
  })

  watch(() => form()?.$props.state, async () => {
    const instance = form()
    if (!instance) return
    const names = [...new Set(instance.getErrors()
      .filter(error => error.name && fromSchema.has(key(error.name, error.message)))
      .map(error => error.name!))]
    if (names.length) await instance.validate({ name: names, silent: true })
  }, { deep: true })
}
