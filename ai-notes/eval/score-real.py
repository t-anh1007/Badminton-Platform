# Cham ket qua AI doc anh voi ti so that (Claude doi chieu bang mat 09/11/2026), de xuat Likert. File nhap.
import json, statistics as st, sys, csv
sys.stdout.reconfigure(encoding='utf-8')
R = {r['file']: r for r in json.load(open('ai-notes/eval/results-real.json', encoding='utf-8'))}
# truth: cac set hien tren bang theo thu tu, [hang tren/trai, hang duoi/phai]; None = o khong doc duoc bang mat
T = {
 'real01.png': [[10,12]], 'real02.png': [[17,11]], 'real03.png': [[17,20]], 'real04.png': [[18,21],[18,20]],
 'real05.png': [[10,10]], 'real06.png': [[21,19],[10,12]], 'real07.png': [[5,10]], 'real08.png': [[19,21],[13,12]],
 'real09.png': [[19,21],[17,19]], 'real10.jpg': [[0,2]], 'real11.jpg': [[6,3]], 'real12.jpg': [[19,17]],
 'real13.jpg': [[20,14]], 'real14.jpg': [[21,15],[17,6]], 'real15.jpg': [[21,15],[20,9]], 'real16.jpg': [[12,21],[21,19],[18,20]],
 'real17.jpg': [[8,16]], 'real19.jpg': [[10,None]], 'real20.png': [[5,5]], 'real21.png': [[15,21],[12,20]],
 'real22.png': [[7,4]], 'real23.png': [[21,18],[9,9]], 'real24.png': [[21,18],[16,21],[20,15]], 'real25.png': [[2,10]],
 'real26.png': [[15,21],[10,20]], 'real28.png': [[22,20]], 'real29.png': [[18,18]], 'real30.jpg': [[10,17]],
 'real31.jpg': [[12,21],[11,20]], 'real32.png': [[7,10]], 'realR1.png': [[12,20]], 'realR2.jpg': [[12,21],[21,19],[9,11]],
}
DOI_THUONG = {'real10.jpg','real11.jpg','real12.jpg','real17.jpg','real19.jpg'}
rows = []
for f, truth in T.items():
    r = R[f]; ai = [[a, b] for a, b in r['sets']]
    ai_nz = [s for s in ai if s != [0, 0]] if any(s != [0,0] for s in ai) else ai  # bo set 0-0 chua dau
    unknown = any(v is None for s in truth for v in s)
    n = max(len(truth), len(ai)); cells = ok = 0
    for i in range(n):
        for j in (0, 1):
            t = truth[i][j] if i < len(truth) else 'x'; a = ai[i][j] if i < len(ai) else 'y'
            if t is None: continue
            cells += 1; ok += (t == a)
    exact = (not unknown) and ai == truth
    transposed = len(truth) > 1 and ai == [list(x) for x in zip(*truth)]
    last_ok = (not unknown) and len(ai_nz) > 0 and truth[-1] in ai_nz
    if unknown: kind = 'khong_xac_minh'
    elif exact: kind = 'dung_het'
    elif transposed: kind = 'doc_nham_hang_thanh_set'
    elif ai_nz == truth or (truth[-1] in ai or truth[0] in ai) and all(s in truth for s in ai_nz): kind = 'thieu_hoac_thua_set'
    else: kind = 'sai_so'
    l1 = {'dung_het':5, 'thieu_hoac_thua_set':3, 'khong_xac_minh':3, 'sai_so':2, 'doc_nham_hang_thanh_set':1}[kind]
    if kind == 'sai_so' and ok/cells < 0.5: l1 = 1
    if f == 'real02.png': kind, l1 = 'thua_set_gia', 2  # doc so van thang 0-1 thanh mot set
    c = r['minConf']; high = c is not None and c >= 0.9
    if kind == 'khong_xac_minh': l2 = 3
    elif kind == 'dung_het': l2 = 5 if high else 4
    elif kind == 'thieu_hoac_thua_set': l2 = 2 if high else 4
    else: l2 = 1 if high else 3
    rows.append(dict(file=f, nhom='doi_thuong' if f in DOI_THUONG else 'man_hinh_TV', ti_so_that=json.dumps(truth), ai_doc=json.dumps(ai),
        min_conf=c, model=r['model'].split(':')[0], tre_ms=r['latencyMs'], o_dung=ok, o_tong=cells, loai=kind, likert1=l1, likert2=l2))
with open('ai-notes/eval/likert-real.csv', 'w', encoding='utf-8-sig', newline='') as fh:
    w = csv.DictWriter(fh, fieldnames=list(rows[0])); w.writeheader(); w.writerows(rows)
def desc(v):
    n=len(v); m=st.mean(v); s=st.stdev(v); ci=2.04*s/n**.5
    return f"n={n} TB={m:.2f} SD={s:.2f} CI95=[{m-ci:.2f};{m+ci:.2f}] trung_vi={st.median(v)} %4-5={100*sum(x>=4 for x in v)/n:.1f}"
for name, sub in [('TAT CA', rows), ('doi_thuong', [r for r in rows if r['nhom']=='doi_thuong']), ('man_hinh_TV', [r for r in rows if r['nhom']=='man_hinh_TV'])]:
    print('==', name); print(' L1', desc([r['likert1'] for r in sub]) if len(sub)>1 else ''); print(' L2', desc([r['likert2'] for r in sub]) if len(sub)>1 else '')
    ver=[r for r in sub if r['loai']!='khong_xac_minh']
    print(f" dung het {sum(r['loai']=='dung_het' for r in ver)}/{len(ver)}; o dung {sum(r['o_dung'] for r in sub)}/{sum(r['o_tong'] for r in sub)}")
print('phan bo L1', [sum(r['likert1']==k for r in rows) for k in range(1,6)], 'L2', [sum(r['likert2']==k for r in rows) for k in range(1,6)])
from collections import Counter; print(Counter(r['loai'] for r in rows))
print('minConf cua mau sai/thieu:', sorted(r['min_conf'] for r in rows if r['loai'] not in ('dung_het','khong_xac_minh')))
print('minConf cua mau dung:', sorted(r['min_conf'] for r in rows if r['loai']=='dung_het'))
print('model', Counter(r['model'] for r in rows), 'tre trung vi', st.median(r['tre_ms'] for r in rows))
for r in rows:
    if r['loai']!='dung_het': print(' ', r['file'], r['loai'], r['ti_so_that'], '->', r['ai_doc'], r['min_conf'], r['likert1'], r['likert2'])
