#!/usr/bin/env bash
# Publish the health history to its own branch, "pipeline-health", which holds only health.json.
#
# Run from the root of a checkout that is allowed to push (on GitHub: actions/checkout with
# persist-credentials, in a job with permission to write contents). It:
#   1. gets the current history from the branch (creating the branch the first time),
#   2. adds the latest run with pipeline/health.py,
#   3. commits and pushes health.json.
# The website reads the file straight from GitHub, so the history is always current and a failed run
# still shows up. Nothing in the main branch changes.
set -euo pipefail

BRANCH="${HEALTH_BRANCH:-pipeline-health}"
WORK="$(mktemp -d)/health"

git config user.name "pipeline-bot"
git config user.email "pipeline-bot@users.noreply.github.com"

if git ls-remote --exit-code --heads origin "$BRANCH" >/dev/null 2>&1; then
    git fetch --depth 1 origin "$BRANCH"
    git worktree add --detach "$WORK" FETCH_HEAD
else
    echo "The $BRANCH branch does not exist yet; creating it."
    git worktree add --detach "$WORK" HEAD
    (cd "$WORK" && git checkout --orphan "$BRANCH" -q && git rm -rf . -q)
fi

python3 pipeline/health.py --history "$WORK/health.json" --record exports/pipeline_run.json --out "$WORK/health.json"

cd "$WORK"
git add health.json
if git diff --cached --quiet; then
    echo "The health history did not change."
else
    git commit -q -m "Record pipeline run ${GITHUB_RUN_ID:-local}"
    git push origin "HEAD:refs/heads/$BRANCH"
    echo "Published the health history to the $BRANCH branch."
fi
