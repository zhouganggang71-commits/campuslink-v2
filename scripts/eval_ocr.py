#!/usr/bin/env python3
"""课表 OCR 评估脚本 — 批量预测 + 指标计算"""
import sys, json, subprocess, os, csv, io, re
from pathlib import Path
from collections import defaultdict

try:
    from rapidfuzz import fuzz
except ImportError:
    print("安装依赖: pip install rapidfuzz")
    sys.exit(1)

def normalize(s):
    if not s: return ""
    s = str(s).strip().replace(" ", "").replace("\u3000", "")
    s = s.replace("（","(").replace("）",")").replace("：",":")
    return s

def text_match(pred, gt, threshold=0.85):
    p, g = normalize(pred), normalize(gt)
    if p == g: return True
    if not p or not g: return False
    return fuzz.ratio(p, g) / 100 >= threshold

def slot_match(p, g):
    return (p.get("weekday") == g.get("weekday") and
            p.get("startPeriod") == g.get("startPeriod"))

def align_by_slot(preds, gts):
    matched_preds, matched_gts = [], []
    used_p, used_g = set(), set()
    for i, p in enumerate(preds):
        for j, g in enumerate(gts):
            if slot_match(p, g) and i not in used_p and j not in used_g:
                matched_preds.append((i, p))
                matched_gts.append((j, g))
                used_p.add(i)
                used_g.add(j)
    return matched_preds, matched_gts, used_p, used_g

def eval_single(pred, gt):
    fields = ["name","teacher","classroom","weekday","startPeriod","periodSpan","weekStart","weekEnd","weekType"]
    results = {}
    exact = True
    for f in fields:
        if f in ("weekday","startPeriod","periodSpan","weekStart","weekEnd","weekType"):
            ok = (pred.get(f) == gt.get(f))
        else:
            ok = text_match(str(pred.get(f,"")), str(gt.get(f,"")))
        results[f] = ok
        if not ok: exact = False
    return results, exact

def run_ocr(image_path):
    script = os.path.join(os.path.dirname(__file__), "../../scripts/ocr_schedule.py")
    result = subprocess.run(["python3", script, image_path], capture_output=True, text=True, timeout=120)
    try:
        return json.loads(result.stdout)
    except:
        return {"courses":[], "error": result.stderr}

def run_batch(image_dir, gt_file, output_dir):
    with open(gt_file) as f:
        gt_data = json.load(f)
    
    per_field = defaultdict(lambda: {"tp":0,"fp":0,"fn":0})
    exact_correct, exact_total = 0, 0
    
    for item in gt_data:
        img_path = os.path.join(image_dir, item["image"])
        gt_courses = item["courses"]
        print(f"识别: {item['image']} ({len(gt_courses)} 条课程)...")
        result = run_ocr(img_path)
        pred_courses = result.get("courses", [])
        
        matched_p, matched_g, up, ug = align_by_slot(pred_courses, gt_courses)
        for (i,p), (j,g) in zip(matched_p, matched_g):
            res, exact = eval_single(p, g)
            for f, ok in res.items():
                if ok: per_field[f]["tp"] += 1
                else: per_field[f]["fn"] += 1
                per_field[f]["fp"] += 0  # FP from unmatched preds
            if exact: exact_correct += 1
            exact_total += 1
        
        # unmatched preds → FP
        for i in range(len(pred_courses)):
            if i not in up:
                for f in ["name","teacher","classroom","weekday","startPeriod","periodSpan","weekStart","weekEnd","weekType"]:
                    per_field[f]["fp"] += 1
        
        # unmatched gts → FN
        for j in range(len(gt_courses)):
            if j not in ug:
                for f in ["name","teacher","classroom","weekday","startPeriod","periodSpan","weekStart","weekEnd","weekType"]:
                    per_field[f]["fn"] += 1
    
    lines = []
    lines.append("字段,Precision,Recall,F1,TP,FP,FN")
    for f in sorted(per_field.keys()):
        s = per_field[f]
        p = s["tp"] / (s["tp"] + s["fp"]) if (s["tp"] + s["fp"]) > 0 else 0
        r = s["tp"] / (s["tp"] + s["fn"]) if (s["tp"] + s["fn"]) > 0 else 0
        f1 = 2*p*r/(p+r) if (p+r) > 0 else 0
        lines.append(f"{f},{p:.3f},{r:.3f},{f1:.3f},{s['tp']},{s['fp']},{s['fn']}")
    
    e_acc = exact_correct / exact_total if exact_total > 0 else 0
    lines.append(f"\n条目级准确率,{e_acc:.3f},({exact_correct}/{exact_total})")
    
    report = "\n".join(lines)
    os.makedirs(output_dir, exist_ok=True)
    with open(os.path.join(output_dir, "eval_report.csv"), "w") as f:
        f.write(report)
    print("\n=== 评估报告 ===")
    print(report)
    return report

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("用法: python3 eval_ocr.py <图片目录> <GT文件> [输出目录]")
        print("GT文件格式: [{\"image\":\"文件名\",\"courses\":[{\"name\":\"\",...}]}]")
        sys.exit(1)
    run_batch(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else "./eval_output")
