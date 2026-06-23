import re, sys
text = sys.stdin.read()
skip = {"上午","下午","晚上","节次","星期","时间段","学号","课表","打印时间","备注","午别","时间","课程","教师","教室","学分","学时","考核","星期节次","课程名称","考核方式"}
courses = set()
for line in text.split("\n"):
    t = line.strip()
    if not t: continue
    cn_only = re.findall(r"[\u4e00-\u9fff]{2,20}", t)
    for w in cn_only:
        if w not in skip and not any(s in w for s in skip):
            courses.add(w)
for c in sorted(courses, key=len, reverse=True):
    print(c)
