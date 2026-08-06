# WireSentinel three-minute demo storyboard

Use one Medium-risk scenario from document intake to final evidence. Keep the story focused on why Maestro is necessary: several specialized components must remain coordinated across an AI extraction, deterministic policy, a human wait, an external action, and durable audit.

## 0:00–0:25 — The business problem

Say:

> A suspicious wire arrives with a payment instruction and an invoice. Today, reviewers reconcile those documents, customer history, policy, approvals, and downstream actions across separate systems. WireSentinel turns that fragmented work into one explainable, human-governed journey.

State that every document, customer, and banking outcome in the demo is synthetic.

## 0:25–0:55 — Show the Maestro Flow

Trace the canvas from left to right:

1. Gmail event or governed replay.
2. Attachment Adapter and IXP extraction.
3. Customer, history, country, beneficiary, and watchlist context.
4. Deterministic risk policy.
5. Risk-specific Action Center decision.
6. Guarded Banking API Workflow.
7. Data Fabric evidence, operations cockpit, and read-only Copilot.

Say:

> AI extracts and explains. Deterministic policy routes. A human authorizes. Maestro holds the end-to-end state and resumes the same case after the decision.

## 0:55–1:25 — Start the Medium scenario

Use both Medium PDFs:

- the wire instruction supplies the requested payment facts;
- the invoice supplies the business justification used for cross-document validation.

Explain that one file alone cannot prove that the payment instruction is supported. IXP classifies and extracts both, while WireSentinel handles missing, unsupported, low-confidence, or inconsistent evidence explicitly.

Show the resulting Medium decision:

- USD 42,500;
- Maple Industrial Parts, Canada;
- score 40/100;
- `AMOUNT_GE_25K` and `NEW_BENEFICIARY`;
- recommendation: **Verify customer before release**.

## 1:25–1:55 — Show the operations cockpit

Open [the live WireSentinel cockpit](https://aifanatic.staging.uipath.host/wiresentinel-cockpit). Authentication may be required.

Show only three things:

1. the action-first case queue;
2. the authoritative recommendation and readable policy controls;
3. the Documents and Audit tabs that preserve evidence.

Avoid opening raw JSON or tenant administration pages.

## 1:55–2:20 — Ask WireSentinel

Open **Ask WireSentinel** and ask:

> Why must this case be verified before release?

Point out that the answer is grounded through one bounded, masked Data Fabric query and cites business keys. Then state the authority boundary:

> Copilot can explain the evidence or draft rationale, but it cannot approve, release, reject, hold, or change a record.

## 2:20–2:45 — Complete the human decision

Open the pending customer-verification task in Action Center, review the evidence, select **Approve**, and complete the task. Maestro resumes the same instance and the guarded adapter records a synthetic release.

If the presentation uses an already completed task, show its concise read-only outcome banner and explain that completed decisions cannot be changed from the app.

## 2:45–3:00 — Close with proof and value

Return to the cockpit and show:

- `ReleasedAfterVerification`;
- the final audit event;
- the sandbox banking action;
- the persisted Data Fabric evidence.

Close with:

> WireSentinel shows why Maestro Flow matters: one governed process coordinates document AI, deterministic controls, human accountability, replay-safe action, and explainable operations without giving the LLM financial authority.

## Presenter safeguards

- Use only the supplied synthetic PDFs.
- Do not show personal identities, tenant identifiers, credentials, account or routing values, or regulatory narrative.
- Do not spend demo time on setup, raw payloads, or unproven production claims.
- If a connected service is slow, continue with the completed case in the cockpit and narrate the already verified outcome.
