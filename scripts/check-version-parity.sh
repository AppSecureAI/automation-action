#!/usr/bin/env bash
set -euo pipefail

TAG=""
OUTPUT_FILE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --tag)
      TAG="${2:-}"
      shift 2
      ;;
    --output)
      OUTPUT_FILE="${2:-}"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

PACKAGE_VERSION="$(node -e "console.log(JSON.parse(require('node:fs').readFileSync('package.json', 'utf8')).version)")"
VERSION_TS="$(node scripts/read-version-ts.js)"

if [[ "$PACKAGE_VERSION" != "$VERSION_TS" ]]; then
  echo "Version parity check failed: package.json=$PACKAGE_VERSION src/version.ts=$VERSION_TS" >&2
  exit 1
fi

if [[ -n "$TAG" ]]; then
  EXPECTED_TAG="v${PACKAGE_VERSION}"
  if [[ "$TAG" != "$EXPECTED_TAG" ]]; then
    echo "Version parity check failed: tag=$TAG expected=$EXPECTED_TAG" >&2
    exit 1
  fi
fi

if [[ -n "$OUTPUT_FILE" ]]; then
  {
    echo "version=${PACKAGE_VERSION}"
    echo "version_ts=${VERSION_TS}"
    echo "package_json=${PACKAGE_VERSION}"
    echo "major=v${PACKAGE_VERSION%%.*}"
    MINOR_PART="${PACKAGE_VERSION%.*}"
    echo "minor=v${MINOR_PART}"
  } >> "$OUTPUT_FILE"
fi

echo "Version parity check passed: ${PACKAGE_VERSION}"
