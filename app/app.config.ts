/**
 * Nuxt UI's global configuration: the one place component styling changes (spec §11, ui.md).
 * Pages never override color, size, radius or shadow. Laundry's palette is chosen later.
 */
export default defineAppConfig({
  ui: {
    colors: {
      primary: 'sky',
      neutral: 'slate',
    },
    // Overlay headers size to their content: no fixed min height, and the close button
    // sits in the flex row beside the title instead of absolutely over it.
    modal: {
      slots: {
        header: 'items-start min-h-0 shrink-0',
        wrapper: 'min-w-0 flex-1',
        footer: 'shrink-0',
        close: 'static shrink-0 -my-1 -me-2',
      },
    },
    slideover: {
      slots: {
        header: 'items-start min-h-0 shrink-0',
        wrapper: 'min-w-0 flex-1',
        close: 'static shrink-0 -my-1 -me-2',
      },
    },
    drawer: {
      slots: {
        header: 'items-start min-h-0 shrink-0',
        close: 'shrink-0',
      },
    },
  },
})
