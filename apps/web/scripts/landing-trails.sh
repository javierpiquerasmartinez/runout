#!/usr/bin/env bash
# Re-encodes the landing's source clip into the scrubbable assets in apps/web/public.
#
#   bash apps/web/scripts/landing-trails.sh path/to/source.mp4
#
# The source is the 20 s, 1280x720, 24 fps clip (H.264 + AAC) that used to sit at
# apps/web/public/video.mp4; it is kept out of git. The landing seeks the video on
# every scroll frame, so both renditions get a keyframe every 6 frames (0.25 s),
# no audio track, and the MP4 its index at the front.
set -euo pipefail

SRC="${1:?usage: landing-trails.sh <source.mp4>}"
OUT="$(cd "$(dirname "$0")/../public" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
PASSLOG="$WORK/vp9"

# H.264 fallback: closed GOP of 6, no B-frames, no scene-cut keyframes, faststart.
ffmpeg -y -v error -i "$SRC" -an \
  -c:v libx264 -preset slow -crf 23 -maxrate 2M -bufsize 4M -pix_fmt yuv420p \
  -vf scale=1280:720 -r 24 \
  -g 6 -keyint_min 6 -sc_threshold 0 -bf 0 \
  -movflags +faststart \
  "$OUT/landing-trails.mp4"

# VP9 (two-pass, constrained quality): keyframe every 6 frames.
VP9=(-an -c:v libvpx-vp9 -crf 36 -b:v 1500k -maxrate 2M -pix_fmt yuv420p
  -vf scale=1280:720 -r 24 -g 6 -keyint_min 6 -row-mt 1 -deadline good -cpu-used 2
  -passlogfile "$PASSLOG")
ffmpeg -y -v error -i "$SRC" "${VP9[@]}" -pass 1 -f null /dev/null
ffmpeg -y -v error -i "$SRC" "${VP9[@]}" -pass 2 "$OUT/landing-trails.webm"

# Stills: the first frame (poster) and the last frame (the settled, lit table).
ffmpeg -y -v error -i "$SRC" -frames:v 1 -vf scale=1280:720 -q:v 3 \
  "$OUT/landing-trails-poster.jpg"
ffmpeg -y -v error -sseof -0.5 -i "$SRC" -update 1 -vf scale=1280:720 -q:v 3 \
  "$OUT/landing-trails-table.jpg"
