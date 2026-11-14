# 잘못 잡힌 상영작 KMDb 다시 찾기 (data\상영작 폴더에서 python kmdb_fix.py)
# 미션(1986, 롤랑 조페, 영국)과 차오(2026 개봉, 아오키 야스히로, 일본 애니메이션)
# 넓게 검색한 뒤 조건에 맞는 후보 중 제목이 정확히 같은 것을 먼저 고름. 못 찾으면 그 줄의 KMDb 정보를 비움 (틀린 정보보다 빈칸)
# 결과: kmdb_now.csv의 해당 줄, kmdb_fix_report.txt (후보 목록)
import csv, getpass, json, os, sys, urllib.parse, urllib.request
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kmdb_fetch import URL, clean, row, strip_hl, year_of, directors, kr_plot

HERE = os.path.dirname(os.path.abspath(__file__))

def search(key, **params):
    q = urllib.parse.urlencode({'collection': 'kmdb_new2', 'detail': 'Y', 'ServiceKey': key, 'listCount': 100, **params})
    with urllib.request.urlopen(URL + '?' + q, timeout=30) as r:
        d = json.loads(r.read().decode('utf-8'), strict=False)
    return (d.get('Data') or [{}])[0].get('Result') or []

# 제목: (검색 조건 목록, 고르는 조건)
FIX = {
    '미션': ([{'title': '미션', 'director': '롤랑 조페'}, {'director': '롤랑 조페'}, {'director': '조페'}, {'title': '미션', 'releaseDts': '19860101', 'releaseDte': '19871231'}],
             lambda m: '조페' in directors(m) or (year_of(m) in (1986, 1987) and '영국' in (m.get('nation') or ''))),
    '차오': ([{'title': '차오'}],
             lambda m: '아오키' in directors(m) or ('일본' in (m.get('nation') or '') and (year_of(m) or 0) >= 2025)),
}
KMDB_COLS = ['KMDb 제목', 'KMDb ID', '개봉일', '제작연도', '감독', '국가', '유형', '장르', '키워드', '줄거리']

def main():
    key = getpass.getpass('KMDb API 키 (화면에 안 보임): ').strip()
    path = os.path.join(HERE, 'kmdb_now.csv')
    rows = list(csv.DictReader(open(path, encoding='utf-8-sig')))
    report = []
    for title, (queries, ok) in FIX.items():
        cands, seen = [], set()
        for p in queries:
            try:
                res = search(key, **p)
            except Exception as e:
                report.append(f'  검색 실패 {p}: {e}'); res = []
            for m in res:
                k = (m.get('movieId'), m.get('movieSeq'))
                if k not in seen:
                    seen.add(k); cands.append(m)
        good = [m for m in cands if ok(m)]
        good.sort(key=lambda m: (clean(m.get('title')) != clean(title), not kr_plot(m)))   # 제목 같은 것, 줄거리 있는 것 먼저
        report.append(f'[{title}] 검색 후보 {len(cands)}개, 조건에 맞는 후보 {len(good)}개')
        report += [f'  {strip_hl(m.get("title"))} | {m.get("repRlsDate") or m.get("prodYear")} | {directors(m)} | {m.get("nation", "")} | {m.get("type", "")} | 줄거리 {"O" if kr_plot(m) else "X"}' for m in good[:10]]
        for r in rows:
            if r['제목'] != title:
                continue
            if good:
                new = row('상영작', title, '', good)
                for k in KMDB_COLS:
                    r[k] = new[k]
                r['제목 일치'] = '직접 확인'
                report.append(f'  → 고름: {new["KMDb 제목"]} {new["개봉일"] or new["제작연도"]} {new["감독"]}')
            else:
                for k in KMDB_COLS:
                    r[k] = ''
                r['제목 일치'] = '못 찾음'
                report.append('  → 못 찾음. KMDb 정보를 비움')
    with open(path, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader(); w.writerows(rows)
    with open(os.path.join(HERE, 'kmdb_fix_report.txt'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(report))
    print('\n'.join(report))

if __name__ == '__main__':
    main()
