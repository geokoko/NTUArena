# Security Policy

## Supported Versions

| Version | Supported          |
|---------|--------------------|
| latest  | ✅ Yes             |
| < latest | ❌ No             |

## Reporting a Vulnerability

If you discover a security vulnerability in NTUArena, **please do not open a public issue.**

### What to include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Response timeline

- **Acknowledgement**: within 48 hours
- **Initial assessment**: within 1 week
- **Fix or mitigation**: best effort, depending on severity

## Security Measures

NTUArena implements the following security practices:

- **Authentication**: JWT-based auth with bcrypt password hashing
- **Input validation**: Server-side validation on all endpoints
- **NoSQL injection prevention**: `express-mongo-sanitize` strips `$` and `.` operators
- **Rate limiting**: Applied to all API endpoints (stricter on auth routes)
- **CORS**: Configurable origin restriction via environment variable
- **Dependencies**: Automated weekly updates via Dependabot
- **Secrets management**: All credentials stored in environment variables, never committed

## Scope

The following are **in scope** for security reports:

- Authentication/authorization bypasses
- Injection vulnerabilities (NoSQL, XSS, etc.)
- Sensitive data exposure
- Server-side request forgery (SSRF)

The following are **out of scope**:

- Denial of service (DoS) attacks
- Social engineering
- Issues in third-party dependencies (report upstream)
- Issues requiring physical access to the server
