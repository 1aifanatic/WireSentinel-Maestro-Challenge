# WireSentinel Technical Incident Runbook

Runbook ID: WS-RUN-001  
Version: 1.0

1. Preserve the correlation ID, failed node, error category, retry count, and sanitized error text.
2. Retry transient reads with bounded exponential backoff.
3. Do not retry validation failures or rejected credentials automatically.
4. Do not send customer rejection messages for technical incidents.
5. Store the incident in the case audit trail.
6. Route unrecovered incidents to Technical Failure.
7. Resume from durable state after the underlying dependency is restored.

HTTP 429, HTTP 5xx, model-unavailable, and connector timeout responses are technical failures even when an HTTP activity returns a response object instead of throwing.
