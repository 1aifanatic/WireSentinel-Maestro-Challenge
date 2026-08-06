# WireSentinel Synthetic Wire Operations Policy

Policy ID: WS-POL-001  
Version: 1.0  
Effective date: 2026-07-28  
Owner: Wire Operations

This policy is synthetic and exists only for the UiPath Maestro Flow Challenge.

## Supported intake

A valid case contains exactly one wire transfer instruction. Zero or more invoices may support the instruction. Unsupported attachments are quarantined and do not become payment authority.

The wire instruction is the authoritative request. Email text and invoices are supporting evidence. A mismatch between the wire instruction and an invoice increases risk and requires human review.

## Required wire fields

The instruction must include request ID, customer ID, debit account, transfer type, amount, currency, beneficiary name, beneficiary bank, beneficiary country, routing or SWIFT code, purpose, requested execution date, approver name, and signature status.

## Straight-through release

A case may be released without human review only when all of the following are true:

1. Every required field is present.
2. Wire-document extraction confidence is at least 0.95.
3. Document classification confidence is at least 0.95.
4. The email and documents have no material conflict.
5. The invoice total, when an invoice exists, matches the wire amount.
6. The customer and account are active.
7. The beneficiary is already trusted for the customer.
8. No sanctions or watchlist signal exists.
9. Country risk is low.
10. The amount is no more than USD 10,000.
11. Duplicate and replay checks pass.

An agent recommendation can increase scrutiny but cannot waive any condition.

## Mandatory human review

Medium-risk cases require customer verification by Wire Operations. High-risk cases require manager approval. Critical cases require Compliance review.

Freeze and SAR referral are never autonomous. They require an explicit Compliance outcome of Hold and File SAR.

## Technical failures

Connector errors, model failures, schema failures, timeouts, or quota failures are technical incidents. They must not be converted into customer rejection decisions.

## Evidence

Every case must preserve document identity, extraction result, confidence, policy signals, agent recommendation, human outcome, sandbox operation, and correlation ID.
