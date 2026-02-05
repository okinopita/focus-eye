#!/bin/bash
# 絵文字からトレイアイコンを生成

ASSETS_DIR="./assets/tray"
mkdir -p "$ASSETS_DIR"

# 方法 1: SF Symbols を使用 (macOS組み込み)
# eyes.fill が最も近い
echo "トレイアイコンを生成中..."

# 只今はプレースホルダーテキストファイルを作成 - 実際の画像は手動で置き換えてください
cat > "$ASSETS_DIR/README.md" << 'EOF'
# Tray Icon Assets

## Required Files:
- eye-open.png (16x16)
- eye-open@2x.png (32x32)
- eye-closed.png (16x16)
- eye-closed@2x.png (32x32)

## How to create:

### Option 1: Using Figma/Sketch/Photopea
1. Open https://www.photopea.com
2. New Project: 32x32px
3. Text tool → Insert 👀 emoji
4. Resize to fit
5. Export as PNG (32x32 for @2x, 16x16 for normal)
6. Repeat for closed eyes (use — or ·· )

### Option 2: Using online emoji converter
1. Go to https://emoji.gg or similar
2. Search for "eyes" 👀
3. Download PNG
4. Resize using https://www.iloveimg.com/resize-image

### Option 3: macOS SF Symbols (best quality)
1. Open SF Symbols app (download from Apple)
2. Search "eyes"
3. Export as PNG in different sizes

### Animation frames:
- Frame 1: eye-open (normal 👀)
- Frame 2: eye-closed (blinking)

Blinking pattern: open → closed (100ms) → open (2000ms) → repeat
EOF

echo "Created README in $ASSETS_DIR"
echo "Please add icon files manually using one of the methods above."
