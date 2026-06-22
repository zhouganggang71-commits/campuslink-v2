#!/usr/bin/env python3
"""教务系统课表识别 — 跨行关联课程+元数据，完整周数解析"""
import sys, json, re, cv2
from rapidocr_onnxruntime import RapidOCR

ocr = RapidOCR(det_box_thresh=0.4, text_score_thresh=0.4)
META_RE = re.compile(r'周学时|总学时|学分|考核|选课|备注|场地|教师|教学班|学号|课程学时|财政|绩效|管理|班级|学年第|学期|致学|敏学|未安排|考查|考试|组成|考核方式|教学班组|学班|班：|：|:')
SKIP = {"上午","下午","晚上","节次","星期","时间段","学号","课表","打印时间"}
WD_MAP = {'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'日':7}

def is_course(text):
    if len(text) < 2 or len(text) > 15: return False
    if text in SKIP or any(d in text for d in SKIP): return False
    if META_RE.search(text): return False
    if not re.search(r'^[\u4e00-\u9fff\w]+$', text): return False
    if not re.search(r'[\u4e00-\u9fff]{2,}', text): return False
    return True

def parse_week(text):
    ws, we, wt = 1, 18, "all"
    if "单" in text: wt = "odd"
    elif "双" in text: wt = "even"

    # 匹配所有 N-M周 或 N~M周
    ranges = re.findall(r'(\d+)[-~](\d+)周', text)
    if ranges:
        ws = min(int(a) for a,_ in ranges)
        we = max(int(b) for _,b in ranges)
        return ws, we, wt

    # 单个周：17周, 18周 等
    single = re.findall(r'(\d+)周', text)
    if single:
        nums = [int(s) for s in single]
        ws = min(nums)
        we = max(nums)
    return ws, we, wt

def parse_teacher_classroom(text):
    """从元数据中提取教师和教室"""
    teacher, classroom = "", ""
    # 教师: 教师：XXX / 教：XXX / 敏师：XXX (OCR 误识) / /教师XXX
    tm = re.search(r'(?:教师|教|敏师)[：:]?\s*([\u4e00-\u9fff]{2,4})', text)
    if tm: teacher = tm.group(1)
    # 教室: 场地：XXX / 场地XXX / /场地：XXX / C\d+ / B\d+ / 操场\d*
    rm = re.search(r'场地[：:]?\s*([^\s/]+)', text)
    if rm: classroom = rm.group(1)
    if not classroom:
        rm = re.search(r'/([BC]\d{3}|操场\d*)', text)
        if rm: classroom = rm.group(1)
    return teacher, classroom

def parse_period(text):
    m = re.search(r'[（(](\d+)[-~](\d+)节[）)]', text)
    if m:
        return int(m.group(1)), max(1, int(m.group(2)) - int(m.group(1)) + 1)
    return 1, 2

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error":"no image path"}))
        sys.exit(1)
    try:
        # 缩小图片加速识别（1200px 宽足够中文识别）
        img = cv2.imread(sys.argv[1])
        if img is not None and img.shape[1] > 800:
            h, w = img.shape[:2]
            img = cv2.resize(img, (800, int(800 * h / w)))
            tmp_path = "/tmp/ocr_resized.jpg"
            cv2.imwrite(tmp_path, img, [cv2.IMWRITE_JPEG_QUALITY, 85])
            result, _ = ocr(tmp_path)
        else:
            result, _ = ocr(sys.argv[1])
    except Exception as e:
        print(json.dumps({"error":str(e)}))
        sys.exit(1)
    if not result:
        print(json.dumps({"courses":[],"rawText":""}))
        sys.exit(0)

    items = []
    for box, text, conf in result:
        t = text.strip()
        if conf < 0.5 or not t: continue
        items.append({"x":(box[0][0]+box[2][0])/2, "y":(box[0][1]+box[2][1])/2, "text":t})

    if not items:
        print(json.dumps({"courses":[],"rawText":""}))
        sys.exit(0)

    items.sort(key=lambda i:(i["y"],i["x"]))

    # 找表头列
    cols = {}
    for it in items:
        if "周" in it["text"] or "星期" in it["text"]:
            for ch, wd in WD_MAP.items():
                if it["text"].endswith(ch) and len(it["text"]) <= 4:
                    cols[wd] = it["x"]
    if 1 not in cols and 2 in cols:
        for it in items:
            if it["text"] == "星期":
                cols[1] = (it["x"] + cols[2]) / 2
    if len(cols) < 3:
        print(json.dumps({"courses":[],"rawText":""}))
        sys.exit(0)

    header_y = max(it["y"] for it in items if ("周" in it["text"] or "星期" in it["text"]) and any(it["text"].endswith(ch) for ch in WD_MAP))

    # 给所有 item 分配列
    sorted_wd = sorted(cols.keys())
    for it in items:
        if it["y"] <= header_y + 5: continue
        best_col, best_dist = 1, 9999
        for wd in sorted_wd:
            dist = abs(it["x"] - cols[wd])
            if dist < best_dist:
                best_dist, best_col = dist, wd
        it["wd"] = best_col

    # 按列分组，跨行收集课程名和元数据
    by_col = {wd: [] for wd in sorted_wd}
    for it in items:
        if "wd" not in it: continue
        by_col[it["wd"]].append(it)

    # 找节次数字
    period_y = {}
    for it in items:
        if "wd" not in it: continue
        m = re.match(r'^\s*(\d+)\s*$', it["text"])
        if m and 1 <= int(m.group(1)) <= 11:
            period_y[it["y"]] = int(m.group(1))

    # 每个列内，配对课程名和元数据（按 y 邻近）
    courses = []
    seen = set()
    for wd in sorted_wd:
        col_items = by_col[wd]
        # 收集课程名和元数据
        course_items = [it for it in col_items if is_course(it["text"])]
        meta_items = [it for it in col_items if re.search(r'[单双]周|\d+[-~]\d+周|\d+周|教师|教：|敏师|场地', it["text"])]

        for ci in course_items:
            # 收集所有下方元数据（0-100px 内）
            meta_texts = []
            for mi in meta_items:
                dy = mi["y"] - ci["y"]
                if 0 < dy < 100:
                    meta_texts.append(mi["text"])
            meta_combined = " ".join(meta_texts)

            ws, we, wt = 1, 18, "all"
            ps = 2
            teacher, classroom = "", ""
            if meta_combined:
                ws, we, wt = parse_week(meta_combined)
                _, ps = parse_period(meta_combined)
                teacher, classroom = parse_teacher_classroom(meta_combined)

            # 从节次行取 startPeriod
            sp = 1
            cy = ci["y"]
            for py in sorted(period_y.keys(), reverse=True):
                if cy >= py:
                    sp = period_y[py]
                    break

            # 教务系统只有 1-2/3-4/5-6/7-8/9-10/11-12 节，对齐到最近奇数
            sp = ((sp - 1) // 2) * 2 + 1
            if sp < 1: sp = 1
            if sp > 11: sp = 11

            key = f"{ci['text']}-{wd}"
            if key in seen: continue
            seen.add(key)

            # 合并到已有 slot（同 weekday+period 只保留一个）
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
                "weekday": wd, "startPeriod": sp, "periodSpan": 2,
                "weekStart": ws, "weekEnd": we, "weekType": wt,
                "courseType": "theory",
            })

    # 过滤 OCR 碎片：同 weekday+period 内，短名是长名的子串则丢弃（O(n) 用哈希）
    filtered = []
    by_slot = {}
    for c in courses:
        slot = (c["weekday"], c["startPeriod"])
        if slot not in by_slot:
            by_slot[slot] = []
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

    print(json.dumps({"courses":filtered,"rawText":"\n".join(it["text"] for it in items)},ensure_ascii=False))

if __name__=="__main__":
    main()
