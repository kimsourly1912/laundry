/**
 * Unsaved input is never lost silently (docs/standards/forms.md → Unsaved changes): leaving the page
 * (a link, Back) or the site (reload, closing the tab) asks first while `dirty()` is true. After a
 * successful save the form's baseline moves, so `dirty()` is false and nothing asks.
 *
 * @example
 * useUnsavedChanges(() => isDirty.value && !saving.value)
 */
export function useUnsavedChanges(dirty: () => boolean) {
  const { t } = useI18n()

  onBeforeRouteLeave(() => {
    if (dirty() && !window.confirm(t('common.unsaved.leave'))) return false
  })

  const onBeforeUnload = (event: BeforeUnloadEvent) => {
    if (dirty()) event.preventDefault()
  }
  onMounted(() => window.addEventListener('beforeunload', onBeforeUnload))
  onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload))
}
