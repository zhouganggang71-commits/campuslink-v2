#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
竞品实料内容 → PDF 资料（新生资料库）
从 seed 046 SQL 提取指定内容，HTML 剥离为纯文本，PIL 分页渲染 A4 PDF（中文 STHeiti 字体）。
输出到 scripts/dev-pdfs/（部署时 scp 到生产 uploads/resources/）
"""
import re
import os
from PIL import Image, ImageDraw, ImageFont

# ── 要生成 PDF 的内容（id → 文件名）──
TARGETS = [
    (14, '转专业指南'),
    (18, '奖助学金政策'),
    (15, '证书与竞赛学分抵免指南'),
    (5, '食堂餐饮指南'),
    (23, '2026-2027学年第一学期校历'),
    (1, '宿舍生活指南'),
]

# ── 从 seed SQL 提取 id 的 title/body ──
SEED = os.path.join(os.path.dirname(__file__), '../migrations/046_seed_contents.sql')
src = open(SEED, encoding='utf-8').read()

def extract_content(cid):
    # 匹配 (id, 1, 'cat', 'sub', 'title', 'summary', 'body', ...) 的 INSERT VALUES 行
    # seed 里一条内容占一行，从 "(cid, 1, '" 开始
    m = re.search(r'\(%d, 1, \'[a-z_]+\', \'[a-z_]+\', \'([^\']*)\', \'[^\']*\', \'([^\']*)\', \'([^\']*)\', \'[^\']*\', \d+, \'published\'' % cid, src)
    if not m:
        return None, None
    return m.group(1), m.group(2)  # title, body

def html_to_text(html):
    # 去掉 HTML 标签，保留段落/标题/列表换行
    text = html
    text = re.sub(r'</(h1|h2|h3|p|li|ul|ol|div)>', '\n', text)
    text = re.sub(r'<li>', '• ', text)
    text = re.sub(r'<br\s*/?>', '\n', text)
    text = re.sub(r'<[^>]+>', '', text)
    text = text.replace('&lt;', '<').replace('&gt;', '>').replace('&amp;', '&')
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()

# ── PDF 渲染（A4 像素，150dpi ≈ 1240x1754）──
W, H = 1240, 1754
MARGIN = 90
FONT_PATH = '/System/Library/Fonts/STHeiti Medium.ttc'
FONT_PATH_BOLD = '/System/Library/Fonts/STHeiti Medium.ttc'

def get_font(size):
    try:
        return ImageFont.truetype(FONT_PATH, size)
    except Exception:
        return ImageFont.load_default()

def wrap_text(text, font, max_width):
    lines = []
    for para in text.split('\n'):
        if not para.strip():
            lines.append('')
            continue
        line = ''
        for ch in para:
            test = line + ch
            if font.getlength(test) > max_width and line:
                lines.append(line)
                line = ch
            else:
                line = test
        lines.append(line)
    return lines

def render_pdf(title, body, out_path):
    font_title = get_font(44)
    font_h = get_font(30)
    font_body = get_font(26)
    line_h = 44

    pages = []
    img = Image.new('RGB', (W, H), 'white')
    d = ImageDraw.Draw(img)
    y = MARGIN

    # 标题
    d.text((MARGIN, y), title, font=font_title, fill=(15, 92, 196))
    y += 70
    d.line([(MARGIN, y), (W - MARGIN, y)], fill=(24, 144, 255), width=4)
    y += 50

    body_lines = []
    for para in body.split('\n'):
        if re.match(r'^#{1,3} ', para):
            body_lines.append(('h', para))
        elif para.strip().startswith('•'):
            body_lines.append(('li', para))
        elif para.strip() == '':
            body_lines.append(('gap', ''))
        else:
            body_lines.append(('p', para))

    def new_page():
        nonlocal img, d, y
        pages.append(img)
        img = Image.new('RGB', (W, H), 'white')
        d = ImageDraw.Draw(img)
        y = MARGIN
        # 页眉细线
        d.line([(MARGIN, 60), (W - MARGIN, 60)], fill=(230, 235, 245), width=2)
        d.text((MARGIN, 30), 'CampusLink · 川菜', font=get_font(20), fill=(160, 170, 190))

    for kind, para in body_lines:
        if kind == 'h':
            font = font_h
            lh = 46
            fill = (15, 92, 196)
        elif kind == 'li':
            font = font_body
            lh = line_h
            fill = (40, 45, 55)
        else:
            font = font_body
            lh = line_h
            fill = (40, 45, 55)

        wrapped = wrap_text(para, font, W - 2 * MARGIN)
        need = len(wrapped) * lh + (kind == 'h' and 10 or 6)
        if y + need > H - MARGIN:
            new_page()
        for ln in wrapped:
            if y > H - MARGIN:
                new_page()
            d.text((MARGIN + (kind == 'li' and 20 or 0), y), ln, font=font, fill=fill)
            y += lh
        y += kind == 'h' and 16 or 8

    pages.append(img)

    # 存多页 PDF
    first = pages[0]
    if len(pages) > 1:
        first.save(out_path, save_all=True, append_images=pages[1:], resolution=150)
    else:
        first.save(out_path, resolution=150)
    print(f'✓ {os.path.basename(out_path)}（{len(pages)} 页）')

def main():
    out_dir = os.path.join(os.path.dirname(__file__), 'dev-pdfs')
    os.makedirs(out_dir, exist_ok=True)
    for cid, name in TARGETS:
        title, body = extract_content(cid)
        if not body:
            print(f'⚠️ id {cid} 未提取到内容，跳过')
            continue
        text = html_to_text(body)
        out = os.path.join(out_dir, f'{name}.pdf')
        render_pdf(title, text, out)

if __name__ == '__main__':
    main()
