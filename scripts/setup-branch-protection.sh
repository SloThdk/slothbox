#!/usr/bin/env bash
# Configure branch protection for the SlothBox GitHub repository.
# Requires: gh CLI authenticated as a repo admin.
# Run once after creating the public repository.

set -euo pipefail

REPO="${REPO:-SloThdk/slothbox}"
BRANCH="${BRANCH:-master}"

if ! command -v gh >/dev/null 2>&1; then
    echo "✗ gh CLI not installed. Get it from https://cli.github.com/"
    exit 1
fi

echo "→ enabling branch protection on ${REPO}#${BRANCH}"

gh api \
    --method PUT \
    -H "Accept: application/vnd.github+json" \
    "/repos/${REPO}/branches/${BRANCH}/protection" \
    -f "required_status_checks[strict]=true" \
    -f "required_status_checks[contexts][]=Node @slothbox/web" \
    -f "required_status_checks[contexts][]=Node @slothbox/api-gateway" \
    -f "required_status_checks[contexts][]=Node @slothbox/crypto-core" \
    -f "required_status_checks[contexts][]=.NET ingest" \
    -f "required_status_checks[contexts][]=.NET receipt" \
    -f "required_status_checks[contexts][]=Go services/reaper" \
    -f "required_status_checks[contexts][]=Go tools/verify" \
    -f "required_status_checks[contexts][]=Format" \
    -f "required_status_checks[contexts][]=Gitleaks" \
    -f "enforce_admins=true" \
    -f "required_pull_request_reviews[required_approving_review_count]=1" \
    -f "required_pull_request_reviews[require_code_owner_reviews]=true" \
    -f "required_pull_request_reviews[dismiss_stale_reviews]=true" \
    -f "required_signatures=true" \
    -f "allow_force_pushes=false" \
    -f "allow_deletions=false" \
    -f "required_linear_history=true" \
    -f "required_conversation_resolution=true" \
    -f "block_creations=false" \
    -f "lock_branch=false" \
    -f "restrictions=null"

echo "✓ branch protection configured"

echo "→ enabling secret scanning + push protection"
gh api \
    --method PATCH \
    -H "Accept: application/vnd.github+json" \
    "/repos/${REPO}" \
    -F "security_and_analysis[secret_scanning][status]=enabled" \
    -F "security_and_analysis[secret_scanning_push_protection][status]=enabled" \
    -F "security_and_analysis[dependabot_security_updates][status]=enabled"

echo "✓ secret scanning + push protection enabled"

echo "→ disabling forced merging without checks"
echo "  (This is what enforce_admins=true above accomplishes)"

echo ""
echo "Done. Verify at: https://github.com/${REPO}/settings/branches"
