# Laundry paper slip plan

## 1. Purpose

Laundry gives a small laundry shop a digital copy of its own paper slip. The owner fills the slip at the counter and the customer keeps the saved copy in Telegram for later reference.

## 2. Platform setup

Create the shop and its owner account. In **Shops → Set up paper slip**, build the shop's blank slip with its own labels, field bindings and layout. Check a blank example and a filled example, then publish and assign it. New slips use the latest published version of the assigned template. Earlier slips keep their original template version and shop details.

## 3. Counter and customer flow

1. The owner signs in and lands on **Fill slip**. A sole assigned template opens automatically. With several templates the shop's default opens, and the owner can choose another.
2. The owner taps a box on the slip and fills it in any order. The receipt uses the shop's original field labels and the total is entered by the owner when the template calls for it.
3. **Save slip** creates one record and opens its read-only **Saved slip** preview with a scan-ready Telegram QR. A failed save keeps the entered values. Retrying the same submission creates at most one copy.
4. The customer scans the QR and taps **Start** in the bot. The bot sends the image of that saved slip to the customer's private Telegram chat. The customer can find it there later.
5. **New slip** opens a blank slip for the next customer. **Saved slips** provides shop-scoped lookup and lets the owner show the QR again.

A shop waiting for a template sees the setup message and support link. If Telegram is unavailable, the saved slip remains visible and the QR can be retried. The counter flow ends at sharing the saved slip.

## 4. Scope and compatibility

The owner pages are Fill slip, Saved slips, Saved slip, and existing account and template settings. The active flow excludes work statuses, pickup, payment actions, cancellation, printing and customer management. A historical amount or payment mark is part of the rendered slip. The stage-free owner experience uses the existing shop-scoped storage and API URLs so older slips stay accessible.

Keep Telegram invites scoped to a single saved slip, with the existing expiration and delivery queue. Display the QR separately so it works with any template. Telegram sends the saved design and values without the temporary scan QR.

## 5. Implementation and verification

- Open the slip editor on sign-in and reuse the template's existing field definitions and save validation. For HTML slips, use the server renderer's field positions. Artwork slips use the positions already in their templates.
- Open a read-only saved slip immediately after Save. Keep Telegram QR loading and failures independent from the saved picture.
- Replace the order list and dashboard with a simple saved-slip history. Retire workflow endpoints and ready notifications. Keep historical database records.
- Verify on a narrow phone that the owner can tap a field, correct an invalid value, retry a save, see the QR, reopen the same receipt and start a blank slip. Verify the Telegram webhook queues the correct image and that shop isolation holds.
- Confirm the end-to-end experience on a real shop phone with a real Telegram bot before rolling it out.
