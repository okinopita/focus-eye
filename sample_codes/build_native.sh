#!/usr/bin/env zsh
# Build script for the Objective-C helper on macOS
# Usage: cd sample_codes && ./build_native.sh

set -euo pipefail

SRC="get_frontmost_app.m"
OUT="get_frontmost_app"

clang -fobjc-arc -framework AppKit -framework CoreGraphics -o "$OUT" "$SRC"
echo "Built: $OUT"
