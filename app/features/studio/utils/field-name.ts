import type { SlipElement } from '#shared/contracts/slip-design'

/** How the studio names a field (D35: fields have no names of their own): its label, or its type. */
export function fieldName(element: SlipElement, t: (key: string) => string): string {
  if ('label' in element && element.label.trim()) return element.label.trim()
  return t(`studio.form.types.${element.type === 'option' ? 'choice' : element.type}`)
}
