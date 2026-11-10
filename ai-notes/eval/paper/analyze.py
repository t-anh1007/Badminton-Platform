# Phan tich 59 mau theo chuan bai bao. File nhap trong ai-notes (gitignore).
# Chay tu goc repo:  PYTHONIOENCODING=utf-8 python ai-notes/eval/paper/analyze.py
import json, math, os, random
from collections import Counter
import numpy as np
from scipy import stats
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

E = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = os.path.dirname(os.path.abspath(__file__))
FIG = os.path.join(OUT, 'fig'); os.makedirs(FIG, exist_ok=True)
SEED, B = 20261109, 10000
rng = np.random.default_rng(SEED)

D = {r['id']: r for r in json.loads(open(f'{E}/likert-data.js', encoding='utf-8').read()[len('window.DATA = '):].rstrip().rstrip(';'))}
CL = json.load(open(f'{E}/likert-truth-claude.json', encoding='utf-8'))
R = []
for line in open(f'{E}/graded-59.txt', encoding='utf-8'):
    f, t, l1, l2 = line.strip().split('|')
    d = D[f]
    R.append(dict(f=f, truth=[[int(v) for v in s.strip().split('-')] for s in t.split(';')],
                  ai=d['ai'], conf=d['conf'], model=d['model'], set=d['set'], group=d['group'],
                  mapped=d['shown']['columnMappedBy'] == 'ai', prod=d['shown']['level'], prodReasons=d['shown']['reasons'],
                  l1=int(l1), l2=int(l2), claude=CL[f]))
N = len(R)
for r in R:
    r['ok'] = r['ai'] == r['truth']
    r['c'] = r['conf'] if r['conf'] is not None else 0.0  # AI khong tra ket qua -> conf 0

def wilson(k, n, z=1.96):
    if n == 0: return (float('nan'),) * 3
    p = k / n; den = 1 + z * z / n
    c = (p + z * z / (2 * n)) / den; h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den
    return p, max(0, c - h), min(1, c + h)
def boot_mean(x):
    x = np.asarray(x, float); m = rng.choice(x, (B, len(x))).mean(1)
    return x.mean(), *np.percentile(m, [2.5, 97.5])
def pct(k, n): p, lo, hi = wilson(k, n); return f'{k}/{n} = {100*p:.1f}% [{100*lo:.1f}; {100*hi:.1f}]'
def fm(t): return f'{t[0]:.2f} [{t[1]:.2f}; {t[2]:.2f}]'

# ---------- 1. Chi so khach quan ----------
def cells(r):
    n = max(len(r['truth']), len(r['ai'])); ok = 0
    for i in range(n):
        for j in range(2):
            a = r['ai'][i][j] if i < len(r['ai']) else None
            t = r['truth'][i][j] if i < len(r['truth']) else None
            ok += a is not None and a == t
    return ok, 2 * n
def sets(r):
    n = max(len(r['truth']), len(r['ai']))
    return sum(i < len(r['ai']) and i < len(r['truth']) and r['ai'][i] == r['truth'][i] for i in range(n)), n
def winner(ss):
    # ben dan: nhieu van thang hon (van hoa khong tinh); hoa so van -> ben dan o van cuoi; con lai -> hoa
    ss = [s for s in ss if s[0] is not None and s[1] is not None]
    if not ss: return None
    a = sum(x > y for x, y in ss); b = sum(y > x for x, y in ss)
    if a != b: return 'A' if a > b else 'B'
    x, y = ss[-1]; return 'A' if x > y else 'B' if y > x else 'draw'
def P(*a): print(*a); LOG.append(' '.join(str(x) for x in a))
LOG = []
def objective(S, name):
    k = sum(r['ok'] for r in S); ck = sum(cells(r)[0] for r in S); cn = sum(cells(r)[1] for r in S)
    sk = sum(sets(r)[0] for r in S); sn = sum(sets(r)[1] for r in S)
    wk = sum(winner(r['ai']) == winner(r['truth']) for r in S)
    P(f'[{name}] n={len(S)}'); P('  exact match cap anh:', pct(k, len(S)))
    P('  dung cap o diem   :', pct(ck, cn)); P('  dung cap van      :', pct(sk, sn))
    P('  dung ben dan/thang:', pct(wk, len(S)))
    P('  Likert1 TB (bootstrap):', fm(boot_mean([r['l1'] for r in S])), dict(sorted(Counter(r['l1'] for r in S).items())))
    P('  Likert2 TB (bootstrap):', fm(boot_mean([r['l2'] for r in S])), dict(sorted(Counter(r['l2'] for r in S).items())))
P('=== 1. CHI SO KHACH QUAN (CI 95%%: Wilson cho ti le, bootstrap B=%d cho trung binh, seed=%d) ===' % (B, SEED))
objective(R, 'Tong')
P('  so o diem bi nhan doi khi le van: tinh theo max(so van that, so van AI) x 2')

# ---------- 2. So sanh nhom ----------
def rank_biserial(x, y):
    u = stats.mannwhitneyu(x, y, alternative='two-sided'); return u.pvalue, 2 * u.statistic / (len(x) * len(y)) - 1
def compare(A, Bg, na, nb):
    P(f'\n--- {na} (n={len(A)}) vs {nb} (n={len(Bg)}) ---')
    a, b = sum(r['ok'] for r in A), sum(r['ok'] for r in Bg)
    orr, p = stats.fisher_exact([[a, len(A) - a], [b, len(Bg) - b]])
    P(f'  exact: {pct(a, len(A))} vs {pct(b, len(Bg))}; chenh lech = {100*(a/len(A)-b/len(Bg)):.1f} diem %; OR={orr:.2f}; Fisher p={p:.3f}')
    for k in ('l1', 'l2'):
        x, y = [r[k] for r in A], [r[k] for r in Bg]; p, rb = rank_biserial(x, y)
        P(f'  {k}: TB {np.mean(x):.2f} vs {np.mean(y):.2f}; Mann-Whitney p={p:.3f}; rank-biserial r={rb:.2f}')
    for nm, S in ((na, A), (nb, Bg)): objective(S, nm)
P('\n=== 2. SO SANH NHOM ===')
compare([r for r in R if r['model'] == 'gemini'], [r for r in R if r['model'] == 'cloudflare'], 'Gemini', 'Cloudflare')
compare([r for r in R if r['set'] == 'real32'], [r for r in R if r['set'] == 'rf80'], 'Anh that', 'Roboflow')
P('  bang cheo model x bo:', dict(Counter((r['model'], r['set']) for r in R)))

# ---------- 3. Conf nhu bo phan loai ----------
def auroc(score, y):
    pos = [s for s, t in zip(score, y) if t]; neg = [s for s, t in zip(score, y) if not t]
    if not pos or not neg: return float('nan')
    return sum((p > n) + 0.5 * (p == n) for p in pos for n in neg) / (len(pos) * len(neg))
def auroc_ci(score, y):
    score, y = np.asarray(score), np.asarray(y); vals = []
    for _ in range(B):
        i = rng.integers(0, len(y), len(y))
        if y[i].all() or not y[i].any(): continue
        vals.append(auroc(score[i], y[i]))
    return auroc(score, y), *np.percentile(vals, [2.5, 97.5])
y = [r['ok'] for r in R]; s = [r['c'] for r in R]
P('\n=== 3. DIEM TIN CAY NHU BO PHAN LOAI DUNG/SAI (nhan duong = exact match; AI khong tra -> conf 0) ===')
P('  phan bo conf:', dict(sorted(Counter(s).items())))
P('  conf TB ca dung:', fm(boot_mean([r['c'] for r in R if r['ok']])), ' ca sai:', fm(boot_mean([r['c'] for r in R if not r['ok']])))
A1 = auroc_ci(s, y); P('  AUROC (tat ca 59):', fm(A1))
R57 = [r for r in R if r['conf'] is not None]
A2 = auroc_ci([r['c'] for r in R57], [r['ok'] for r in R57]); P('  AUROC (57 anh AI co tra ket qua):', fm(A2))
# ECE: bins (0,0.9],(0.9,0.95],(0.95,0.99],(0.99,1]
edges = [-0.01, 0.9, 0.95, 0.99, 1.0]; ece = 0; rel = []
for lo, hi in zip(edges[:-1], edges[1:]):
    S = [r for r in R if lo < r['c'] <= hi]
    if not S: continue
    acc = np.mean([r['ok'] for r in S]); cf = np.mean([r['c'] for r in S]); ece += len(S) / N * abs(acc - cf)
    rel.append((lo, hi, len(S), cf, acc, *wilson(sum(r['ok'] for r in S), len(S))[1:]))
    P(f'  bin ({lo:.2f},{hi:.2f}]: n={len(S)} conf TB={cf:.3f} acc={acc:.3f}')
P(f'  ECE = {ece:.3f}')
P('  Bang nguong (tu chot khi conf >= t):')
P('  t     | tu chot | sai lot | precision [Wilson]          | ca dung bi giu lai')
thr = []
for t in (0.0, 0.80, 0.90, 0.95, 0.99, 1.00):
    S = [r for r in R if r['conf'] is not None and r['c'] >= t]; k = sum(r['ok'] for r in S)
    held = sum(r['ok'] for r in R) - k; thr.append((t, len(S), len(S) - k, k / len(S) if S else float('nan'), held))
    P(f'  {t:.2f}  | {len(S):7d} | {len(S)-k:7d} | {pct(k, len(S)):27s} | {held}')

# ---------- 4. Bo phan tang da tin hieu (post-hoc) ----------
def set_valid(x, y, last):
    hi, lo = max(x, y), min(x, y)
    done = (hi == 21 and lo <= 19) or (22 <= hi <= 30 and hi - lo == 2 and hi < 30) or (hi == 30 and lo in (28, 29))
    if done: return True
    if not last: return False
    return hi <= 21 or (hi <= 30 and hi - lo <= 1 and lo >= 20)  # van dang danh, chua vuot nguong ket thuc
def rules_ok(ss):
    if not ss or len(ss) > 3: return False
    ss2 = [s for s in ss if s != [0, 0]]
    if not ss2: return False
    for i, (x, y) in enumerate(ss2):
        if not set_valid(x, y, i == len(ss2) - 1): return False
    w = [x > y for x, y in ss2[:-1]]
    return not (len(ss2) == 3 and len(set(w)) == 1)  # 2-0 roi van khong co van 3
def tier(r):
    if r['conf'] is None or not r['ai']: return 'Do'
    z = [0, 0] in r['ai']; rv = rules_ok(r['ai'])
    if r['c'] >= 0.95 and r['mapped'] and rv and not z: return 'Xanh'
    if not rv and r['c'] < 0.95: return 'Do'
    return 'Vang'
for r in R: r['tier'] = tier(r); r['rules'] = rules_ok(r['ai']) if r['ai'] else False
def tier_why(r):  # cac dieu kien Xanh khong dat (rong = dat het)
    if r['conf'] is None or not r['ai']: return ['AI khong tra ket qua']
    return [m for c, m in ((r['c'] >= 0.95, 'conf<0.95'), (r['mapped'], 'khong tu ghep cot theo ten'),
                           (r['rules'], 'vi pham luat diem'), ([0, 0] not in r['ai'], 'co van 0-0')) if not c]
for r in R: r['tierWhy'] = tier_why(r)
P('\n=== 4. PHAN TANG DA TIN HIEU (POST-HOC, khong dung ground truth de quyet dinh) ===')
P('  Xanh: conf>=0.95 VA ghep cot tu dong theo ten VA moi van hop le theo luat VA khong co van 0-0')
P('  Do  : AI khong tra ket qua, hoac (vi pham luat VA conf<0.95); con lai Vang')
P('  vi pham luat:', sum(not r['rules'] for r in R), ' co van 0-0:', sum([0, 0] in r['ai'] for r in R), ' tu ghep cot:', sum(r['mapped'] for r in R))
tiers = {}
for T in ('Xanh', 'Vang', 'Do'):
    S = [r for r in R if r['tier'] == T]; k = sum(r['ok'] for r in S); tiers[T] = (len(S), k)
    P(f'  {T}: {len(S)} anh, dung {pct(k, len(S)) if S else "-"}; sai lot vao: {[r["f"] for r in S if not r["ok"]]}')
S = [r for r in R if r['prod'] == 'green']; k = sum(r['ok'] for r in S)
P(f'  Doi chung - muc green cua he thong hien tai: {len(S)} anh, dung {pct(k, len(S))}; sai: {[r["f"] for r in S if not r["ok"]]}')
S = [r for r in R if r['conf'] is not None and r['c'] >= 0.95]; k = sum(r['ok'] for r in S)
P(f'  Doi chung - chi conf>=0.95: {len(S)} anh, dung {pct(k, len(S))}')
for nm, f in (('bo luat', lambda r: r['rules']), ('bo 0-0', lambda r: [0, 0] not in r['ai']), ('bo ghep ten', lambda r: r['mapped'])):
    pass

# ---------- 5. Do tin cay nhan ----------
yc = [r['ai'] == r['claude'] for r in R]
agree_lbl = sum(r['claude'] == r['truth'] for r in R)
a = sum(p and c for p, c in zip(y, yc)); b = sum(p and not c for p, c in zip(y, yc))
c_ = sum((not p) and c for p, c in zip(y, yc)); d = sum((not p) and (not c) for p, c in zip(y, yc))
po = (a + d) / N; pe = ((a + b) * (a + c_) + (c_ + d) * (b + d)) / N ** 2; kappa = (po - pe) / (1 - pe)
kb = []
yy, yyc = np.array(y), np.array(yc)
for _ in range(B):
    i = rng.integers(0, N, N); p1, p2 = yy[i], yyc[i]; o = (p1 == p2).mean()
    e = p1.mean() * p2.mean() + (1 - p1.mean()) * (1 - p2.mean())
    if e < 1: kb.append((o - e) / (1 - e))
P('\n=== 5. DO TIN CAY NHAN (Claude doc bang mat vs PO) ===')
P('  trung ti so that:', pct(agree_lbl, N), ' khac:', [r['f'] for r in R if r['claude'] != r['truth']])
P(f'  bang 2x2 dung/sai (PO hang, Claude cot): [[{a},{b}],[{c_},{d}]]; dong thuan={po:.3f}; Cohen kappa={kappa:.3f} [bootstrap {np.percentile(kb,2.5):.3f}; {np.percentile(kb,97.5):.3f}]')

# ---------- 6. Taxonomy tu dong ----------
def taxo(r):
    t, a_ = r['truth'], r['ai']
    if r['ok']: return 'Dung'
    if not a_: return 'Khong doc duoc'
    if len(a_) == len(t) and len(t) == 2 and a_ == [[t[0][0], t[1][0]], [t[0][1], t[1][1]]]: return 'Doc cot thanh hang'
    if len(a_) > len(t): return 'Thua van'
    if len(a_) < len(t): return 'Thieu van'
    return 'Sai chu so/o diem'
for r in R: r['taxo'] = taxo(r)
P('\n=== 6. TAXONOMY TU DONG (quy tac cau truc, so voi ground truth) ===')
tx = Counter(r['taxo'] for r in R)
for k_, v in tx.most_common():
    P(f'  {k_}: {v} ({100*v/N:.1f}%)  {[r["f"] for r in R if r["taxo"] == k_] if k_ != "Dung" else ""}')
    if k_ != 'Dung': P('     Likert1:', dict(Counter(r['l1'] for r in R if r['taxo'] == k_)), ' sai ben dan:', sum(winner(r['ai']) != winner(r['truth']) for r in R if r['taxo'] == k_))

# ---------- 7. Hinh ----------
plt.rcParams.update({'font.size': 10})
fig, ax = plt.subplots(1, 2, figsize=(10, 3.8))
groups = [('Gemini', lambda r: r['model'] == 'gemini'), ('Cloudflare', lambda r: r['model'] == 'cloudflare'),
          ('Ảnh thật', lambda r: r['set'] == 'real32'), ('Roboflow', lambda r: r['set'] == 'rf80')]
for k_, a_ in zip(('l1', 'l2'), ax):
    w = 0.2
    for gi, (nm, fn) in enumerate(groups):
        S = [r for r in R if fn(r)]; cnt = Counter(r[k_] for r in S)
        a_.bar(np.arange(1, 6) + (gi - 1.5) * w, [cnt[v] / len(S) for v in range(1, 6)], w, label=f'{nm} (n={len(S)})')
    a_.set_xticks(range(1, 6)); a_.set_xlabel('Mức Likert'); a_.set_ylabel('Tỉ lệ ảnh')
    a_.set_title('Likert ① đọc đúng tỉ số' if k_ == 'l1' else 'Likert ② gán đúng người chơi')
ax[0].legend(fontsize=8); fig.tight_layout(); fig.savefig(f'{FIG}/fig1-likert-theo-nhom.png', dpi=200); plt.close(fig)

fig, a_ = plt.subplots(figsize=(4.6, 4.2))
a_.plot([0, 1], [0, 1], '--', color='gray', label='Hiệu chuẩn hoàn hảo')
for lo, hi, n, cf, acc, wl, wh in rel:
    a_.errorbar(cf, acc, yerr=[[acc - wl], [wh - acc]], fmt='o', capsize=3, color='C0')
    a_.annotate(f'n={n}', (cf, acc), textcoords='offset points', xytext=(6, -10), fontsize=8)
a_.set_xlim(-0.02, 1.02); a_.set_ylim(-0.02, 1.02); a_.set_xlabel('Điểm tin cậy trung bình trong bin'); a_.set_ylabel('Tỉ lệ đọc đúng (exact)')
a_.set_title(f'Biểu đồ reliability (ECE = {ece:.3f})'); a_.legend(fontsize=8, loc='upper left'); fig.tight_layout()
fig.savefig(f'{FIG}/fig2-reliability.png', dpi=200); plt.close(fig)

fig, a_ = plt.subplots(figsize=(4.6, 4.2))
ts = sorted(set(s), reverse=True); P_, N_ = sum(y), N - sum(y)
fpr, tpr = [0], [0]
for t in ts:
    tpr.append(sum(1 for si, yi in zip(s, y) if si >= t and yi) / P_); fpr.append(sum(1 for si, yi in zip(s, y) if si >= t and not yi) / N_)
a_.plot(fpr, tpr, 'o-', label=f'conf (AUROC = {A1[0]:.2f} [{A1[1]:.2f}; {A1[2]:.2f}])'); a_.plot([0, 1], [0, 1], '--', color='gray', label='Ngẫu nhiên')
a_.set_xlabel('Tỉ lệ ảnh sai bị tự chốt (FPR)'); a_.set_ylabel('Tỉ lệ ảnh đúng được tự chốt (TPR)'); a_.set_title('Đường ROC của điểm tin cậy'); a_.legend(fontsize=8, loc='lower right')
fig.tight_layout(); fig.savefig(f'{FIG}/fig3-roc.png', dpi=200); plt.close(fig)

fig, a_ = plt.subplots(figsize=(6, 3.8))
xs = [f'≥{t:.2f}' for t, *_ in thr]
a_.bar(xs, [n - w for t, n, w, p, h in thr], label='Tự chốt – đọc đúng', color='C2')
a_.bar(xs, [w for t, n, w, p, h in thr], bottom=[n - w for t, n, w, p, h in thr], label='Tự chốt – đọc sai (lọt)', color='C3')
a2 = a_.twinx(); a2.plot(xs, [p for t, n, w, p, h in thr], 'ko-', label='Precision'); a2.set_ylim(0, 1); a2.set_ylabel('Precision')
a_.set_xlabel('Ngưỡng điểm tin cậy'); a_.set_ylabel('Số ảnh'); a_.set_title('Số ảnh tự chốt và số ảnh sai lọt theo ngưỡng')
a_.legend(loc='lower left', fontsize=8); a2.legend(loc='lower right', fontsize=8); fig.tight_layout()
fig.savefig(f'{FIG}/fig4-nguong.png', dpi=200); plt.close(fig)

open(f'{OUT}/ket-qua-analyze.txt', 'w', encoding='utf-8').write('\n'.join(LOG) + '\n')
json.dump([{k_: r[k_] for k_ in ('f', 'set', 'model', 'conf', 'ok', 'l1', 'l2', 'mapped', 'rules', 'tier', 'tierWhy', 'taxo', 'prod', 'prodReasons')} for r in R],
          open(f'{OUT}/per-image.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

# ---------- 3b. Do nhay: dinh nghia "sai" theo stats-59.py (Likert1<=2, bo 2 anh conf null) ----------
LOG.append('')
P('=== 3b. DO NHAY: sai = Likert1<=2, chi 57 anh co conf (dinh nghia cua stats-59.py) ===')
y2 = [r['l1'] >= 3 for r in R57]; s2 = [r['c'] for r in R57]
P('  conf TB L1>=4:', fm(boot_mean([r['c'] for r in R57 if r['l1'] >= 4])), ' L1<=2:', fm(boot_mean([r['c'] for r in R57 if r['l1'] <= 2])))
P('  AUROC (duong = L1>=3):', fm(auroc_ci(s2, y2)))
for t in (0.80, 0.90, 0.95, 0.99, 1.00):
    S = [r for r in R57 if r['c'] >= t]; P(f'  t>={t:.2f}: tu chot {len(S)}, trong do L1<=2: {sum(r["l1"] <= 2 for r in S)}')
open(f'{OUT}/ket-qua-analyze.txt', 'w', encoding='utf-8').write('\n'.join(LOG) + '\n')
