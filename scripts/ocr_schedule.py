#!/usr/bin/env python3
"""课表识别 v2 — 增强预处理 + 置信度降级 + 鲁棒解析"""
import sys, json, re, cv2, numpy as np, math
from rapidocr_onnxruntime import RapidOCR

ocr = RapidOCR(det_box_thresh=0.35, text_score_thresh=0.35)
META_RE = re.compile(r'周学时|总学时|学分|考核|选课|备注|场地|教师|教学班|学号|课程学时|财政|绩效|管理|班级|学年第|学期|致学|敏学|未安排|考查|考试|组成|考核方式|教学班组|学班|班：|：|:')
SKIP = {"上午","下午","晚上","节次","星期","时间段","学号","课表","打印时间","午别","时间","课程名称","课程","教师","教室","学分","学时","考核方式","备注","星期节次"}
WD_MAP = {'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'日':7}
WD_MAP2 = {'1':1,'2':2,'3':3,'4':4,'5':5,'6':6,'7':7}

def preprocess(img):
    """增强预处理: 灰度→CLAHE→降噪→自适应二值化→腐蚀膨胀→纠偏"""
    if img is None: return None
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    # CLAHE 对比度增强
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8,8))
    enhanced = clahe.apply(gray)
    # 降噪
    denoised = cv2.fastNlMeansDenoising(enhanced, h=10)
    # 自适应二值化
    binary = cv2.adaptiveThreshold(denoised, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2)
    # 轻微膨胀连接断笔字符
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (2,1))
    dilated = cv2.dilate(binary, kernel, iterations=1)
    # 纠偏: 霍夫变换检测线条角度
    edges = cv2.Canny(dilated, 50, 150, apertureSize=3)
    lines = cv2.HoughLines(edges, 1, np.pi/180, threshold=200)
    if lines is not None:
        angles = [l[0][1] for l in lines if abs(l[0][1] - np.pi/2) > 0.1]
        if angles:
            median_angle = np.median(angles)
            angle_deg = (median_angle - np.pi/2) * 180 / np.pi
            if abs(angle_deg) < 10:
                (h,w) = dilated.shape[:2]
                center = (w//2, h//2)
                M = cv2.getRotationMatrix2D(center, angle_deg, 1.0)
                dilated = cv2.warpAffine(dilated, M, (w,h), borderValue=255)
    return dilated

def preprocess_light(img):
    """轻量预处理: 只做 CLAHE + 降噪，用于二次尝试"""
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=1.5, tileGridSize=(8,8))
    enhanced = clahe.apply(gray)
    denoised = cv2.fastNlMeansDenoising(enhanced, h=7)
    return denoised

def is_course(text):
    if len(text) < 2 or len(text) > 20: return False
    if text in SKIP or any(d in text for d in SKIP): return False
    if META_RE.search(text): return False
    if not re.search(r'^[\u4e00-\u9fff\w（）、]+$', text): return False
    if not re.search(r'[\u4e00-\u9fff]{2,}', text): return False
    return True

def parse_week(text):
    ws, we, wt = 1, 18, "all"
    if "单" in text: wt = "odd"
    elif "双" in text: wt = "even"
    ranges = re.findall(r'(\d+)[-~](\d+)周', text)
    if ranges:
        ws = min(int(a) for a,_ in ranges)
        we = max(int(b) for _,b in ranges)
        return ws, we, wt
    single = re.findall(r'(\d+)周', text)
    if single:
        nums = [int(s) for s in single]
        ws, we = min(nums), max(nums)
    return ws, we, wt

def parse_teacher_classroom(text):
    teacher, classroom = "", ""
    tm = re.search(r'(?:教师|教|敏师)[：:]?\s*([\u4e00-\u9fff]{2,4})', text)
    if tm: teacher = tm.group(1)
    rm = re.search(r'场地[：:]?\s*([^\s/]+)', text)
    if rm: classroom = rm.group(1)
    if not classroom:
        rm = re.search(r'/([BC]\d{3}|操场\d*|[\u4e00-\u9fff]+\d+)', text)
        if rm: classroom = rm.group(1)
    return teacher, classroom

def parse_period(text):
    """解析节次: (1-2节) 或 1-2 或 1~2"""
    m = re.search(r'[（(](\d+)[-~](\d+)节?[）)]', text)
    if m:
        return int(m.group(1)), max(1, int(m.group(2)) - int(m.group(1)) + 1)
    m = re.search(r'(\d+)[-~](\d+)\s*节', text)
    if m:
        return int(m.group(1)), max(1, int(m.group(2)) - int(m.group(1)) + 1)
    return None, 2

def run_ocr(img, conf_threshold=0.5):
    """执行 OCR，返回 items 和平均置信度"""
    h, w = img.shape[:2]
    if w > 800:
        img = cv2.resize(img, (800, int(800 * h / w)))
    tmp_path = "/tmp/ocr_resized.jpg"
    cv2.imwrite(tmp_path, img, [cv2.IMWRITE_JPEG_QUALITY, 90])
    result, _ = ocr(tmp_path)
    if not result: return [], 0.0

    items = []
    confs = []
    for box, text, conf in result:
        t = text.strip()
        if conf < conf_threshold or not t: continue
        items.append({"x":(box[0][0]+box[2][0])/2, "y":(box[0][1]+box[2][1])/2, "text":t, "conf":conf})
        confs.append(conf)
    avg_conf = sum(confs)/len(confs) if confs else 0.0
    return items, avg_conf

def detect_columns(items):
    """鲁棒的列检测: 周X 或 周1-7 或 星期X 或 单纯数字列"""
    cols = {}
    for it in items:
        # 周X 格式 (周一 周二 ...)
        for ch, wd in WD_MAP.items():
            if it["text"].endswith(ch) and len(it["text"]) <= 4:
                cols[wd] = it["x"]
        # 星期X 格式
        for ch, wd in WD_MAP.items():
            if f"星期{ch}" in it["text"]:
                cols[wd] = it["x"]
        # 纯数字列 (1 2 3 ... 7)
        for ch, wd in WD_MAP2.items():
            if it["text"].strip() == ch:
                cols[wd] = it["x"]
    # 补全: 如果有 2-7 列但缺 1 列，用 x 间距推算
    if 1 not in cols and len(cols) >= 3:
        sorted_cols = sorted(cols.values())
        gap = sum(sorted_cols[i+1] - sorted_cols[i] for i in range(len(sorted_cols)-1)) / (len(sorted_cols)-1)
        cols[1] = sorted_cols[0] - gap
    # 补全: 如果有 1-6 列但缺 7 列
    if 7 not in cols and len(cols) >= 3:
        sorted_cols = sorted(cols.values())
        gap = sum(sorted_cols[i+1] - sorted_cols[i] for i in range(len(sorted_cols)-1)) / (len(sorted_cols)-1)
        cols[7] = sorted_cols[-1] + gap
    return cols

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error":"no image path"}))
        sys.exit(1)

    img = cv2.imread(sys.argv[1])
    if img is None:
        print(json.dumps({"error":"cannot read image"}))
        sys.exit(1)

    # 预处理 + OCR
    processed = preprocess(img)
    if processed is not None:
        items, avg_conf = run_ocr(processed)
    else:
        items, avg_conf = [], 0.0

    # 置信度过低 → 轻量预处理重试
    if (not items or avg_conf < 0.55) and processed is not None:
        light = preprocess_light(img)
        items2, avg_conf2 = run_ocr(light, conf_threshold=0.4)
        if avg_conf2 > avg_conf:
            items, avg_conf = items2, avg_conf2

    if not items:
        print(json.dumps({"courses":[],"rawText":"", "avg_conf": avg_conf}))
        sys.exit(0)

    items.sort(key=lambda i:(i["y"],i["x"]))

    # 列检测
    cols = detect_columns(items)
    if len(cols) < 3:
        # 无表头时退化为文本流，让后端正则解析
        raw_text = "\n".join(it["text"] for it in items)
        print(json.dumps({"courses":[],"rawText":raw_text, "avg_conf": avg_conf}))
        sys.exit(0)

    # 找到表头行下方的所有内容
    header_y = 0
    for it in items:
        if ("周" in it["text"] or "星期" in it["text"]) and any(
            it["text"].endswith(ch) for ch in WD_MAP
        ):
            header_y = max(header_y, it["y"])
    if header_y == 0:
        header_y = min(it["y"] for it in items)

    sorted_wd = sorted(cols.keys())

    # 分配列
    for it in items:
        if it["y"] <= header_y + 5: continue
        best_col, best_dist = 1, 9999
        for wd in sorted_wd:
            dist = abs(it["x"] - cols[wd])
            if dist < best_dist:
                best_dist, best_col = dist, wd
        it["wd"] = best_col

    # 按列分组
    by_col = {wd: [] for wd in sorted_wd}
    for it in items:
        if "wd" not in it: continue
        by_col[it["wd"]].append(it)

    # 找节次行
    period_y = {}
    for it in items:
        if "wd" not in it: continue
        m = re.match(r'^\s*(\d{1,2})\s*$', it["text"])
        if m and 1 <= int(m.group(1)) <= 13:
            period_y[it["y"]] = int(m.group(1))

    # 解析课程
    courses = []
    seen = set()
    for wd in sorted_wd:
        col_items = by_col[wd]
        course_items = [it for it in col_items if is_course(it["text"])]
        meta_items = [it for it in col_items if re.search(
            r'[单双]周|\d+[-~]\d+周|\d+周|教师|教：|敏师|场地|\d+[-~]\d+节', it["text"]
        )]

        for ci in course_items:
            meta_texts = []
            for mi in meta_items:
                dy = mi["y"] - ci["y"]
                if 0 < dy < 120:
                    meta_texts.append(mi["text"])
            meta_combined = " ".join(meta_texts)

            ws, we, wt = 1, 18, "all"
            ps = 2
            teacher, classroom = "", ""
            if meta_combined:
                ws, we, wt = parse_week(meta_combined)
                sp_result, ps_result = parse_period(meta_combined)
                if sp_result is not None:
                    ps = ps_result
                teacher, classroom = parse_teacher_classroom(meta_combined)

            # 从节次行取 startPeriod
            sp = 1
            cy = ci["y"]
            for py in sorted(period_y.keys(), reverse=True):
                if cy >= py:
                    sp = period_y[py]
                    break

            # 对齐到奇数节 (1,3,5,7,9,11)
            sp = ((sp - 1) // 2) * 2 + 1
            sp = max(1, min(11, sp))

            key = f"{ci['text']}-{wd}"
            if key in seen: continue
            seen.add(key)

            slot_key = f"{wd}-{sp}"
            existing = next((c for c in courses if f"{c['weekday']}-{c['startPeriod']}" == slot_key), None)
            if existing:
                if len(ci["text"]) > len(existing["name"]):
                    existing["name"] = ci["text"]
                    existing["teacher"] = teacher or existing["teacher"]
                    existing["classroom"] = classroom or existing["classroom"]
                continue

            courses.append({
                "name": ci["text"], "teacher": teacher, "classroom": classroom,
                "weekday": wd, "startPeriod": sp, "periodSpan": max(1, min(ps, 4)),
                "weekStart": ws, "weekEnd": we, "weekType": wt,
                "courseType": "theory",
            })

    # 去碎片
    filtered = []
    by_slot = {}
    for c in courses:
        slot = (c["weekday"], c["startPeriod"])
        if slot not in by_slot: by_slot[slot] = []
        by_slot[slot].append(c)
    for slot_courses in by_slot.values():
        for c in slot_courses:
            dup = False
            for other in slot_courses:
                if other is c: continue
                shorter = c["name"] if len(c["name"]) < len(other["name"]) else other["name"]
                longer = other["name"] if shorter == c["name"] else c["name"]
                common = sum(1 for ch in shorter if ch in longer)
                if common >= len(shorter) * 0.5 and len(c["name"]) < len(other["name"]):
                    dup = True
                    break
            if not dup:
                filtered.append(c)

    raw_text = "\n".join(it["text"] for it in items)
    print(json.dumps({"courses":filtered,"rawText":raw_text,"avg_conf":round(avg_conf,3)},ensure_ascii=False))

if __name__=="__main__":
    main()
