#!/bin/sh
# Озвучивает все пароли из levels.js в audio/<пароль>.m4a: нейроголос Edge (Dmitry) через один из двух
# робот-фильтров. Фильтр выбирается по хешу слова, чтобы голос не приедался, но слово звучало всегда одинаково.
# Нужны uvx (edge-tts и статический ffmpeg ставятся сами) и сеть. Уже записанные пропускает;
# перезаписать всё после смены голоса или фильтра: rm audio/*.m4a. edge-tts иногда срывается, тогда
# просто запустить ещё раз: допишет недостающие.
cd "$(dirname "$0")/.." || exit 1
mkdir -p audio
VOICE=ru-RU-DmitryNeural
RATE=-10%
# Металл дают короткие эхо 4–9 мс (гребенчатый фильтр) и подъём на 2,5–3 кГц; кольцевая модуляция — лёгкая,
# иначе слова не разобрать.
ROBOT_A="aformat=channel_layouts=mono:sample_rates=44100,asplit[d][w];[w]aeval=val(0)*sin(2*PI*50*t)[r];[d][r]amix=inputs=2:weights=1 0.45,aecho=0.9:0.7:6:0.55,equalizer=f=2500:t=q:w=1.2:g=6,highpass=f=200,lowpass=f=5500,volume=1.8"
ROBOT_B="aformat=channel_layouts=mono:sample_rates=44100,asplit[d][w];[w]aeval=val(0)*sin(2*PI*80*t)[r];[d][r]amix=inputs=2:weights=1 0.65,aecho=0.9:0.8:4|9:0.45|0.35,equalizer=f=3000:t=q:w=1:g=5,highpass=f=220,lowpass=f=5000,volume=1.8"
FFMPEG=$(uvx --from imageio-ffmpeg python -c 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())') || exit 1
tmp=$(mktemp -d)
node -e 'import("./levels.js").then(m => console.log([...new Set(m.LEVELS.flat())].join("\n")))' |
while IFS= read -r word; do
  out="audio/$word.m4a"
  [ -f "$out" ] && continue
  if [ $(( $(printf '%s' "$word" | cksum | cut -d' ' -f1) % 2 )) -eq 0 ]; then filter=$ROBOT_A; else filter=$ROBOT_B; fi
  if uvx edge-tts -v "$VOICE" --rate="$RATE" -t "$word" --write-media "$tmp/w.mp3" >/dev/null 2>&1 &&
     "$FFMPEG" -y -loglevel error -i "$tmp/w.mp3" -filter_complex "$filter" "$out"; then echo "$out"
  else echo "FAIL $word" >&2; echo "$word" >> "$tmp/failed"; fi
done
status=0; [ -s "$tmp/failed" ] && status=1
rm -rf "$tmp"
exit $status
