# Contributing to WireSentinel

Thank you for helping improve WireSentinel. Contributions are welcome when they preserve the project's explainable, human-governed design and keep the public repository safe to reuse.

## What you can contribute

- Maestro Flow corrections and clearer orchestration patterns
- IXP extraction and normalization improvements
- Coded Web App and Coded Action App usability or accessibility improvements
- Data Fabric schema and query improvements
- Copilot grounding, citation, masking, and refusal improvements
- deterministic policy, API Workflow, test, and documentation fixes

Please keep pull requests focused. Open a GitHub issue before proposing a breaking schema change, a new external dependency, or a change to the human-authority boundary.

## Non-negotiable design boundaries

- AI may extract, summarize, explain, or draft rationale; it must not approve, reject, release, freeze, file, or mutate operational records.
- Deterministic policy owns risk scoring and routing.
- Authorized Action Center users own elevated decisions.
- The Banking API Workflow must remain guarded, idempotent, and synthetic unless a separately reviewed implementation replaces it.
- Technical or evidence failures must fail toward manual handling, never toward automatic release.

## Set up the repository

Requirements:

- Node.js 22 or newer
- Python 3.11 or newer
- UiPath CLI `1.197.1` for reproducible validation of the supplied Studio Web export

Fork the repository, create a short-lived branch, and install dependencies:

```bash
git checkout -b feature/short-description
npm ci
```

## Run the required checks

Run the source checks before opening a pull request:

```bash
npm test
npm run build
python -m py_compile WireSentinelIxpAdapter122/main.py
```

Install the pinned UiPath CLI and disable startup version synchronization so CI and local validation use the same toolchain:

```bash
npm install --global @uipath/cli@1.197.1
export UIPATH_CLI_DISABLE_VERSION_SYNC=1
uip solution pack ./release/WireSentinel-Challenge-1.1.17-UI-Final.uis --dry-run --output json
uip api-workflow validate ./WireSentinelBankingAdapter/Workflow.json --output json
uip api-workflow build ./WireSentinelBankingAdapter --output json
uip api-workflow validate ./WireSentinelCopilotQueryApi/Workflow.json --output json
uip agent validate ./WireSentinelCopilot --output json
uip agent review ./WireSentinelCopilot --output json
```

In PowerShell, set the version-sync variable with:

```powershell
$env:UIPATH_CLI_DISABLE_VERSION_SYNC = "1"
```

Connected tenant validation is optional for forks and requires credentials that must remain in secret storage. Never add credentials to a workflow, source file, issue, or pull request.

## Use synthetic, public-safe data

Do not commit:

- real customer, beneficiary, payment, account, routing, SWIFT, sanctions, or regulatory data;
- personal email addresses, user profiles, Action Center task exports, or screenshots containing private identifiers;
- tenant IDs, folder IDs, entity IDs, connection exports, access tokens, client secrets, cookies, or environment files;
- local logs, debug overrides, caches, dependency folders, or generated packages outside the curated release artifact.

Use obvious placeholders for environment-specific bindings. Keep sample documents and records synthetic.

## Changing the `.uis` release artifact

Only update the curated `.uis` when the source solution itself changes. Before committing it:

1. Rebuild both Coded Apps so the required compiled bundles are current.
2. Export only the projects and minimal sanitized resources needed for import.
3. Confirm the archive contains no credentials, personal data, tenant exports, debug overrides, or machine-specific paths.
4. Run strict `uip solution pack --dry-run` validation with the pinned CLI.
5. Recalculate the SHA-256 value and update the checksum in `README.md`.
6. Confirm archive entry paths use `/` so validation also works on Linux.

## Pull request checklist

- [ ] The change has one clear purpose.
- [ ] Tests and builds pass locally.
- [ ] UiPath validation passes for every changed UiPath artifact.
- [ ] No secrets, personal data, tenant-specific exports, or real financial data are included.
- [ ] Public interfaces, schemas, and authority boundaries remain compatible or the breaking change is clearly explained.
- [ ] User-facing behavior and setup instructions are documented.
- [ ] New third-party material has a compatible license and attribution.

By contributing, you agree that your contribution is licensed under the repository's MIT License.
