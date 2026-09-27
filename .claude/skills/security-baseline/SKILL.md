---
name: security-baseline
description: Security rules for this codebase. Use when designing, building or reviewing any feature that handles user input, money, auth or personal data.
---

# Security baseline

- Validate every input at the boundary (API handler). Never trust the client.
- Money is an integer in the smallest unit (satang). Never use floats for money.
- Any endpoint that checks a secret or a code must be rate-limited per user and per IP.
- Never log PII (email, phone, address, full name) or secrets. Log IDs instead.
- Errors sent to the client must not reveal whether a record exists.
