# Security Policy

## Overview

As a security-focused GitHub Action that processes SARIF files and security
findings, we take security seriously. If you discover a security vulnerability
in this project, we appreciate your help in disclosing it to us responsibly.

## Supported Versions

We currently support the following versions with security updates:

| Version | Supported          |
| ------- | ------------------ |
| 0.0.x   | :white_check_mark: |

## Reporting a Vulnerability

### Preferred Method: GitHub Security Advisories

We strongly encourage you to report security vulnerabilities through
[GitHub Security Advisories](https://github.com/AppSecureAI/automation-action/security/advisories/new).
This allows for private disclosure and collaboration on a fix before public
disclosure.

**Benefits of using GitHub Security Advisories:**

- Private, secure communication channel
- Coordinated disclosure timeline
- Potential for CVE assignment
- Recognition in security advisories

### Alternative Method: Email

If you prefer not to use GitHub Security Advisories, you can report
vulnerabilities via email to <security@appsecure.ai>. Please include:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested fixes (optional)

## Response Timeline

We are committed to responding to security reports promptly:

- **Initial Response**: Within 48-72 hours of report submission
- **Status Update**: Within 7 days with assessment and timeline
- **Resolution**: Varies based on complexity, but we aim for fixes within 30
  days for critical issues

## Disclosure Process

1. **Report Received**: We acknowledge receipt of your vulnerability report
2. **Investigation**: We investigate and validate the reported issue
3. **Fix Development**: We develop and test a fix
4. **Coordinated Disclosure**: We work with you on an appropriate disclosure
   timeline
5. **Public Release**: We release the fix and publish a security advisory
6. **Recognition**: We credit reporters (unless anonymity is requested)

## Security Best Practices for Users

When using this action in your workflows:

- Always use specific version tags rather than `@main` for production workflows
- Review the action's permissions and ensure least privilege
- Keep your workflows updated with the latest security patches
- Monitor security advisories for this repository

## Scope

This security policy applies to:

- The automation-action GitHub Action code
- Dependencies used by this action
- Documentation and examples that could lead to insecure usage

## Out of Scope

The following are generally considered out of scope:

- Issues in dependencies (please report to the upstream project)
- General GitHub Actions platform issues (report to GitHub)
- Issues requiring unlikely or overly complex attack scenarios

## Questions?

If you have questions about this security policy or how to report a
vulnerability, please open a discussion in the repository or contact the
maintainers.

Thank you for helping keep automation-action and our users safe!
