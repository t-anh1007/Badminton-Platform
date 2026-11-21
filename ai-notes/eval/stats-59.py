# Thong ke 59 mau PO da cham (graded-59.txt). File nhap.
import json, re
from collections import Counter
data = {r['id']: r for r in json.loads(open('ai-notes/eval/likert-data.js', encoding='utf-8').read()[len('window.DATA = '):].rstrip().rstrip(';'))}
claude = json.load(open('ai-notes/eval/likert-truth-claude.json', encoding='utf-8'))
rows = []
for line in open('ai-notes/eval/graded-59.txt', encoding='utf-8'):
    f, t, l1, l2 = line.strip().split('|')
    truth = [[int(v) for v in s.strip().split('-')] for s in t.split(';')]
    rows.append(dict(f=f, set=data[f]['set'], truth=truth, ai=data[f]['ai'], conf=data[f]['conf'], model=data[f]['model'], l1=int(l1), l2=int(l2), claude=claude[f]))
def mean(x): return round(sum(x) / len(x), 2) if x else None
def rep(name, R):
    exact = [r for r in R if r['truth'] == r['ai']]
    print(f"\n== {name}: n={len(R)}")
    print(' AI doc dung het:', len(exact), f"({100*len(exact)//len(R)}%)")
    print(' Likert1 TB', mean([r['l1'] for r in R]), dict(sorted(Counter(r['l1'] for r in R).items())))
    print(' Likert2 TB', mean([r['l2'] for r in R]), dict(sorted(Counter(r['l2'] for r in R).items())))
    print(' L1>=4:', sum(r['l1'] >= 4 for r in R), ' L2>=4:', sum(r['l2'] >= 4 for r in R))
    c_ok = [r['conf'] for r in R if r['l1'] >= 4 and r['conf'] is not None]
    c_bad = [r['conf'] for r in R if r['l1'] <= 2 and r['conf'] is not None]
    print(' conf TB khi L1>=4:', mean(c_ok), ' khi L1<=2:', mean(c_bad))
    print(' model:', dict(Counter(r['model'] for r in R)))
    print(' nhan Claude trung nhan PO:', sum(r['claude'] == r['truth'] for r in R), '/', len(R))
rep('Tong 59', rows)
rep('Bo that (real)', [r for r in rows if r['set'] == 'real32'])
rep('Roboflow', [r for r in rows if r['set'] == 'rf80'])
# Nguong tin cay 0-1: neu tu chot khi conf>=t, bao nhieu ca sai (L1<=2) lot qua
print('\nNguong | tu chot | trong do sai (L1<=2)')
for t in (0.8, 0.9, 0.95, 0.99):
    a = [r for r in rows if r['conf'] is not None and r['conf'] >= t]
    print(t, len(a), sum(r['l1'] <= 2 for r in a))
