#!/usr/bin/env sh
set -eu

# Rejects two comment styles across the TypeScript and JavaScript we own:
#
#   1. Decorative separator comments, a comment whose content is a run of rule
#      characters such as a line of dashes or equals under a heading.
#   2. Trailing inline comments, a line comment that follows code on the same
#      line. A comment belongs on its own line above the code it describes.
#
# Full-line comments, doc comments, the `://` in a URL, a `//` inside a string
# or regular-expression literal, and inline tool directives (eslint, prettier,
# @ts-, SPDX) are left alone.
#
# packages/ui is excluded: its ABIs and registration flow are tracked upstream
# in paritytech/dotns and it is not cleaned to this rule yet. Pass explicit file
# paths as arguments to check them directly; with no arguments the staged files
# are checked.

SEPARATOR_PATTERN='^[[:space:]]*(//+|/\*|\*|#)[[:space:]]*[-=*_~#]{6,}|^[[:space:]]*/{6,}[[:space:]]*$'
TRAILING_PATTERN="^[[:space:]]*[^/*[:space:]].*[^:/'\"\\\\]//([^/]|\$)"
DIRECTIVE_ALLOW='//[[:space:]]*(eslint|prettier|@ts-|ts-node|SPDX)'

is_checkable() {
  case "$1" in
    packages/ui/* | */node_modules/* | */abis/* | */.cdm/* | */dist/*) return 1 ;;
    *.ts | *.tsx | *.js | *.mjs | *.cjs) return 0 ;;
    *) return 1 ;;
  esac
}

collect_targets() {
  if [ "$#" -gt 0 ]; then
    printf '%s\n' "$@"
  else
    git diff --cached --name-only --diff-filter=ACM
  fi
}

status=0
for file in $(collect_targets "$@"); do
  [ -f "$file" ] || continue
  is_checkable "$file" || continue

  separators="$(grep -nE "$SEPARATOR_PATTERN" "$file" 2>/dev/null || true)"
  if [ -n "$separators" ]; then
    echo "$file: decorative separator comment (put words in the comment, not a rule)" >&2
    printf '%s\n' "$separators" | sed 's/^/  /' >&2
    status=1
  fi

  trailing="$(grep -nE "$TRAILING_PATTERN" "$file" 2>/dev/null | grep -vE "$DIRECTIVE_ALLOW" 2>/dev/null || true)"
  if [ -n "$trailing" ]; then
    echo "$file: trailing inline comment (move it to its own line above the code)" >&2
    printf '%s\n' "$trailing" | sed 's/^/  /' >&2
    status=1
  fi
done

exit "$status"
