#!/bin/bash
set -e
cd "$(dirname "$0")/dist"

if [ ! -d .git ]; then
  git init
  git branch -M gh-pages
  git remote add origin https://github.com/tommyliphysics/heat.git
fi

touch .nojekyll
git add -A

if ! git diff --cached --quiet; then
  git commit -m "deploy $(date -u +%Y-%m-%dT%H:%M:%SZ)"
else
  echo "Nothing changed, skipping commit."
fi

git push -f origin gh-pages


