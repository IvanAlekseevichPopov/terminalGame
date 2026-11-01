#!/usr/bin/env python3
# Синтезирует звуки сценок (NES: квадрат, треугольник, шум) в audio/sfx/<имя>.m4a.
# Запуск из любого места: python3 tools/sfx.py. Нужны numpy и uvx: статический ffmpeg берётся
# из imageio-ffmpeg, как в tools/voice.sh (системный на этой машине сломан).
# Результат детерминированный, файлы каждый раз перезаписываются. Прослушать: tools/sfx-test.html.
import os
import subprocess
import sys
import tempfile
import wave

import numpy as np

SR = 44100
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'audio', 'sfx')
rng = np.random.default_rng(1977)


def t_of(sec):
    return np.arange(int(round(sec * SR))) / SR


def phase(freq):
    f = np.broadcast_to(np.asarray(freq, float), np.shape(freq) or (1,))
    return np.cumsum(f / SR) % 1.0, f / SR


def blep(p, dt):
    out = np.zeros_like(p)
    a = p < dt
    x = p[a] / dt[a]
    out[a] = 2 * x - x * x - 1
    b = p > 1 - dt
    x = (p[b] - 1) / dt[b]
    out[b] = x * x + 2 * x + 1
    return out


def square(freq, duty=0.5):
    # PolyBLEP против алиасинга на высоких нотах; сдвиг на (1 - 2*duty) убирает постоянную составляющую.
    p, dt = phase(freq)
    s = np.where(p < duty, 1.0, -1.0) + blep(p, dt) - blep((p - duty) % 1.0, dt)
    return s - (2 * duty - 1)


def triangle(freq):
    p, _ = phase(freq)
    return 4 * np.abs(p - 0.5) - 1


def noise(n, rate):
    # Шум NES: случайный уровень держится 1/rate секунды, rate задаёт «высоту» шума.
    hold = max(1, int(SR / rate))
    v = rng.choice([-1.0, 1.0], size=n // hold + 1)
    return np.repeat(v, hold)[:n]


def env(n, attack, tau=None, release=0.004):
    t = np.arange(n) / SR
    e = np.minimum(1.0, t / attack) if attack > 0 else np.ones(n)
    if tau:
        e = e * np.exp(-t / tau)
    r = int(release * SR)
    if r:
        e[-r:] *= np.linspace(1, 0, r)
    return e


def glide(n, f0, f1):
    return f0 * (f1 / f0) ** np.linspace(0, 1, n)


def place(total, *parts):
    out = np.zeros(int(round(total * SR)))
    for start, sig in parts:
        i = int(round(start * SR))
        j = min(len(out), i + len(sig))
        out[i:j] += sig[: j - i]
    return out


def win_open():
    t = t_of(0.28)
    n = len(t)
    f = glide(n, 110, 1500)
    s = square(f, 0.125) * 0.6 + triangle(f / 2) * 0.5 + noise(n, 9000) * 0.06
    e = np.minimum(1, t / 0.01) * (0.55 + 0.45 * t / t[-1])
    e[-int(0.05 * SR):] *= np.linspace(1, 0, int(0.05 * SR)) ** 2
    return s * e


def win_close():
    t = t_of(0.18)
    n = len(t)
    f = glide(n, 1500, 110)
    s = square(f, 0.125) * 0.6 + triangle(f / 2) * 0.5
    return s * env(n, 0.003, 0.07)


def tick(k):
    n = int(0.025 * SR)
    f = 2600 * k
    s = square(np.full(n, f), 0.25) * env(n, 0.0005, 0.004) + noise(n, 16000 * k) * env(n, 0.0003, 0.002) * 0.5
    return s


def chirp(step):
    semis = [0, 2, 4, 7, 9][step]
    f = 784 * 2 ** (semis / 12)
    a = int(0.035 * SR)
    b = int(0.045 * SR)
    s1 = square(np.full(a, f), 0.25) * env(a, 0.001, 0.05, 0.002)
    s2 = square(np.full(b, f * 1.5), 0.25) * env(b, 0.001, 0.02)
    return np.concatenate([s1, s2])


def chord():
    n = int(0.45 * SR)
    s = sum(square(np.full(n, f), 0.25) for f in (523.25, 659.25, 783.99, 1046.5)) * 0.3
    s += triangle(np.full(n, 261.63)) * 0.7
    return s * env(n, 0.002, 0.13)


def bar_rise():
    t = t_of(1.6)
    n = len(t)
    f = glide(n, 196, 784) * (1 + 0.004 * np.sin(2 * np.pi * 6 * t))
    s = triangle(f) * 0.8 + square(f, 0.125) * 0.25
    e = np.minimum(1, t / 0.03)
    r = int(0.06 * SR)
    e[-r:] *= np.cos(np.linspace(0, np.pi / 2, r)) ** 2
    return s * e


def ding():
    n = int(0.3 * SR)
    f = 1318.5
    s = triangle(np.full(n, f)) * 0.8 + square(np.full(n, f * 2), 0.5) * 0.15 * env(n, 0, 0.03, 0)
    return s * env(n, 0.001, 0.08)


def drop(k):
    n = int(0.06 * SR)
    f = glide(n, 450 * k, 1500 * k)
    return triangle(f) * env(n, 0.001, 0.016)


def key(k):
    n = int(0.035 * SR)
    click = noise(n, 11000 * k) * env(n, 0.0003, 0.003)
    thump = triangle(glide(n, 190 * k, 70 * k)) * env(n, 0.001, 0.012) * 0.8
    return click + thump


def carriage():
    bn = int(0.22 * SR)
    bell = (triangle(np.full(bn, 2093)) * 0.7 + square(np.full(bn, 4186), 0.5) * 0.1) * env(bn, 0.001, 0.06)
    rn = int(0.24 * SR)
    rt = np.arange(rn) / SR
    ratchet = (0.5 + 0.5 * np.sign(np.sin(2 * np.pi * (45 * rt + 30 * rt * rt)))) ** 2
    slide = noise(rn, 5000) * ratchet * env(rn, 0.01, 0.12) * 0.45
    slide += triangle(glide(rn, 120, 90)) * env(rn, 0.005, 0.06) * 0.25
    return place(0.35, (0, bell), (0.11, slide))


def boom():
    # Взрыв ворот в конце уровня: самый громкий звук в игре (просьба ребёнка): удар шумом с падением высоты.
    n = int(0.7 * SR)
    t = np.arange(n) / SR
    rumble = noise(n, 900) * np.exp(-t / 0.18)
    crack = noise(n, 14000) * np.exp(-t / 0.03) * 1.2
    thump = triangle(glide(n, 160, 35)) * np.exp(-t / 0.22) * 1.4
    return (rumble + crack + thump) * env(n, 0.001, None, 0.05)


def fanfare():
    # Фанфара открытия уровня: четыре ноты вверх и аккорд, длиннее обычного «доступа».
    notes = [(523.25, 0.0, 0.14), (659.25, 0.14, 0.14), (783.99, 0.28, 0.14), (1046.5, 0.42, 0.5)]
    parts = []
    for f, start, dur in notes:
        n = int(dur * SR)
        parts.append((start, (square(np.full(n, f), 0.25) + triangle(np.full(n, f / 2)) * 0.6) * env(n, 0.002, 0.25)))
    cn = int(0.5 * SR)
    chordv = sum(square(np.full(cn, f), 0.5) for f in (523.25, 659.25, 783.99)) * 0.25 * env(cn, 0.002, 0.2)
    parts.append((0.42, chordv))
    return place(0.95, *parts)


def access():
    a = int(0.09 * SR)
    b = int(0.16 * SR)
    s1 = square(np.full(a, 660)) * env(a, 0.001, 0.05, 0.002)
    s2 = square(np.full(b, 990)) * env(b, 0.001, 0.05)
    return np.concatenate([s1, s2])


# Громкость — RMS в dBFS: у квадратной волны RMS почти равен пику, поэтому по пику она звучала бы громче
# голоса (у голоса RMS около -25). Щелчки тише тональных. Пик в любом случае не выше PEAK_MAX.
SOUNDS = {
    'win-open': (win_open, -33),
    'win-close': (win_close, -33),
    'tick': (lambda: tick(1.0), -38),
    'tick2': (lambda: tick(1.12), -38),
    'tick3': (lambda: tick(0.89), -38),
    **{f'chirp{i + 1}': ((lambda i=i: chirp(i)), -34) for i in range(5)},
    'chord': (chord, -31),
    'bar-rise': (bar_rise, -35),
    'ding': (ding, -32),
    'drop': (lambda: drop(1.0), -35),
    'drop2': (lambda: drop(0.84), -35),
    'drop3': (lambda: drop(1.19), -35),
    'key': (lambda: key(1.0), -35),
    'key2': (lambda: key(0.9), -35),
    'key3': (lambda: key(1.12), -35),
    'carriage': (carriage, -33),
    'access': (access, -32),
    'boom': (boom, -24),
    'fanfare': (fanfare, -29),
}


PEAK_MAX = -13  # AAC добавляет до 1–2 дБ к пику на фронтах квадрата


def finish(x, rms_db):
    x = x - np.mean(x)
    idx = np.flatnonzero(np.abs(x) > np.max(np.abs(x)) * 10 ** (-60 / 20))
    x = x[idx[0]: idx[-1] + 1]
    f = min(len(x) // 4, int(0.002 * SR))
    x[-f:] *= np.linspace(1, 0, f)
    x = x / np.sqrt(np.mean(x * x)) * 10 ** (rms_db / 20)
    return x * min(1.0, 10 ** (PEAK_MAX / 20) / np.max(np.abs(x)))


def ffmpeg_exe():
    return subprocess.check_output(
        ['uvx', '--from', 'imageio-ffmpeg', 'python', '-c',
         'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())'], text=True).strip()


def main():
    os.makedirs(OUT, exist_ok=True)
    ff = ffmpeg_exe()
    with tempfile.TemporaryDirectory() as tmp:
        for name, (make, rms) in SOUNDS.items():
            x = finish(make(), rms)
            wav = os.path.join(tmp, name + '.wav')
            with wave.open(wav, 'wb') as w:
                w.setnchannels(1)
                w.setsampwidth(2)
                w.setframerate(SR)
                w.writeframes((x * 32767).round().astype('<i2').tobytes())
            out = os.path.join(OUT, name + '.m4a')
            subprocess.run([ff, '-y', '-loglevel', 'error', '-i', wav, '-c:a', 'aac', '-b:a', '96k',
                            '-map_metadata', '-1', '-fflags', '+bitexact', out], check=True)
            peak = 20 * np.log10(np.max(np.abs(x)))
            print(f'{name:10s} {len(x) / SR * 1000:6.0f} ms  peak {peak:5.1f} dBFS')


if __name__ == '__main__':
    sys.exit(main())
