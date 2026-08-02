# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | Yes       |
| < 0.1   | No        |

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Report security issues via [GitHub private vulnerability reporting](https://github.com/praveen221/underdelta/security/advisories/new), or email the maintainer.

Please include:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

We will acknowledge receipt within 48 hours and aim to release a fix within 7 days for critical issues.

## Security Model

Underdelta is a **local development tool**. It scans repositories on disk, writes output under `.underdelta/`, and optionally serves a local browser map. It does not require cloud accounts for the core scan path.

### Threat surface (high level)

| Vector | Mitigation |
|--------|------------|
| Path traversal while reading a target repo | Paths are resolved relative to the scan root; generated output stays under `.underdelta/` |
| Over-broad scanning of secrets / env files | Conventional ignores for dependencies, build artifacts, fixtures, and common secret-adjacent paths |
| Local HTTP serve surface | Server is opt-in (`--serve` / scan scripts) and intended for local development use |

### What Underdelta does NOT do

- Does not exfiltrate repository contents to a remote service during a normal scan
- Does not execute arbitrary code found in the scanned repository as part of extraction
- Does not store credentials or API keys for third-party AI providers as part of core operation

If you find a gap in this model, please report it privately using the process above.
