/**
 * Publish and assign (City Laundry pilot §2): the Studio opened from a shop publishes the reviewed
 * draft, then attaches the template to that shop with the existing APIs. Success is only both. When
 * the publish worked and the attach didn't, the version stays published and Retry assignment
 * attaches it again, never publishing another version; attaching an attached template changes
 * nothing on the server, so a retry can't add a second attachment.
 */

export type PublishAssignResult
  = | { status: 'assigned', number: number }
    | { status: 'publishFailed', error: unknown }
    | { status: 'assignFailed', number: number, error: unknown }

interface PublishAssignOptions {
  /** Publishes the draft and answers the new version's number; absent for a retry. */
  publish?: () => Promise<number>
  /** The version already published, for a retry (or a published draft with nothing new). */
  number?: number
  /** Attaches the template to the shop. */
  attach: () => Promise<unknown>
}

export async function publishAndAssign(options: PublishAssignOptions): Promise<PublishAssignResult> {
  const { publish, attach } = options
  let number = options.number
  if (publish) {
    try {
      number = await publish()
    }
    catch (error) {
      return { status: 'publishFailed', error }
    }
  }
  if (number === undefined) throw new Error('Nothing published to assign')
  try {
    await attach()
  }
  catch (error) {
    return { status: 'assignFailed', number, error }
  }
  return { status: 'assigned', number }
}
