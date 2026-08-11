#!/bin/bash
# vexp-hint: event-driven orientation hint (UserPromptSubmit). Fails open.
VEXP_BIN="/Users/christ/.vscode/extensions/vexp.vexp-vscode-2.5.0-darwin-arm64/binaries/vexp-core-darwin-arm64/vexp-core"
[ -x "$VEXP_BIN" ] || exit 0
"$VEXP_BIN" prompt-hint 2>/dev/null
exit 0
