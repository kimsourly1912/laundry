/** Whether the window is at least `minWidth` px wide: the studio needs a computer (plan §5.1). */
export function useWideScreen(minWidth = 1280) {
  const wide = ref(true)
  let query: MediaQueryList | undefined
  const update = () => {
    wide.value = query?.matches ?? true
  }
  onMounted(() => {
    query = window.matchMedia(`(min-width: ${minWidth}px)`)
    update()
    query.addEventListener('change', update)
  })
  onBeforeUnmount(() => query?.removeEventListener('change', update))
  return wide
}
