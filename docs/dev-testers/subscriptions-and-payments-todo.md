# Paid domain email and free services — developer/tester TODO

Status: active post-v1 priority, per owner direction on November 18–19, 2026.
The original v1 acceptance remains complete. No mailbox provisioning, customer
accounts, or payment code has been implemented for this service. Keep development
and acceptance in a payment-provider sandbox; do not charge real cards.

## Product direction confirmed November 19, 2026

- The paid product is a real, unique `@hymecymeyseh.fun` email mailbox for each
  member. An alias or app-only login address does not meet the requirement.
- Members pay for the mailbox plan. MediaSpace, Jellyfin, and the owner's other
  services have no separate service charge and are accessed through the member's
  domain account while its paid plan is current. Do not add a separate media or
  service-access fee.
- Payments are crypto and customer-initiated for each billing period. Do not
  automatically debit a wallet or silently renew a payment. If a member does not
  pay, pause access to the other services while keeping their email mailbox
  working for sending and receiving, subject to an explicit storage quota.
  Define mailbox quota, over-quota behavior, and retention before launch.
- After sign-in, members can choose what they want to watch or hide. Keep that
  preference separate from mailbox billing and service authentication.
- The payment gateway is used to charge for and provision email mailboxes. Each
  service must still enforce its own account and data permissions.
- Mailbridge C is the selected future member-mailbox host. Its current code has a
  private HTTP API, terminal client, and Cloudflare inbound Worker/KV path; those
  do not yet establish member mailbox ownership or standard mail-client access.

## 1. Resolve email and account operations before implementation

- [x] Select Mailbridge C as the future member-mailbox host (owner direction,
  November 19, 2026).
- [ ] Extend and verify Mailbridge C for customer mailboxes: automated creation,
  administrative/abuse suspension, recovery, deletion, per-mailbox authorization,
  and standard IMAP/SMTP client access. Billing lapse must not suspend the
  mailbox under the current policy. The current API uses a shared token and does
  not enforce mailbox ownership. Verify inbound activation and outbound delivery,
  deliverability, and abuse controls for member accounts.
- [ ] Select the payment provider independently of the mailbox host and verify
  crypto checkout, signed payment notifications, refunds, and sandbox support.
  Start with the [provider screening and application packet](payment-provider-screening.md);
  listed providers are candidates only until they approve the exact offer. Each
  billing period must require an explicit customer payment; an emailed invoice
  reminder is acceptable, automatic wallet debits are not.
- [ ] Define the mailbox plan: price, currency, billing interval, storage/quota,
  renewal, cancellation, failed payment, grace period, refunds, and what happens
  to the mailbox and its data after cancellation.
- [ ] Confirm inbound and outbound delivery, DNS records, sender authentication,
  spam/abuse controls, password reset, account recovery, and support ownership.
- [ ] Decide whether the same login identity will be shared across MediaSpace
  and Jellyfin or securely linked between separate accounts. A paid mailbox must
  not grant access to another member's data.
- [ ] Define whether watch/hide choices only filter a member's feed or affect
  which profiles they can view. Services remain free; this is a content and
  privacy rule, not a second paid entitlement.
- [ ] Confirm a sandbox account, payment credentials, webhook delivery method,
  and billing notifications before implementation. Keep credentials out of Git.

## 2. Build the smallest secure mailbox flow

### Customer and payment lifecycle

Keep mailbox state separate from access to MediaSpace/Jellyfin. The expected
behavior is:

| Event | Mailbox | Other services |
| --- | --- | --- |
| Before first confirmed payment | Not provisioned; the customer may select a desired address during checkout. | No member access. |
| Customer completes a crypto invoice and the server verifies settlement | Provision one unique mailbox and enable sending/receiving within its quota. | Enable member access without a separate service charge. |
| A paid period ends without a new customer-initiated payment | Keep the mailbox working for sending/receiving within its quota; do not delete mail or disable the address solely for nonpayment. | Pause access until a new payment is verified. |
| Customer chooses to renew and a new payment is verified | Keep the same mailbox and its stored messages. | Restore access. |
| Administrator suspends for abuse/security or a user requests deletion | Apply the separately documented mailbox suspension/deletion and retention policy. | Apply the related account security policy. |

The checkout must clearly show the amount, crypto asset/network, paid period,
renewal date, mailbox quota, manual-renewal requirement, and what access pauses
if payment is skipped. It must not imply that an invoice reminder charges the
customer. Settle provider/network confirmation rules before activating a mailbox
or restoring service access. Mailbox quota exhaustion must have an explicit
behavior and notification policy; it must not silently delete existing mail.

### Full-mailbox behavior agreed November 23, 2026

- Use Proton Mail as a product-pattern reference for a visible storage meter and
  clear storage-limit messaging, not as terms to copy verbatim. Our account
  continues sending and receiving within quota after a paid period ends, and
  nonpayment does not trigger mailbox deletion. Payments remain customer-
  initiated; do not copy automatic renewal.
- Warn the member before the limit and show current usage in the mail interface.
- Show a mailbox storage meter on the inbox page with bytes used, total quota,
  and bytes remaining. Update it after delivery and deletion; make the numbers
  understandable with accessible text and a visible percentage/progress state.
- Preserve existing mail. Never silently delete messages or disable the mailbox
  because it is full or because a paid period ended.
- Keep outbound sending enabled under separate rate and abuse controls. Verify
  and explain what happens to a Sent-folder copy when no storage remains.
- Do not accept an incoming message that cannot be stored. Temporarily defer it
  with an SMTP 4xx response (for example, 452 for insufficient storage) so the
  sender's mail system can retry. If space is freed in time, delivery can
  complete; otherwise the sender's system may eventually report nondelivery.
- Let members delete messages to free space. An export or migration tool can be
  optional; members should not have to export mail to keep it safe. The operator
  owns tested backups and restore procedures. Define the actual quota and
  warning thresholds only after mail-storage capacity and the operational
  reserve are set.
- Reference policies: [Proton storage-limit behavior](https://proton.me/support/free-plan-limits),
  [plan downgrade behavior](https://proton.me/support/manage-subscription), and
  [inactive-account policy](https://proton.me/support/inactive-accounts). Review
  them as examples only; our manual-payment, mailbox-continuity, and retention
  policy above takes precedence for this product.

Acceptance for the storage meter: show accurate used/total/remaining values for
an empty inbox, a partially used mailbox, and a full mailbox; verify values
change after receiving and deleting a message with an attachment. The full
state must explain that incoming mail is temporarily deferred and link to the
member's mail cleanup controls. Do not rely on color alone to communicate the
quota state.

- [ ] Add subscriber account registration and verification tied to a provisioned
  mailbox. Keep administrator sign-in and permissions separate.
- [ ] Use hosted checkout. Never store raw card numbers or security codes.
- [ ] Provision one unique real mailbox only after the payment provider confirms
  the purchase. Handle duplicate addresses and failed provisioning without
  charging twice or granting a broken account. Let the customer choose a
  requested address before provisioning and communicate conflicts/retries safely.
- [ ] Process signed provider webhooks server-side. Verify signatures, make
  events idempotent, tolerate retries and out-of-order delivery, and record safe
  diagnostics without payment or mailbox secrets.
- [ ] Keep email mailbox status separate from service-access status. Apply the
  verified paid-plan state to MediaSpace and Jellyfin access consistently, while
  leaving the mailbox active after nonpayment under the approved quota/retention
  policy. Do not trust browser-reported payment status or email text alone.
- [ ] Store account, billing-event, and user preference data durably with a
  documented backup/recovery plan. Current MediaSpace authentication is
  administrator-only and its catalog is not a subscriber account store.
- [ ] Add the minimal watch/hide preference UI without changing the services'
  free-access policy or weakening existing private-media checks.

## 3. Developer tester acceptance checklist

Use sandbox accounts and disposable content. Record the build/commit, browser
and device, mailbox/account state, expected result, actual result, and evidence.
Never use real payment details or production member data.

- [ ] Complete a successful sandbox mailbox purchase and confirm exactly one
  unique, working domain mailbox is provisioned.
- [ ] Confirm no mailbox or other-service entitlement is activated from a
  browser return URL without a verified server-side payment event.
- [ ] Verify the mailbox can receive and send test messages as defined by the
  selected plan, and that password reset/account recovery works.
- [ ] Try declined, abandoned, canceled, and repeated checkout attempts; confirm
  no mailbox is incorrectly provisioned and no duplicate charge/account appears.
- [ ] Replay duplicate events and send invalid-signature or out-of-order webhook
  events; verify invalid events are rejected and valid events apply once.
- [ ] Test renewal, cancellation, failed payment, grace period, refund, and
  mailbox/data retention behavior exactly as approved. Verify that a skipped
  manual renewal pauses only other-service access and leaves the mailbox
  working; a later verified payment restores that access without duplicating or
  replacing the mailbox.
- [ ] Sign in to MediaSpace and Jellyfin with the domain account. Confirm neither
  service adds a separate service fee and one member cannot access another
  member's mailbox, profile choices, or private data.
- [ ] Verify watch/hide selections persist and affect only the approved content
  behavior; probe direct pages, APIs, and media URLs.
- [ ] Check administrator access, desktop and iPhone Safari flows, privacy-safe
  logs, sandbox cleanup, and mailbox abuse/rate limits.

## 4. Ready-to-release criteria

- [ ] Owner approves the mailbox provider, plan, price, billing/lifecycle rules,
  account recovery policy, and Jellyfin account-linking model.
- [ ] Mailbox delivery and account provisioning pass sandbox acceptance, along
  with webhook replay/failure and cross-member access-denial checks.
- [ ] Production secrets, DNS/mail records, backups, and rollback/recovery steps
  are configured and reviewed separately from development.
- [ ] Owner explicitly approves enabling real mailbox charges. Until then,
  production billing remains disabled.
