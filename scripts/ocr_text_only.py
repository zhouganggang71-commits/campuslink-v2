#!/usr/bin/env python3
"""OCR 纯文本提取 — 不解析，不分组，只输出全部文本"""
import sys, json, cv2
from rapidocr_onnxruntime import RapidOCR

ocr = RapidOCR(det_box_thresh=0.35, text_score_thresh=0.35)

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error":"no image path"}))
        sys.exit(1)
    img = cv2.imread(sys.argv[1])
    if img is None:
        print(json.dumps({"error":"cannot read image"}))
        sys.exit(1)

    # 只做缩放，不做任何预处理
    h, w = img.shape[:2]
    if w > 800:
        img = cv2.resize(img, (800, int(800 * h / w)))
        tmp = "/tmp/ocr_text.jpg"
        cv2.imwrite(tmp, img, [cv2.IMWRITE_JPEG_QUALITY, 90])
        result, _ = ocr(tmp)
    else:
        result, _ = ocr(sys.argv[1])

    if not result:
        print(json.dumps({"rawText":""}))
        sys.exit(0)

    texts = []
    for box, text, conf in result:
        t = text.strip()
        if conf >= 0.3 and t:
            texts.append(t)

    rawText = "\n".join(texts)
    print(json.dumps({"rawText": rawText, "boxCount": len(texts)}, ensure_ascii=False))

if __name__ == "__main__":
    main()
