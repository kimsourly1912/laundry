import type { SlipElement } from '#shared/contracts/slip-design'

/** How the studio names a field (D35: fields have no names of their own): its English label, or its type. */
export function fieldName(element: SlipElement, t: (key: string) => string): string {
  if ('label' in element && element.label.en.trim()) return element.label.en.trim()
  return t(`studio.form.types.${element.type === 'option' ? 'choice' : element.type}`)
}
