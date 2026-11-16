declare module '#app' {
  interface PageMeta {
    /** Signed out only (`middleware/auth.global.ts`). */
    public?: boolean
    /** `platform`: the super admin's pages. `shop`: an active shop's. */
    area?: 'platform' | 'shop'
    /** A statement the page needs (`order:cancel`). */
    permission?: string
    /** The page title's i18n key, for the navbar and `<title>`. */
    title?: string
  }
}

export {}
