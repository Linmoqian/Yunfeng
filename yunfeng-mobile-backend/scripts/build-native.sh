#!/usr/bin/env bash
# 编译远程桌面输入注入 helper → bin/yf-input（需要 Xcode Command Line Tools）。
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p bin
CACHE="${SWIFT_MODULE_CACHE:-/tmp/swift-module-cache}"
mkdir -p "$CACHE"
swiftc -O -module-cache-path "$CACHE" native/RemoteInput.swift -o bin/yf-input
echo "已生成 bin/yf-input"
