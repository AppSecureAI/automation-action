# Dependency Pinning Policy

The automation action release bundle must be reproducible from reviewed
dependency manifests.

## Current policy

- `package-lock.json` is committed and is the source of truth for resolved npm
  package versions.
- Local and CI validation should use `npm ci`, not `npm install`.
- Release-critical GitHub Actions must not use mutable `@main` or `@master`
  refs.
- `package.json` semver ranges are allowed only because `npm ci` installs from
  the committed lockfile.

## Checks

Run the audit before release branches are approved:

```bash
npm run check:dependency-pinning
```

The audit fails when declared packages are missing from the lockfile, workflows
use `npm install`, workflows use mutable action refs, or direct `pip install`
commands are unpinned.

## Version updates

This policy freezes currently locked production-intended versions. Compatible
package refreshes should be tracked as separate release issues and tested before
promotion.
