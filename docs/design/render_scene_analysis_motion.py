#!/usr/bin/env python3
"""Render the DearShot scene-analysis motion concept as an animated GIF.

This is a review asset for Figma. The production Android implementation should
recreate the same states with Compose animations rather than ship the GIF.
"""

from __future__ import annotations

import base64
import math
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, "/tmp/dearshot_pydeps")

import cairosvg  # type: ignore
from PIL import Image  # type: ignore

SOURCE = ROOT / "scene-analysis-premium.svg"
OUTPUT = ROOT / "scene-analysis-motion.gif"
PREVIEW = ROOT / "scene-analysis-motion-final.png"
FRAMES = ROOT / ".scene-analysis-motion-frames"

W, H = 390, 844
FPS = 8
DURATION = 6.0


def clamp(v: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, v))


def ease_out(v: float) -> float:
    v = clamp(v)
    return 1 - (1 - v) ** 3


def ease_in_out(v: float) -> float:
    v = clamp(v)
    return 0.5 - math.cos(math.pi * v) / 2


def span(t: float, start: float, end: float, easing=ease_out) -> float:
    return easing((t - start) / (end - start))


def photo_definition() -> str:
    src = SOURCE.read_text(encoding="utf-8")
    found = re.search(r'<image id="photo".*?/>', src, flags=re.S)
    if not found:
        raise RuntimeError("Could not find embedded camera photo")
    return found.group(0)


PHOTO = photo_definition()


def chip(x: int, y: int, width: int, text: str, dot: str, alpha: float, dy: float) -> str:
    return f'''
    <g opacity="{alpha:.3f}" transform="translate(0 {dy:.2f})">
      <rect x="{x}" y="{y}" width="{width}" height="30" rx="15" fill="#152126" fill-opacity=".82" stroke="#FFFFFF" stroke-opacity=".22"/>
      <circle cx="{x + 15}" cy="{y + 15}" r="3" fill="{dot}"/>
      <text x="{x + 25}" y="{y + 19}" class="chip">{text}</text>
    </g>'''


def frame_svg(t: float) -> str:
    enter = span(t, 0.0, 0.35)
    mesh = span(t, 0.45, 1.35) * (1 - 0.90 * span(t, 4.0, 4.65))
    segmentation = span(t, 0.35, 1.15) * (1 - 0.72 * span(t, 4.0, 4.65))
    subject = span(t, 2.05, 2.75) * (1 - 0.82 * span(t, 4.1, 4.7))
    location = span(t, 3.0, 3.5)
    guide = span(t, 4.05, 4.75)
    complete = span(t, 4.75, 5.35)
    analysis = 1 - complete

    # The scanner deliberately sweeps down, back up, and then settles near the
    # subject. The reversal makes the analysis feel like a live camera pass
    # instead of a decorative loading line.
    if t < 1.55:
        scan_y = 150 + 350 * ease_in_out(clamp((t - 0.30) / 1.25))
    elif t < 2.72:
        scan_y = 500 - 310 * ease_in_out((t - 1.55) / 1.17)
    else:
        scan_y = 190 + 230 * ease_in_out(clamp((t - 2.72) / 0.92))
    scan_alpha = span(t, 0.18, 0.55) * (1 - span(t, 3.58, 3.95))
    scan_progress = round(8 + 84 * span(t, 0.25, 3.55, ease_in_out))
    pulse = 1.0 + 0.08 * math.sin(max(0.0, t - 1.9) * math.pi * 2)
    if location > 0.62:
        pill_text = "바닷가를 찾았어요"
    elif t < 1.55:
        pill_text = f"장면을 스캔하는 중 · {scan_progress}%"
    elif t < 2.72:
        pill_text = "인물과 수평선을 다시 확인 중"
    else:
        pill_text = "구도 후보를 비교하는 중"

    clue_exit = 1 - span(t, 4.0, 4.6)
    clues = [
        (22, 170, 84, "맑은 하늘", "#75D7E2", span(t, 0.9, 1.25) * clue_exit),
        (265, 207, 103, "측면광 감지", "#E66548", span(t, 1.3, 1.65) * clue_exit),
        (24, 383, 72, "수평선", "#63B7B1", span(t, 1.7, 2.05) * clue_exit),
        (282, 443, 86, "인물 1명", "#FFD29E", span(t, 2.1, 2.45) * clue_exit),
    ]
    clue_markup = "".join(chip(x, y, w, label, color, a, 10 * (1 - a)) for x, y, w, label, color, a in clues)

    if t < 1.35:
        status_title = "장면의 단서를 모으고 있어요"
        status_sub = "빛, 배경, 인물의 위치를 함께 살펴봐요"
        progress = 0.20 + 0.24 * span(t, 0.0, 1.35)
        active = 0
    elif t < 3.1:
        status_title = "바닷가의 빛과 분위기를 읽는 중"
        status_sub = "사진에 어울리는 분위기와 여백을 찾고 있어요"
        progress = 0.44 + 0.30 * span(t, 1.35, 3.1)
        active = 1
    elif t < 4.75:
        status_title = "어울리는 구도를 맞추고 있어요"
        status_sub = "인물, 수평선, 빛의 방향을 함께 비교해요"
        progress = 0.74 + 0.24 * span(t, 3.1, 4.75)
        active = 2
    else:
        status_title = "바람을 느끼는 순간"
        status_sub = "인물을 왼쪽 1/3에 두고 바다 여백을 살려보세요"
        progress = 1.0
        active = 3

    stages = ["장면 감지", "분위기 분석", "구도 매칭"]
    xs = [54, 195, 336]
    rail = 54 + 282 * progress
    stage_markup = [f'<path d="M54 650H336" stroke="#D9D0C4" stroke-width="2"/>',
                    f'<path d="M54 650H{rail:.1f}" stroke="#BC5037" stroke-width="2" stroke-linecap="round"/>']
    for i, (x, label) in enumerate(zip(xs, stages)):
        done = progress >= [0.33, 0.66, 0.97][i]
        current = (active == i) or (active == 3 and i == 2)
        fill = "#BC5037" if done else "#F6F2EA"
        stroke = "#BC5037" if done or current else "#CFC5B9"
        stage_markup.append(f'<circle cx="{x}" cy="650" r="{9 if current else 8}" fill="{fill}" stroke="{stroke}" stroke-width="2"/>')
        if done:
            stage_markup.append(f'<path d="M{x-4} 650l3 3 6-7" fill="none" stroke="#FFFFFF" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>')
        elif current:
            stage_markup.append(f'<circle cx="{x}" cy="650" r="3" fill="#BC5037"/>')
        color = "#BC5037" if current else ("#706C64" if done else "#9A938A")
        weight = 700 if current else 600
        stage_markup.append(f'<text x="{x}" y="677" text-anchor="middle" font-size="10.5" font-weight="{weight}" fill="{color}">{label}</text>')

    final_badge = f'''
      <g opacity="{complete:.3f}" transform="translate(0 {8*(1-complete):.2f})">
        <rect x="271" y="570" width="83" height="28" rx="14" fill="#BC5037"/>
        <text x="312.5" y="588" text-anchor="middle" font-size="10.5" font-weight="700" fill="#FFFFFF">추천 준비 완료</text>
      </g>'''

    guide_opacity = guide * (0.88 + 0.12 * math.sin(t * math.pi * 2))
    guide_markup = f'''
      <g opacity="{guide_opacity:.3f}">
        <path d="M130 154V548M260 154V548M24 285H366M24 417H366" stroke="#FFFFFF" stroke-opacity=".38" stroke-width="1" stroke-dasharray="5 6"/>
        <path d="M142 281C133 270 133 247 145 236C157 225 174 232 178 246C181 259 174 271 163 277L165 286 180 293 199 273 213 282 188 317 173 307 175 369 169 455 178 526 158 530 149 454 140 528 121 527 128 445 127 370 111 397 100 389 111 344 126 300Z" fill="#FFFFFF" fill-opacity=".10" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="151" cy="254" r="46" fill="none" stroke="#FFD5C8" stroke-width="1.5" stroke-dasharray="5 5"/>
        <rect x="95" y="158" width="112" height="26" rx="13" fill="#FFF9F2" fill-opacity=".94"/>
        <text x="151" y="175" text-anchor="middle" font-size="10.5" font-weight="700" fill="#BC5037">왼쪽 1/3에 맞춰요</text>
      </g>'''

    shutter_fill = "#CF553A" if complete > 0.65 else "#DDD3C7"
    shutter_stroke = "#CF553A" if complete > 0.65 else "#C9BCAF"
    controls_opacity = 0.62 + 0.38 * complete

    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="390" height="844" viewBox="0 0 390 844">
<defs>
  {PHOTO}
  <clipPath id="cameraClip"><rect x="0" y="96" width="390" height="452"/></clipPath>
  <linearGradient id="shade" x1="195" y1="96" x2="195" y2="548" gradientUnits="userSpaceOnUse"><stop stop-color="#0B1720" stop-opacity=".07"/><stop offset=".58" stop-color="#0B1720" stop-opacity="0"/><stop offset="1" stop-color="#0B1720" stop-opacity=".42"/></linearGradient>
  <linearGradient id="scan" x1="38" y1="0" x2="352" y2="0" gradientUnits="userSpaceOnUse"><stop stop-color="#75D7E2" stop-opacity="0"/><stop offset=".25" stop-color="#75D7E2"/><stop offset=".5" stop-color="#FFFFFF"/><stop offset=".75" stop-color="#E66548"/><stop offset="1" stop-color="#E66548" stop-opacity="0"/></linearGradient>
  <linearGradient id="scanBand" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#75D7E2" stop-opacity="0"/><stop offset=".46" stop-color="#75D7E2" stop-opacity=".11"/><stop offset=".54" stop-color="#E66548" stop-opacity=".13"/><stop offset="1" stop-color="#E66548" stop-opacity="0"/></linearGradient>
  <linearGradient id="panel" x1="16" y1="560" x2="374" y2="718"><stop stop-color="#FFFCF6"/><stop offset="1" stop-color="#F0E7DA"/></linearGradient>
  <filter id="shadow" x="-30%" y="-30%" width="160%" height="180%"><feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#201D18" flood-opacity=".16"/></filter>
  <filter id="glow" x="-30%" y="-400%" width="160%" height="900%"><feGaussianBlur stdDeviation="6"/></filter>
  <style>
    text {{ font-family: 'Apple SD Gothic Neo', 'Arial Unicode MS', sans-serif; }}
    .chip {{ font-size: 11px; font-weight: 600; fill: #FFFFFF; }}
  </style>
</defs>
<rect width="390" height="844" fill="#F6F2EA"/>
<g opacity="{enter:.3f}">
  <text x="24" y="27" font-size="12" font-weight="600" fill="#282822">9:41</text>
  <path d="M318 24v-4m4 4v-7m4 7v-10" stroke="#282822" stroke-width="2" stroke-linecap="round"/>
  <rect x="338" y="15" width="24" height="11" rx="3" fill="none" stroke="#282822"/>
  <rect x="341" y="18" width="17" height="5" rx="1.5" fill="#282822"/>
  <path d="M25 52 17 64h7l-1 9 9-14h-7z" fill="none" stroke="#282822" stroke-width="1.7"/>
  <text x="195" y="69" font-size="13" font-weight="700" letter-spacing="1.4" text-anchor="middle" fill="#282822">DEARSHOT</text>
  <circle cx="347" cy="58" r="4.5" fill="none" stroke="#282822" stroke-width="1.5"/><path d="M339.5 75v-3.5a7.5 7.5 0 0 1 15 0V75" fill="none" stroke="#282822" stroke-width="1.5"/>
</g>

<g clip-path="url(#cameraClip)" opacity="{enter:.3f}">
  <svg x="0" y="96" width="390" height="452" viewBox="815 96 450 550" preserveAspectRatio="xMidYMid slice"><use href="#photo"/></svg>
  <rect x="0" y="96" width="390" height="452" fill="url(#shade)"/>
  <g opacity="{segmentation:.3f}">
    <path d="M0 96H390V276L344 254 303 272 254 232 211 263 164 216 118 251 75 205 31 238 0 226Z" fill="#72C9E4" fill-opacity=".14"/>
    <path d="M0 354 57 342 107 358 159 345 207 365 258 344 311 361 356 346 390 354V473L344 460 292 476 239 454 190 473 136 455 85 475 38 456 0 467Z" fill="#62B7B3" fill-opacity=".13"/>
    <path d="M0 468 44 456 86 476 136 455 190 474 239 454 292 476 344 460 390 472V548H0Z" fill="#E5A774" fill-opacity=".12"/>
  </g>
  <g opacity="{mesh:.3f}" fill="none" stroke="#FFFFFF" stroke-width="1">
    <path d="M0 164 55 123 105 178 161 121 216 173 276 119 332 172 390 127M0 244 49 198 99 247 155 195 207 249 264 201 320 250 390 197M0 333 58 284 111 336 164 284 221 337 277 287 332 334 390 286M0 423 49 377 102 425 157 377 211 426 265 379 321 427 390 380M0 518 54 472 108 520 162 474 217 521 272 472 329 521 390 475"/>
    <path d="M0 164 49 198 55 123M49 198 99 247 105 178M99 247 155 195 161 121M155 195 207 249 216 173M207 249 264 201 276 119M264 201 320 250 332 172M320 250 390 197M49 377 58 284M102 425 111 336M157 377 164 284M211 426 221 337M265 379 277 287M321 427 332 334"/>
  </g>
  <g opacity="{subject:.3f}" transform="translate(211 254) scale({pulse:.3f}) translate(-211 -254)">
    <path d="M197 270C189 263 189 244 199 235C209 226 224 231 228 243C233 254 228 264 218 270L220 278L234 283L251 264L270 263 242 309 229 301 230 362 224 449 219 536 204 544 205 451 203 402 191 449 183 538 164 546 170 443 174 392 173 365 178 319 164 350 152 388 153 346 176 289 195 278Z" fill="#FFFFFF" fill-opacity=".08" stroke="#FFFFFF" stroke-width="2"/>
    <circle cx="211" cy="254" r="45" fill="none" stroke="#75D7E2" stroke-width="1.3" stroke-dasharray="5 5"/>
  </g>
  <g opacity="{scan_alpha:.3f}" transform="translate(0 {scan_y-333:.2f})">
    <rect x="18" y="299" width="354" height="68" rx="20" fill="url(#scanBand)"/>
    <rect x="34" y="326" width="322" height="16" fill="url(#scan)" opacity=".48" filter="url(#glow)"/>
    <rect x="42" y="333" width="306" height="1.8" rx="1" fill="url(#scan)"/>
    <circle cx="112" cy="334" r="3" fill="#75D7E2" stroke="#FFFFFF" stroke-width="1"/>
    <circle cx="211" cy="334" r="4" fill="#FFFFFF" stroke="#E66548" stroke-width="2"/>
    <circle cx="300" cy="334" r="3" fill="#E66548" stroke="#FFFFFF" stroke-width="1"/>
  </g>
  <g fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round"><path d="M22 142v-22h22M346 120h22v22M22 504v22h22M346 526h22v-22"/></g>
  <g filter="url(#shadow)"><rect x="64" y="112" width="262" height="38" rx="19" fill="#172026" fill-opacity=".9" stroke="#FFFFFF" stroke-opacity=".22"/></g>
  <circle cx="85" cy="131" r="7" fill="none" stroke="{'#E66548' if location > .62 else '#75D7E2'}" stroke-width="2"/>
  <circle cx="85" cy="131" r="2.5" fill="#E66548"/>
  <text x="101" y="136" font-size="11.5" font-weight="600" fill="#FFFFFF">{pill_text}</text>
  {clue_markup}
  {guide_markup}
  <text x="22" y="526" font-size="10" font-weight="600" letter-spacing="1.5" fill="#FFFFFF" fill-opacity=".8">LIVE SCENE MAP</text>
  <text x="366" y="526" text-anchor="end" font-size="10" font-weight="600" letter-spacing="1" fill="#FFFFFF" fill-opacity=".8">{'03 / 03' if location > .7 else '02 / 03'}</text>
</g>

<g opacity="{enter:.3f}">
  <g filter="url(#shadow)"><rect x="16" y="562" width="358" height="156" rx="22" fill="url(#panel)" stroke="#FFFFFF" stroke-opacity=".85"/></g>
  <rect x="176" y="572" width="38" height="4" rx="2" fill="#D3C8BA"/>
  <circle cx="44" cy="598" r="14" fill="#E66548" fill-opacity=".12"/><path d="m38 598 4 4 8-9" fill="none" stroke="#BC5037" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="66" y="596" font-size="15" font-weight="700" fill="#282822">{status_title}</text>
  <text x="66" y="617" font-size="11.5" fill="#706C64">{status_sub}</text>
  {final_badge}
  {''.join(stage_markup)}
  <rect x="31" y="694" width="328" height="1" fill="#E5DDD2"/>
  <circle cx="43" cy="705" r="3" fill="#75B7BE"/><text x="53" y="709" font-size="10.5" fill="#706C64">사진은 추천 생성 후 바로 삭제돼요</text><text x="348" y="709" text-anchor="end" font-size="10.5" font-weight="600" fill="#BC5037">직접 선택</text>
</g>

<g opacity="{controls_opacity:.3f}">
  <path d="M34 759h22v20H34zM34 773l6-6 5 5 4-4 7 6" fill="none" stroke="#706C64" stroke-width="1.7"/><path d="M330 758a11 11 0 0 1 20-3l2 3M352 751v7h-7M352 772a11 11 0 0 1-20 3l-2-3M330 779v-7h7" fill="none" stroke="#706C64" stroke-width="1.7"/>
  <circle cx="195" cy="765" r="36" fill="#F6F2EA" stroke="{shutter_stroke}" stroke-width="2.2"/><circle cx="195" cy="765" r="28" fill="{shutter_fill}"/>
  <text x="195" y="819" text-anchor="middle" font-size="11" font-weight="500" fill="{'#BC5037' if complete > .65 else '#8E8276'}">{'추천된 구도로 촬영해보세요' if complete > .65 else '추천이 준비되면 촬영할 수 있어요'}</text>
</g>
<rect x="151" y="836" width="88" height="4" rx="2" fill="#282822"/>
</svg>'''


def main() -> None:
    FRAMES.mkdir(exist_ok=True)
    images: list[Image.Image] = []
    count = int(FPS * DURATION)
    for index in range(count):
        t = index / FPS
        svg = frame_svg(t)
        png_path = FRAMES / f"frame-{index:03d}.png"
        cairosvg.svg2png(bytestring=svg.encode("utf-8"), write_to=str(png_path), output_width=312, output_height=675)
        images.append(Image.open(png_path).convert("RGBA"))

    # Hold the completed recommendation slightly longer before the loop restarts.
    images[-1].save(PREVIEW)
    gif_frames = [img.convert("P", palette=Image.Palette.ADAPTIVE, colors=192) for img in images]
    durations = [round(1000 / FPS)] * len(gif_frames)
    durations[-1] = 1250
    gif_frames[0].save(
        OUTPUT,
        save_all=True,
        append_images=gif_frames[1:],
        duration=durations,
        loop=0,
        optimize=False,
        disposal=2,
    )
    print(OUTPUT)
    print(PREVIEW)


if __name__ == "__main__":
    main()
