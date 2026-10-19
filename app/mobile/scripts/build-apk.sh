#!/usr/bin/env bash
# 构建 mobile-app 的 Android APK（arm64）。
#
# 为什么不用 `pnpm tauri android build`：
#   Tauri CLI 的 gradle 回连机制（android-studio-script WebSocket）在本机存在
#   ConnectionRefused 假死问题（release 路径必现），因此改为手动驱动：
#   前端构建 → cargo 交叉编译 → so 放入 jniLibs → gradle 打包（排除 rust 任务）。
#   若未来 CLI 修复，可回退标准命令。
#
# 用法：
#   ./scripts/build-apk.sh           # release（正式签名，需 gen/android/keystore.properties + yunfeng-release.jks）
#   ./scripts/build-apk.sh debug     # debug（自动 debug 签名）
#
# 环境要求：ANDROID_HOME、NDK_HOME、JAVA_HOME（Android Studio JBR）按需调整下方默认值。

set -euo pipefail

MODE="${1:-release}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SDK="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
NDK="${NDK_HOME:-$SDK/ndk/30.0.14904198}"
JAVA="${JAVA_HOME:-/Applications/Android Studio.app/Contents/jbr/Contents/Home}"
TARGET="aarch64-linux-android"

export ANDROID_HOME="$SDK" NDK_HOME="$NDK" JAVA_HOME="$JAVA"
export PATH="$NDK/toolchains/llvm/prebuilt/darwin-x86_64/bin:$PATH"
export CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER="$NDK/toolchains/llvm/prebuilt/darwin-x86_64/bin/aarch64-linux-android24-clang"
export CARGO_TARGET_AARCH64_LINUX_ANDROID_RUSTFLAGS="-Clink-arg=-landroid -Clink-arg=-llog -Clink-arg=-lOpenSLES"
export WRY_ANDROID_PACKAGE=com.yunfeng.desktop WRY_ANDROID_LIBRARY=app_lib
export WRY_ANDROID_KOTLIN_FILES_OUT_DIR="$ROOT/src-tauri/gen/android/app/src/main/java/com/yunfeng/desktop/generated"

# 1. 前端构建（dist 会被 tauri codegen 嵌入 so）
(cd "$ROOT" && pnpm build)

# 2. Rust 交叉编译
CARGO_PROFILE=("--release")
GRADLE_TASK="assembleArm64Release"
GRADLE_SKIP="rustBuildArm64Release"
if [ "$MODE" = "debug" ]; then
  CARGO_PROFILE=()
  GRADLE_TASK="assembleArm64Debug"
  GRADLE_SKIP="rustBuildArm64Debug"
fi
(cd "$ROOT/src-tauri" && cargo build "${CARGO_PROFILE[@]}" --target "$TARGET")

# 3. so 放入 jniLibs（gitignore 内的生成物路径）
JNI_DIR="$ROOT/src-tauri/gen/android/app/src/main/jniLibs/arm64-v8a"
mkdir -p "$JNI_DIR"
PROFILE=$([ "$MODE" = "debug" ] && echo debug || echo release)
cp -f "$ROOT/src-tauri/target/$TARGET/$PROFILE/libapp_lib.so" "$JNI_DIR/libapp_lib.so"

# 4. Gradle 打包（排除 rust 任务，规避 WS 回连）
(
  cd "$ROOT/src-tauri/gen/android"
  JAVA_HOME="$JAVA" ./gradlew "$GRADLE_TASK" -x "$GRADLE_SKIP" --console=plain
)

# 5. 指出产物
if [ "$MODE" = "debug" ]; then
  APK="$ROOT/src-tauri/gen/android/app/build/outputs/apk/arm64/debug/app-arm64-debug.apk"
else
  APK="$ROOT/src-tauri/gen/android/app/build/outputs/apk/arm64/release/app-arm64-release.apk"
fi
echo "APK: $APK"
ls -lh "$APK"
