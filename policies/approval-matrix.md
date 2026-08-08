# WireSentinel Synthetic Approval Matrix

Policy ID: WS-POL-002  
Version: 1.0

| Route | Typical score | Required actor | Permitted outcomes |
|---|---:|---|---|
| Low | 0-25 | Flow | Release only when every straight-through control passes |
| Medium | 26-50 | Wire Operations | Verified, Not Verified |
| High | 51-75 | Wire Manager | Approve, Hold for Compliance, Reject |
| Critical | 76-100 or hard override | Compliance | Release, Hold and File SAR, Reject |

Hard overrides include an exact sanctions match, material document conflict, inactive account, missing signature, duplicate request, or unsupported primary document.

Agents are advisory. They cannot release, freeze, reject, or file a SAR.

Reviewer and group assignments are deployment-specific. The role shown in the task remains the policy authority.
