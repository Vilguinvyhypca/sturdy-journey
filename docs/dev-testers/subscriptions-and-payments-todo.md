# Subscriptions and payments — developer/tester TODO

Status: active post-v1 priority, per owner direction on November 18, 2026.
The original v1 acceptance remains complete. No subscription or payment code is
implemented yet. Keep all development and acceptance activity in the payment
provider's sandbox; do not charge real cards.

## Product direction confirmed November 19, 2026

- Subscriber accounts are for `hymecymeyseh.fun` and each customer should have a
  unique email address associated with the service. Whether that address is a
  working mailbox or an app/login alias is still undecided.
- Payment by itself must not unlock the whole catalog. After signing in, a user
  should choose what they want to watch or hide. The product rules must clarify
  whether those choices filter the feed or define per-profile/content access.
- Account identity, provider-confirmed plan status, and user content choices are
  separate inputs. Enforce the resulting access on the server; neither visiting
  the domain nor a browser-reported payment status grants access by itself.

## 1. Decide the MVP before implementation

- [ ] Decide whether the unique service email is a working mailbox or a login
  alias, including verification and password-recovery behavior.
- [ ] Define how a confirmed plan combines with the user's watch/hide choices:
  feed personalization, per-profile access, or another explicit rule.
- [ ] Choose the smallest launch plan set: price, currency, billing interval,
  trial policy, and whether subscriptions renew automatically.
- [ ] Define cancellation, failed-payment/grace-period, refund, plan-change, and
  account-deletion behavior for the MVP.
- [ ] Select a payment provider and confirm a sandbox account, test credentials,
  webhook delivery method, and required receipt/notification behavior.
- [ ] Confirm which content remains public/free and how existing private or
  unlisted media behaves for signed-out, free, active, past-due, and canceled
  accounts.

## 2. Build the smallest secure subscription flow

- [ ] Add subscriber account flows and persist provider customer, subscription,
  and payment references plus a normalized subscription status. Never store raw
  card numbers or security codes.
- [ ] Implement sandbox checkout and a clear success, cancel, and recoverable
  failure path. The browser must not be able to grant its own entitlement.
- [ ] Process signed provider webhooks on the server. Verify signatures, make
  event handling idempotent, tolerate retries and out-of-order events, and record
  safe diagnostics without payment secrets.
- [ ] Enforce content access from server-verified subscription state on every
  relevant page and media/API route. Preserve administrator authorization
  boundaries.
- [ ] Add the minimum subscriber self-service and administrator visibility needed
  for the agreed MVP. Keep provider secrets out of source control and separate
  development, sandbox, and production configuration.

## 3. Developer tester acceptance checklist

Use sandbox accounts and disposable test media. Record the build/commit, browser
and device, test account state, expected result, actual result, and evidence for
each failure. Never use real payment details or production customer data.

- [ ] Complete a successful sandbox checkout and confirm the correct account and
  subscription state are recorded once.
- [ ] Try declined, abandoned, canceled, and repeated checkout attempts; confirm
  the UI explains the outcome and no duplicate entitlement/payment record appears.
- [ ] Exercise the supported renewal, cancellation, failed-payment, refund, and
  plan-change paths from the approved MVP rules.
- [ ] Replay duplicate events; deliver invalid-signature and out-of-order events;
  verify invalid events are rejected and valid events do not grant excess access.
- [ ] Check access as signed-out, free, active, past-due, canceled, and admin
  accounts. Probe direct page/API/media URLs as well as visible UI links.
- [ ] Confirm private media is denied when the account lacks an active entitlement
  and remains available only to the authorized account/admin under the agreed
  rules. Check that shared URLs do not bypass those rules.
- [ ] Verify users cannot edit price, status, account ID, or entitlement in the
  browser to obtain access.
- [ ] Check desktop and iPhone Safari checkout return, account status, and
  cancellation flows. Test keyboard access and readable errors.
- [ ] Confirm test-mode receipts/notifications, privacy-safe logs, and sandbox
  data cleanup behave as specified.

## 4. Ready-to-release criteria

- [ ] Owner approves the written MVP rules, provider, prices, currency, and
  customer-facing billing/cancellation language.
- [ ] Developer checks and tester acceptance pass in sandbox, including direct
  access-denial probes and webhook replay/failure cases.
- [ ] Production secrets and webhook endpoint are configured separately from
  development; a rollback plan and production smoke-check are documented.
- [ ] Owner explicitly approves enabling real charges. Until then, production
  checkout remains disabled.
