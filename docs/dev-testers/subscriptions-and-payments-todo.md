# Paid domain email and free services — developer/tester TODO

Status: active post-v1 priority, per owner direction on November 18–19, 2026.
The original v1 acceptance remains complete. No mailbox provisioning, customer
accounts, or payment code has been implemented for this service. Keep development
and acceptance in a payment-provider sandbox; do not charge real cards.

## Product direction confirmed November 19, 2026

- The paid product is a real, unique `@hymecymeyseh.fun` email mailbox for each
  member. An alias or app-only login address does not meet the requirement.
- Members pay for the mailbox plan. MediaSpace, Jellyfin, and the owner's other
  services are free to use through the member's domain account; do not add a
  separate media or service-access charge.
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
  suspension, recovery, deletion, per-mailbox authorization, and standard
  IMAP/SMTP client access. The current API uses a shared token and does not enforce
  mailbox ownership. Verify inbound activation and outbound delivery,
  deliverability, and abuse controls for member accounts.
- [ ] Select the payment provider independently of the mailbox host and verify
  hosted checkout, signed webhooks, refunds, and sandbox support.
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

- [ ] Add subscriber account registration and verification tied to a provisioned
  mailbox. Keep administrator sign-in and permissions separate.
- [ ] Use hosted checkout. Never store raw card numbers or security codes.
- [ ] Provision one unique real mailbox only after the payment provider confirms
  the purchase. Handle duplicate addresses and failed provisioning without
  charging twice or granting a broken account.
- [ ] Process signed provider webhooks server-side. Verify signatures, make
  events idempotent, tolerate retries and out-of-order delivery, and record safe
  diagnostics without payment or mailbox secrets.
- [ ] Apply the approved active/suspended/canceled mailbox state to account login
  consistently in MediaSpace and Jellyfin. Do not trust browser-reported payment
  status or email text alone.
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
- [ ] Verify the mailbox can receive and send test messages as defined by the
  selected plan, and that password reset/account recovery works.
- [ ] Try declined, abandoned, canceled, and repeated checkout attempts; confirm
  no mailbox is incorrectly provisioned and no duplicate charge/account appears.
- [ ] Replay duplicate events and send invalid-signature or out-of-order webhook
  events; verify invalid events are rejected and valid events apply once.
- [ ] Test renewal, cancellation, failed payment, grace period, refund, and
  mailbox/data retention behavior exactly as approved.
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
