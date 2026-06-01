#!/usr/bin/env bash
set -euo pipefail

DRY_RUN=false
PUSH=false
VERBOSE=false
TAG=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --push)
      PUSH=true
      shift
      ;;
    --verbose)
      VERBOSE=true
      shift
      ;;
    --tag)
      TAG="${2:-}"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

if [[ -n "$TAG" ]]; then
  ./scripts/check-version-parity.sh --tag "$TAG"
else
  ./scripts/check-version-parity.sh
fi

if [[ "$VERBOSE" == "true" ]]; then
  echo "publish-public mode: dry_run=${DRY_RUN} push=${PUSH} tag=${TAG:-none}"
fi

if [[ "$DRY_RUN" == "true" ]]; then
  echo "Public mirror dry-run passed"
  exit 0
fi

if [[ "$PUSH" != "true" ]]; then
  echo "Refusing to publish without --push" >&2
  exit 1
fi

echo "Public mirror publish requested for ${TAG:-current version}"
