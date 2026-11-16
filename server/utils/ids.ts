import { v7 } from 'uuid'

/**
 * A new id for our tables: UUID v7 (RFC 9562), time-ordered so indexes stay compact and ids sort by
 * creation. Better Auth's tables keep Better Auth's own ids. Ids are opaque: never parse them.
 */
export function newId(): string {
  return v7()
}
