#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
批量生成内容品牌封面（1200x675，16:9）
course 蓝对角渐变 + 白色标题 + 底部品牌字。输出 scripts/dev-covers/
用法：python3 scripts/make-content-covers.py（读 /tmp/titles.txt：id<TAB>title）
"""
import re
import os
import math
from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 675
FONT_TITLE = '/System/Library/Fonts/STHeiti Medium.ttc'

def get_font(size):
    return ImageFont.truetype(FONT_TITLE, size)

def gradient_bg():
    img = Image.new('RGB', (W, H))
    px = img.load()
    # 对角渐变：左上亮蓝 #4da3ff → 右下深蓝 #0b5cc4
    for y in range(H):
        for x in range(W):
            t = (x / W + y / H) / 2
            r = int(0x4d + (0x0b - 0x4d) * t)
            g = int(0xa3 + (0x5c - 0xa3) * t)
            b = int(0xff + (0xc4 - 0xff) * t)
            px[x, y] = (r, g, b)
    return img

def wrap_title(text, font, max_w):
    lines = []
    cur = ''
    for ch in text:
        if font.getlength(cur + ch) > max_w and cur:
            lines.append(cur)
            cur = ch
        else:
            cur += ch
    lines.append(cur)
    return lines[:3]  # 最多 3 行

def make_cover(cid, title, out_dir):
    img = gradient_bg()
    d = ImageDraw.Draw(img)

    # 顶部品牌条
    d.line([(60, 52), (W - 60, 52)], fill=(255, 255, 255, 120), width=3)
    d.text((60, 24), '川菜 CampusLink', font=get_font(30), fill=(255, 255, 255, 230))

    # 标题（居中，字号随长度自适应）
    size = 64
    font = get_font(size)
    while font.getlength(title) > W - 160 and size > 34:
        size -= 4
        font = get_font(size)
    lines = wrap_title(title, font, W - 160)
    lh = int(size * 1.5)
    total = len(lines) * lh
    y = (H - total) // 2 + 20
    for ln in lines:
        tw = font.getlength(ln)
        d.text(((W - tw) / 2, y), ln, font=font, fill=(255, 255, 255, 255))
        y += lh

    # 底部品牌 + 页码
    d.text((60, H - 60), 'CampusLink · 川菜 校园信息平台', font=get_font(26), fill=(255, 255, 255, 180))
    d.text((W - 200, H - 60), f'No.{cid}', font=get_font(24), fill=(255, 255, 255, 120))

    out = os.path.join(out_dir, f'cover-{cid}.jpg')
    img.save(out, 'JPEG', quality=88)
    return out

def main():
    out_dir = os.path.join(os.path.dirname(__file__), 'dev-covers')
    os.makedirs(out_dir, exist_ok=True)
    for line in open('/tmp/titles.txt', encoding='utf-8').read().strip().split('\n'):
        m = re.match(r'^(\d+)\t(.+)$', line)
        if not m:
            continue
        cid, title = int(m.group(1)), m.group(2)
        p = make_cover(cid, title, out_dir)
        print(f'✓ cover-{cid}.jpg <- {title}')

if __name__ == '__main__':
    main()
