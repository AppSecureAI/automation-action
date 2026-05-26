# Supply-chain Guard Catalog

automation-action consumes the shared AppSecAI supply-chain guard catalog through `scripts/supply-chain-guard-catalog.json`.

Run these checks before approving dependency, workflow, or editor-configuration changes:

```sh
npm run check:supply-chain-catalog
npm run test:supply-chain-guard
```

The guard blocks known affected npm package families, known malware payload filenames, known text IoCs, Claude `SessionStart` persistence hooks, and VS Code `folderOpen` task persistence. False positives require a PR comment with the indicator, evidence, and release-owner approval. Emergency overrides should be temporary and followed by a catalog update or narrowed matcher.
