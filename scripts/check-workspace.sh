#!/bin/sh
# Run from the new product repository before editing, installing, or building.
set -eu

fail() {
    printf 'Workspace guard failed: %s\n' "$1" >&2
    exit 1
}

actual_root=$(pwd -P) || fail 'Cannot resolve the current working directory.'
marker="$actual_root/.hacker-kit-root"
[ -f "$marker" ] && [ ! -L "$marker" ] ||
    fail 'Missing regular .hacker-kit-root. Run from the bootstrapped product repository.'
expected_root=$(cat "$marker") || fail 'Cannot read .hacker-kit-root.'
[ "$actual_root" = "$expected_root" ] ||
    fail "Current directory is $actual_root; required repository is $expected_root. Set explicit workdir/cwd."

guard_directory=$(CDPATH= cd -P "$(dirname "$0")" && pwd -P) ||
    fail 'Cannot resolve the guard script location.'
[ "$guard_directory" = "$actual_root/scripts" ] ||
    fail 'Run the guard copied into this product repository, not the hacker-kit source guard.'

[ -d "$actual_root/.git" ] && [ ! -L "$actual_root/.git" ] ||
    fail '.git must be this independent repository’s own directory, not a linked worktree or symlink.'
[ ! -e "$actual_root/.git/commondir" ] ||
    fail 'This repository must not share another repository’s Git directory.'

# Ignore inherited Git redirection when inspecting the actual current directory.
unset GIT_DIR GIT_WORK_TREE GIT_COMMON_DIR GIT_INDEX_FILE GIT_CEILING_DIRECTORIES
unset GIT_OBJECT_DIRECTORY GIT_ALTERNATE_OBJECT_DIRECTORIES
unset GIT_CONFIG_COUNT GIT_CONFIG_PARAMETERS
git_root=$(git rev-parse --show-toplevel 2>/dev/null) ||
    fail 'Current directory is not a Git working tree.'
git_directory=$(git rev-parse --absolute-git-dir 2>/dev/null) ||
    fail 'Cannot resolve the Git directory.'
[ "$git_root" = "$expected_root" ] ||
    fail "Git root is $git_root; required repository is $expected_root."
[ "$git_directory" = "$expected_root/.git" ] ||
    fail 'Git metadata belongs to another directory.'

printf 'Workspace verified: %s\n' "$actual_root"
