/** The notifications feature's public API (docs/server/architecture.md → Features). */
export { countOrderListeners, deliverDue, linkStatement, purgeNotifications, queueChatMessageStatement, queueOrderMessagesStatement, revokeCustomerLinksStatement } from './notifications.service'
export type { DeliveryReport, OutboxMessage, SendOutcome } from './notifications.service'
export type { NotificationKind } from './notifications.types'
