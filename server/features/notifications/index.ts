/** The notifications feature's public API (docs/server/architecture.md → Features). */
export { deliverDue, linkStatement, orderMessages, purgeNotifications, queueChatMessageStatement } from './notifications.service'
export type { DeliveryReport, OutboxMessage, SendOutcome } from './notifications.service'
export type { NotificationKind } from './notifications.types'
