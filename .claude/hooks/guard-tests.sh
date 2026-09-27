#!/usr/bin/env bash
# PreToolUse hook: stop Claude from editing test files
FILE_PATH=$(jq -r '.tool_input.file_path // empty')
FILE_PATH="${FILE_PATH//\\//}"   # Windows paths arrive with backslashes

case "$FILE_PATH" in
  *.test.* | *.spec.* | *_test.go | */tests/* | */__tests__/*)
    echo "blocked: tests are the spec. Ask the human to change them." >&2
    exit 2 ;;
esac
exit 0
