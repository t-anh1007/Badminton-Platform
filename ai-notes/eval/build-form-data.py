# Gop du lieu 32 + 80 anh thanh likert-data.js cho trang likert-form.html. File nhap.
import csv, json
rows = []
# Bo 32: tu likert-real.csv (ti so that da doi chieu, ket qua AI, ghep cot)
for i, r in enumerate(csv.DictReader(open('ai-notes/eval/likert-real.csv', encoding='utf-8-sig'))):
    rows.append(dict(set='real32', id=r['file'], img='samples-internet/' + r['file'], group=r['nhom'],
        truth=json.loads(r['ti_so_that']), ai=json.loads(r['ai_doc']), conf=float(r['min_conf']) if r['min_conf'] else None,
        model=r['model'], names=r['ten_tren_anh'], teamA=r['doi_A'], teamB=r['doi_B'], ghep=r['ghep_cot'], note=''))
# Bo 80: ket qua AI + ti so doc bang mat + ghep cot
res = {x['file']: x for x in json.load(open('ai-notes/eval/results-rf80.json', encoding='utf-8'))}
mp = json.load(open('ai-notes/eval/map-rf80.json', encoding='utf-8'))
for r in csv.DictReader(open('ai-notes/eval/samples-internet/roboflow80/roboflow80_index.csv', encoding='utf-8-sig')):
    f = r['file']; x = res[f]; m = mp[f]
    truth = [[int(v) for v in s.split('-')] for s in r['ti_so_mat_doc'].split(';')]
    rows.append(dict(set='rf80', id=f, img='samples-internet/roboflow80/' + f, group='roboflow_' + r['video'],
        truth=truth, ai=[[a, b] for a, b in (x['sets'] or [])], conf=x['minConf'], model=(x['model'] or '').split(':')[0],
        names=m['ten_tren_anh'], teamA=m['doi_A'], teamB=m['doi_B'], ghep=m['ghep'],
        note='cột nhỏ bên trái là số ván thắng, không tính là một ván' if r['video'] == 'frame1' else ''))
# Them dong "that" (ai nhan diem nao) va "he thong gan" (sau khi ghep cot) de nguoi cham tu kiem
mr = json.load(open('ai-notes/eval/map-real.json', encoding='utf-8'))
for r in rows:  # bo 32: lay doi/ghep tu map-real.json moi nhat (CSV co the cu)
    if r['set'] == 'real32': m = mr[r['id']]; r['teamA'], r['teamB'], r['ghep'] = m['doi_A'], m['doi_B'], m['ghep']
def col(sets, j): return ' · '.join('?' if s[j] is None else str(s[j]) for s in sets) if sets else '—'
for r in rows:
    m = mr.get(r['id']) if r['set'] == 'real32' else mp[r['id']]
    top, bottom = m.get('top'), m.get('bottom')
    raw = m.get('ket_qua_ghep', m.get('raw'))
    r['truthWho'] = f"{top}: {col(r['truth'], 0)}  |  {bottom}: {col(r['truth'], 1)}" if top else 'bảng không in tên người chơi'
    if raw in (None, 'khong_tu_ghep'):
        r['aiWho'] = 'chưa gán — hệ thống yêu cầu người khai chọn cột'
    else:
        a, b = (0, 1) if raw == 'left_is_A' else (1, 0)
        r['aiWho'] = f"Đội A {r['teamA']}: {col(r['ai'], a)}  |  Đội B {r['teamB']}: {col(r['ai'], b)}"
for i, r in enumerate(rows, 1): r['idx'] = i
# Ket qua hien thi cho nguoi khai (buildDraft, xem draft-sim.mts)
ds = json.load(open('ai-notes/eval/draft-sim.json', encoding='utf-8'))
for r in rows: r['shown'] = ds[r['id']]
# Nhan do Claude doc bang mat: tach ra file rieng (chi dung de do do dong thuan sau nay), KHONG dua vao trang cham
json.dump({r['id']: r['truth'] for r in rows}, open('ai-notes/eval/likert-truth-claude.json', 'w', encoding='utf-8'), ensure_ascii=False)
page = [{k: v for k, v in r.items() if k not in ('truth', 'truthWho')} for r in rows]
for p, r in zip(page, rows):
    mm = (mr.get(r['id']) if r['set'] == 'real32' else mp[r['id']]) or {}
    p['top'], p['bottom'] = mm.get('top'), mm.get('bottom')
open('ai-notes/eval/likert-data.js', 'w', encoding='utf-8').write('window.DATA = ' + json.dumps(page, ensure_ascii=False) + ';\n')
same = sum(r['truth'] == r['ai'] for r in rows)
print(len(rows), 'anh; AI doc khop ti so that:', same)
for s in ('real32', 'rf80'):
    sub = [r for r in rows if r['set'] == s]
    print(s, len(sub), 'khop', sum(r['truth'] == r['ai'] for r in sub), 'ghep', {g: sum(r['ghep'] == g for r in sub) for g in ('dung', 'trao', 'khong_tu_ghep')})
