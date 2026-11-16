import * as v from 'valibot'

/**
 * The parts of a Telegram update the bot reads (https://core.telegram.org/bots/api#update): a
 * private message's text, or a shared contact. Everything else is ignored; unknown keys dropped.
 */
const userSchema = v.object({ id: v.number(), is_bot: v.optional(v.boolean()) })

const messageSchema = v.object({
  chat: v.object({ id: v.number(), type: v.string() }),
  from: v.optional(userSchema),
  text: v.optional(v.pipe(v.string(), v.maxLength(4096))),
  contact: v.optional(v.object({ phone_number: v.pipe(v.string(), v.maxLength(40)), user_id: v.optional(v.number()) })),
})

export const telegramUpdateSchema = v.object({
  update_id: v.number(),
  message: v.optional(messageSchema),
})

export type TelegramUpdate = v.InferOutput<typeof telegramUpdateSchema>
