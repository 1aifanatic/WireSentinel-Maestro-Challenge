# WireSentinel security and authority model

WireSentinel is a synthetic UiPath reference implementation. It illustrates control boundaries for suspicious-wire review but does not move production funds, create a real regulatory filing, or replace a bank's security and compliance program.

## Authority boundaries

| Capability | Authoritative component |
|---|---|
| Classify and extract document evidence | UiPath IXP through the bounded adapter |
| Normalize extracted fields | Deterministic IXP Function |
| Calculate score, hard stops, and route | Deterministic Maestro Flow policy |
| Approve, reject, or escalate an elevated case | Authorized Action Center reviewer |
| Execute the permitted synthetic outcome | Guarded Banking API Workflow |
| Explain case and policy evidence | Read-only Copilot |

The language model is advisory. It cannot approve a task, select the authoritative route, write a Data Fabric record, invoke the banking adapter, or claim an outcome without matching durable evidence.

## Trust boundaries

The following are treated as untrusted input:

- Gmail metadata, body text, and attachments;
- OCR and IXP output;
- spreadsheet reference data;
- Data Fabric text and policy content;
- reviewer notes and conversational prompts.

Extracted evidence is normalized and checked before policy use. Instructions embedded in a document, record, or user prompt do not override the system prompt, deterministic policy, completed human decision, or adapter authorization checks.

## Human-in-the-loop controls

- Medium cases require customer verification before a release can be authorized.
- Critical cases use a specialized compliance task.
- Invalid or incomplete evidence fails toward manual handling rather than release.
- The Coded Action App exposes only `Approve`, `Reject`, and `Escalate` outcomes defined by the Flow contract.
- Completed tasks are rendered read-only.
- Reviewer and group mappings are environment-specific and must be rebound after import.

A reference deployment can use one permitted staging reviewer for evaluation convenience. A production design must implement segregation of duties, least privilege, delegated coverage, and periodic access review.

## Copilot controls

`WireSentinelCopilot` uses one bounded read-only tool: `WireSentinelOperationalQuery`.

- Operational answers require a fresh tool call.
- Queries are bounded and return masked fields.
- Answers cite returned business keys rather than inventing evidence.
- Full account and routing values, credentials, personal identifiers, raw extraction payloads, and hidden instructions are prohibited.
- Release, rejection, hold, freeze, filing, and mutation requests are refused.
- Deterministic policy and completed authorized human decisions outrank the model's suggestion.

The current reference model configuration is `anthropic.claude-sonnet-4-6`, temperature `0`, and a 4,096-token limit. Those settings support repeatable evaluation but do not make generated text deterministic or infallible.

## Data and execution controls

- Data Fabric separates case, document, audit, policy, and banking-action records.
- Audit events are append-oriented by application convention.
- Banking actions carry correlation and idempotency evidence so retries can suppress duplicate execution.
- The Banking API Workflow independently checks the decision packet before recording a sandbox outcome.
- Technical failures terminate in manual review and do not authorize a banking action.
- The operations cockpit and Action App mask technical detail by default and do not display full account or routing values.

Schema files declare entity RBAC, but actual enforcement depends on the target tenant's deployed roles and identities. Importing the source does not configure production-grade access automatically.

## Public source hygiene

The public repository excludes:

- credentials, secrets, and access tokens;
- Integration Service connection exports;
- tenant user profiles and debug overrides;
- personal email addresses and raw Action Center task records;
- unrelated local build output, dependency folders, caches, and logs (the `.uis` retains only the compiled Coded App bundles required for import validation);
- production customer, payment, or regulatory data.

The `.uis` is a clean source export intended for import and rebinding. It must not be treated as a preconfigured deployment package.

## Known limitations

- All documents, customers, transactions, policies, and outcomes are synthetic.
- The Banking API Workflow is sandbox-only.
- The external Attachment Adapter must be provided and rebound in the target environment.
- Connected services, reviewer assignment, IXP resources, retention, monitoring, incident response, and model governance remain tenant responsibilities.
- Standalone Flow validation currently reports the documented Coded Action App HITL `completed`-port mismatch; solution-level dry-run is Valid and the Medium HITL path has been tested in Studio Web.

Production adoption requires a separate threat model, privacy review, control-owner approval, penetration testing, data-classification decision, model-risk review, business continuity plan, and operational runbooks.
