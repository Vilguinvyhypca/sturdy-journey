# Crypto payment provider screening — paid domain mailboxes

Status: preliminary comparison, November 23, 2026. No provider has approved
this offer. The product being screened is a paid, unique
`@hymecymeyseh.fun` email mailbox. Each crypto payment is explicitly initiated
by the customer for a billing period; wallets are never automatically debited
and payments never silently renew. When a paid period lapses, the mailbox stays
active for sending and receiving under a storage quota, while access to the
owner's other services pauses until the customer pays again. Do not enable live
payments until the selected provider has reviewed and approved the offer.

## Comparison

| Option | Recurring-payment model | Hosted/API and settlement | Main tradeoff to resolve |
| --- | --- | --- | --- |
| NOWPayments | Subscription flow sends payment links/invoices; customer pays each billing period. | Hosted API, payment notifications, and a large listed asset selection; product options include wallet payout and custody/fiat services. | Confirm mailbox-hosting eligibility, available coins/networks, fees, settlement and billing reminders for the actual merchant jurisdiction. |
| BTCPay Server | Customer pays each term manually. Keep prepaid-credit renewal disabled unless the owner later explicitly chooses it. | Merchant-run software and checkout; no hosted processor account. Merchant operates the server and manages keys, monitoring, upgrades, backups, and payment reconciliation. | Most control and operational responsibility. Confirm accepted crypto/network scope and build a robust payment-to-service-access path. |
| CoinGate | Recurring bills send a fresh invoice/link by email on a schedule; payment is manual. Payment Channels provide a persistent customer-specific deposit address for repeat deposits, not a scheduled wallet debit. | Dashboard/API, payment callbacks, multiple assets; can settle to selected fiat such as USD/EUR/GBP or crypto, depending on product and eligibility. | Confirm mailbox-hosting eligibility, exact networks, fees, settlement country, and callback guarantees. |
| BitPay | Recurring subscriptions email a bill on schedule. The customer opens it and pays each invoice; it is not an automatic wallet charge. | Merchant dashboard/API and recurring billing; settlement options depend on the merchant and supported currency/region. | Confirm mailbox-hosting eligibility, merchant availability, accepted assets, fees, settlement and payment-failure handling. |

For comparison, use the same assumptions: one unique mailbox per customer and a
customer-initiated crypto payment for each billing period. No automatic wallet
debit or silent payment renewal. Server-side verified payment events govern
access to the other services, not mailbox availability. Never grant access from
a browser redirect alone.

## Official references checked

- [NOWPayments API and recurring payment products](https://nowpayments.io/api)
- [NOWPayments crypto subscription guide](https://nowpayments.io/blog/nowpayments-subscriptions-guide)
- [NOWPayments recurring payment API](https://nowpayments.io/blog/recurring-payments-api)
- [BTCPay Server subscriptions](https://docs.btcpayserver.org/Subscriptions/)
- [BTCPay Server offerings and recurring payments](https://docs.btcpayserver.org/Users/offerings/)
- [BTCPay Server general FAQ](https://docs.btcpayserver.org/FAQ/General/)
- [CoinGate recurring billing](https://coingate.com/blog/post/instant-billing-guide-for-crypto)
- [CoinGate payment channels](https://developer.coingate.com/reference/payment-channels-overview)
- [BitPay subscriptions](https://developer.bitpay.com/reference/subscriptions)
- [BitPay recurring-billing guide](https://support.bitpay.com/hc/en-us/articles/204936445-How-do-I-configure-recurring-subscription-billing)

Feature documentation is not merchant approval. Contact each hosted provider
with the paid mailbox offer and ask for written eligibility confirmation before
building an integration. BTCPay is self-hosted software rather than a processor
that approves the merchant, but its infrastructure and operational risks still
need review.

## Consistent product description

> We provide paid, individual email mailboxes using the `@hymecymeyseh.fun`
> domain. Each customer purchases one unique mailbox for sending and receiving
> email. We manage mailbox setup, account access, customer support, and
> cancellations. Customers initiate each crypto payment themselves; we do not
> automatically debit wallets. The mailbox remains available after a paid
> period ends, subject to its stated storage limit.

Use this description for the paid product. Answer provider questions accurately
and provide requested business/site information. Do not volunteer unrelated
service details, but do not omit information a provider specifically requests.
Do not make claims about abuse prevention, delivery, recovery, or mailbox
capabilities until they are in place and verified.

## Application packet still needed

- Legal business/merchant name, jurisdiction, business address, and authorized
  representative details.
- Mailbox price, billing interval, accepted asset/network choices, settlement
  preference, manual renewal, cancellation, refund, and mailbox/data retention
  terms, including what happens when its storage quota is reached.
- Public product and support pages, verified customer support contact, and a
  clear complaint/refund process.
- An honest statement of current mailbox capabilities and service limitations.
- Responses to provider due diligence and any requested documentation.

Do not create provider accounts, submit applications, or hand over credentials
on the owner's behalf without their direction. Do not put payment credentials
or secrets in Git.
