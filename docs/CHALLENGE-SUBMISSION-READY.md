# WireSentinel challenge submission readiness

WireSentinel is ready to record and package for the UiPath Maestro Flow Challenge. The remaining submission actions are external: record the final three-minute video, upload it with the source export, and complete the challenge form.

## Submission artifacts

| Artifact | Location | Status |
|---|---|---|
| Clean Studio Web source | [`release/WireSentinel-Challenge-1.1.17-UI-Final.uis`](../release/WireSentinel-Challenge-1.1.17-UI-Final.uis) | Ready; CLI `1.197.1` dry-run `Valid` |
| Architecture and demo guide | [`output/pdf/WireSentinel-Architecture-and-Demo-Guide.pdf`](../output/pdf/WireSentinel-Architecture-and-Demo-Guide.pdf) | Ready |
| Three-minute presentation path | [`docs/DEMO-STORYBOARD.md`](DEMO-STORYBOARD.md) | Ready |
| Live operations cockpit | [Open WireSentinel](https://aifanatic.staging.uipath.host/wiresentinel-cockpit) | Live; authentication may be required |
| Demo video | Record from the final Medium run | Pending presenter action |

Source archive SHA-256: `FADD8DF36048D525E7405530DFC98946C04EA8DF48AE170BD302D4AE214B9BF9`

## What the source contains

- Eight registered UiPath projects: Maestro Flow, IXP Function, two Agents, two API Workflows, a Coded Web App, and a Coded Action App.
- The shared React review workspace used by both Coded Apps.
- Five Data Fabric entity definitions and synthetic policy seed data.
- Synthetic Low, Medium, and Critical document pairs.
- Component tests, selected screenshots, operating policies, and concise challenge documentation.

The external Attachment Adapter is a runtime dependency and is not a ninth project in the `.uipx`. It must be published or selected and rebound in the target environment.

## Proven Medium demo

The recommended video follows one Medium-risk transaction:

1. Supply the synthetic wire instruction and invoice.
2. Show IXP classification and extraction for both documents.
3. Show deterministic score 40, reason codes `AMOUNT_GE_25K` and `NEW_BENEFICIARY`, and the recommendation to verify the customer.
4. Ask WireSentinel to explain the recommendation and point out its read-only authority boundary.
5. Approve the Action Center customer-verification task.
6. Show Maestro resume, the guarded sandbox release, `ReleasedAfterVerification`, and Data Fabric/audit evidence.

## Verification summary

- `uip solution pack --dry-run`: **Valid** for the clean source `.uis` with UiPath CLI `1.197.1`.
- Coded App component tests: **8 passing**.
- Web and Action app builds: **passing** at version `1.2.3`.
- Live Medium path: two-document IXP extraction, Action Center decision, Maestro continuation, sandbox banking result, Data Fabric write-back, cockpit visibility, and outcome email verified.

The Flow 1.9 Studio Web serialization was normalized to schema 1.8 for packaging with UiPath CLI `1.197.1`, which is pinned in CI for reproducibility. CLI `1.198.0` attempts an unsupported 1.8-to-1.9 migration for this export. Standalone Flow validation still reports the known Coded Action App HITL `completed`-port mismatch; the solution dry-run is Valid and the Medium HITL route has been executed successfully in Studio Web.

## Final presenter checklist

- [ ] Import or open the solution and confirm all environment mappings.
- [ ] Confirm the live cockpit is accessible in the presentation session.
- [ ] Keep the two Medium PDFs ready in a simple folder.
- [ ] Use only synthetic inputs and avoid showing tenant administration or personal data.
- [ ] Decide whether to demonstrate a fresh pending task or a completed read-only task.
- [ ] Rehearse the three-minute storyboard once with a timer.
- [ ] Record the scenario, Flow canvas, one run, Action Center decision, cockpit result, and close.
- [ ] Upload the video and clean `.uis`, then complete the challenge submission form.

## Scope statement

This is a hackathon demonstration of orchestration and governance patterns. The banking result is synthetic; production hardening, access design, retention, monitoring, and model governance are deliberately outside the submitted implementation.
