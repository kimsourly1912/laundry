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
  },
})
