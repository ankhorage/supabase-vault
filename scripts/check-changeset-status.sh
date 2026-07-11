#!/usr/bin/env bash
set -euo pipefail

base_ref="origin/${GITHUB_BASE_REF:-main}"
git fetch origin "${GITHUB_BASE_REF:-main}" --depth=1

if git diff --name-only "${base_ref}...HEAD" | grep -Eq '^\.changeset/[^/]+\.md$'; then
  echo "Changeset found."
  exit 0
fi

echo "A package changeset is required."
exit 1
