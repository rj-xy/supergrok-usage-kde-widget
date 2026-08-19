#!/usr/bin/env bash
# Tag rX.Y.Z, pack source + Store kpackage, and publish a GitHub release.
#
# The git tag is rX.Y.Z (so GitHub also serves /archive/rX.Y.Z.tar.gz).
# <name>-X.Y.Z.tar.gz is the KPackage Get New Widgets installs (metadata.json
# at the archive root). <name>-X.Y.Z-src.tar.gz is the git source tree.
#
# Usage:
#   npm run release                 # current package.json version
#   npm run release -- patch
#   npm run release -- minor
#   npm run release -- major
#   npm run release -- 1.2.0
#   npm run release -- --dry-run
#   npm run release -- 1.2.0 --no-push
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

DRY_RUN=0
NO_PUSH=0
BUMP=""

usage() {
    sed -n '2,14p' "$0" | sed 's/^# \?//'
}

is_semver() {
    [[ "$1" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]
}

for arg in "$@"; do
    case "$arg" in
        -h|--help)
            usage
            exit 0
            ;;
        --dry-run) DRY_RUN=1 ;;
        --no-push) NO_PUSH=1 ;;
        patch|minor|major)
            if [[ -n "$BUMP" ]]; then
                echo "✗ extra argument: $arg" >&2
                exit 1
            fi
            BUMP="$arg"
            ;;
        -*)
            echo "✗ unknown option: $arg" >&2
            usage >&2
            exit 1
            ;;
        *)
            if [[ -n "$BUMP" ]]; then
                echo "✗ extra argument: $arg" >&2
                exit 1
            fi
            if ! is_semver "$arg"; then
                echo "✗ version must be X.Y.Z (got $arg)" >&2
                exit 1
            fi
            BUMP="$arg"
            ;;
    esac
done

NAME="$(node -p "require('./package.json').name")"
CURRENT="$(node -p "require('./package.json').version")"
REPO_URL="$(node -p "require('./package.json').repository.url.replace(/\\.git$/, '')")"
REPO_SLUG="${REPO_URL#https://github.com/}"
REPO_SLUG="${REPO_SLUG#git@github.com:}"

if ! is_semver "$CURRENT"; then
    echo "✗ package.json version is not X.Y.Z: $CURRENT" >&2
    exit 1
fi

IFS=. read -r MAJOR MINOR PATCH <<< "$CURRENT"
case "$BUMP" in
    "") NEW="$CURRENT" ;;
    patch) NEW="${MAJOR}.${MINOR}.$((PATCH + 1))" ;;
    minor) NEW="${MAJOR}.$((MINOR + 1)).0" ;;
    major) NEW="$((MAJOR + 1)).0.0" ;;
    *) NEW="$BUMP" ;;
esac

TAG="r${NEW}"
ARCHIVE_NAME="${NAME}-${NEW}.tar.gz"
SRC_ARCHIVE_NAME="${NAME}-${NEW}-src.tar.gz"
ARCHIVE="$ROOT/dist/${ARCHIVE_NAME}"
SRC_ARCHIVE="$ROOT/dist/${SRC_ARCHIVE_NAME}"
ASSET_URL="${REPO_URL}/releases/download/${TAG}/${ARCHIVE_NAME}"
TAG_URL="${REPO_URL}/releases/tag/${TAG}"

if [[ "$(git rev-parse --is-inside-work-tree 2>/dev/null)" != "true" ]]; then
    echo "✗ not a git repository" >&2
    exit 1
fi

if [[ -z "$(git branch --show-current)" ]]; then
    echo "✗ cannot release from a detached HEAD" >&2
    exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
    echo "✗ working tree is dirty; commit or stash first" >&2
    git status -sb
    exit 1
fi

if git rev-parse --verify --quiet "refs/tags/${TAG}" >/dev/null; then
    echo "✗ tag ${TAG} already exists" >&2
    exit 1
fi

echo "Current version: ${CURRENT}"
echo "Release version: ${NEW}"
echo "Git tag:         ${TAG}"
echo "Store kpackage:  ${ARCHIVE_NAME}"
echo "Source archive:  ${SRC_ARCHIVE_NAME}"
echo "Prefix:          ${NAME}-${NEW}/"
if [[ "$NO_PUSH" -eq 1 ]]; then
    echo "Push:            no"
else
    echo "Push:            origin + GitHub release"
    echo "Asset URL:       ${ASSET_URL}"
fi

if [[ "$DRY_RUN" -eq 1 ]]; then
    echo
    echo "Dry run — nothing written, tagged, or pushed."
    exit 0
fi

RESTORE_PATHS=(
    package.json
    package-lock.json
    package/metadata.json
    src/consts.ts
    package/contents/code/logic.js
)

restore_version_files() {
    git restore --worktree --staged -- "${RESTORE_PATHS[@]}" 2>/dev/null || true
}

apply_versions() {
    if [[ "$NEW" != "$CURRENT" ]]; then
        npm version "$NEW" --no-git-tag-version --allow-same-version --ignore-scripts
    fi
    local tsx="$ROOT/node_modules/.bin/tsx"
    if [[ ! -x "$tsx" ]]; then
        echo "✗ tsx not found; run npm install" >&2
        return 1
    fi
    "$tsx" "$ROOT/scripts/apply-versions.ts" "$NEW"
}

echo
echo "› sync version ${NEW}"
if ! apply_versions; then
    echo "✗ failed to write version ${NEW}; restoring files" >&2
    restore_version_files
    exit 1
fi

echo "› npm test"
if ! npm test; then
    echo "✗ tests failed; restoring version files" >&2
    restore_version_files
    exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
    git add -- "${RESTORE_PATHS[@]}"
    git commit -m "release ${TAG}"
    echo "› committed release ${TAG}"
else
    echo "› version files already at ${NEW}"
fi

echo "› tag ${TAG}"
git tag -a "$TAG" -m "Release ${TAG}"

echo "› source archive ${SRC_ARCHIVE_NAME}"
mkdir -p "$ROOT/dist"
git archive --format=tar.gz --prefix="${NAME}-${NEW}/" -o "$SRC_ARCHIVE" "$TAG"

top=""
while IFS= read -r line; do
    top="$line"
    break
done < <(tar -tzf "$SRC_ARCHIVE")
if [[ "$top" != "${NAME}-${NEW}/" ]]; then
    echo "✗ source prefix is ${top:-empty}, expected ${NAME}-${NEW}/" >&2
    git tag -d "$TAG" >/dev/null
    exit 1
fi
echo "› wrote ${SRC_ARCHIVE}"

echo "› store kpackage ${ARCHIVE_NAME}"
if ! bash "$ROOT/scripts/pack-plasmoid.sh" --out="$ARCHIVE"; then
    echo "✗ failed to pack kpackage" >&2
    git tag -d "$TAG" >/dev/null
    exit 1
fi

if [[ "$NO_PUSH" -eq 1 ]]; then
    echo
    echo "Tagged ${TAG} locally. Push later with:"
    echo "  git push --atomic origin HEAD refs/tags/${TAG}"
    echo "  gh release create ${TAG} --title ${TAG} --generate-notes ${ARCHIVE} ${SRC_ARCHIVE}"
    exit 0
fi

if ! command -v gh >/dev/null 2>&1; then
    echo "✗ gh is not installed; tag is local only" >&2
    echo "  install GitHub CLI, then: git push --atomic origin HEAD refs/tags/${TAG}" >&2
    exit 1
fi

echo "› push branch and ${TAG}"
git push --atomic origin HEAD "refs/tags/${TAG}:refs/tags/${TAG}"

echo "› gh release ${TAG}"
gh release create "$TAG" \
    --repo "$REPO_SLUG" \
    --title "$TAG" \
    --generate-notes \
    "$ARCHIVE" \
    "$SRC_ARCHIVE"

echo
echo "Released ${TAG}"
echo "  ${TAG_URL}"
echo "  ${ASSET_URL}"
