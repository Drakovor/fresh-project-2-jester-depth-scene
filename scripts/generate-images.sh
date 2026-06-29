#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE_GEN="${CODEX_HOME:-$HOME/.codex}/skills/.system/imagegen/scripts/image_gen.py"

cd "$ROOT"

if [ ! -f ".env.local" ]; then
  echo ".env.local is missing"
  exit 1
fi

set -a
. ./.env.local
set +a

mkdir -p output/imagegen public/assets tmp/imagegen

.venv/bin/python "$IMAGE_GEN" generate \
  --model gpt-image-2 \
  --prompt-file prompts/layer-background.md \
  --quality high \
  --size 3840x2160 \
  --out output/imagegen/jester-depth-background-4k.png \
  --force

.venv/bin/python "$IMAGE_GEN" generate \
  --model gpt-image-2 \
  --prompt-file prompts/layer-character-chroma.md \
  --quality high \
  --size 2160x3840 \
  --out tmp/imagegen/jester-character-chroma-source.png \
  --force

.venv/bin/python "${CODEX_HOME:-$HOME/.codex}/skills/.system/imagegen/scripts/remove_chroma_key.py" \
  --input tmp/imagegen/jester-character-chroma-source.png \
  --out output/imagegen/jester-feminine-character.png \
  --auto-key border \
  --soft-matte \
  --transparent-threshold 12 \
  --opaque-threshold 220 \
  --despill

.venv/bin/python "$IMAGE_GEN" generate \
  --model gpt-image-2 \
  --prompt-file prompts/layer-foreground.md \
  --quality high \
  --size 3840x2160 \
  --out output/imagegen/jester-depth-foreground-4k.png \
  --force

cp output/imagegen/jester-depth-background-4k.png public/assets/jester-depth-background-4k.png
cp output/imagegen/jester-feminine-character.png public/assets/jester-feminine-character.png
cp output/imagegen/jester-depth-foreground-4k.png public/assets/jester-depth-foreground-4k.png

echo "Generated layered assets in public/assets"
