"""KOBIS 원본 JSON → movie-reco/data/schedule.js (앱이 읽는 상영표)
사용: python build_schedule.py raw/kobis_raw_20261101.json (생략하면 raw/kobis_raw_20261030.json)
"""
import csv, json, re, sys, html
from datetime import date
from pathlib import Path
from pricing import CLOSED, THEATERS, KIND_KO, price

src = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).with_name('raw') / 'kobis_raw_20261030.json'
d = json.load(open(src, encoding='utf-8'))
DOW = '월화수목금토일'

def raw_fmt(nm):
    m = re.search(r'\(([^()]*)\)\s*$', nm)
    return html.unescape(m.group(1)) if m else ''

def fmt_label(nm):
    m = re.search(r'\(([^()]*)\)\s*$', nm)
    f = html.unescape(m.group(1)) if m else ''
    return {'디지털': '2D', '디지털 더빙': '2D 더빙', '3D 디지털': '3D', 'DOLBYCINEMA': 'Dolby', '4D': '4DX'}.get(f, f)

# 회차 펼치기
shows = []
for cd, dt, mcd, mnm, scrn, tms in d['rows']:
    if cd in CLOSED or cd not in THEATERS:
        continue
    for tm in tms.split(','):
        tm = tm.strip()
        if tm:
            shows.append((date(int(dt[:4]), int(dt[4:6]), int(dt[6:])), f'{tm[:2]}:{tm[2:]}', cd, mcd, scrn, fmt_label(mnm), raw_fmt(mnm)))
first = {}
for s in shows:
    k = (s[2], s[0]); first[k] = min(first.get(k, '99:99'), s[1])

movies = {mcd: html.unescape(x.get('title', '')).strip() for mcd, x in d['movies'].items()}
SHOWS = {}
for dd, tm, cd, mcd, scrn, fl, rf in sorted(shows):
    p, note = price(cd, dd, tm, first[(cd, dd)] == tm, scrn, rf)
    day_list = SHOWS.setdefault(movies[mcd], [])
    key = f'{dd.month:02d}.{dd.day:02d}'
    if not day_list or day_list[-1]['d'] != key:
        day_list.append({'d': key, 'w': DOW[dd.weekday()], 's': []})
    # [시간, 극장, 관, 가격, 잔여석(KOBIS엔 없음), 상영방식, 메모]
    day_list[-1]['s'].append([tm, THEATERS[cd][0], scrn, p, None, fl, note])

tm = json.load(open(Path(__file__).with_name('tmdb_posters.json'), encoding='utf-8'))  # 영화코드 → [TMDB id, 포스터 파일] (손으로 확인한 표)
TMDB_IMG = 'https://image.tmdb.org/t/p/w780/'
# 상영작 포스터: 배포할 때 poster_fetch.py가 만든 파일(posters/now/영화코드.jpg, 가로 800px. 저장소에는 없음)이 있으면 그 파일,
# 없으면 주소를 바로 씀: TMDB 표(w780) → KMDb(상영작/현재상영작/kmdb_now.csv 포스터 열, 가로 418px) → KOBIS 썸네일(가로 352px)
# POSTER_FB: 포스터가 안 열릴 때 앱이 대신 쓸 주소 (파일이면 위의 주소, 주소면 KOBIS 썸네일)
APP = Path(__file__).resolve().parents[1] / 'movie-reco'
kmdb, plots = {}, {}
kp = Path(__file__).with_name('상영작') / '현재상영작' / 'kmdb_now.csv'
if kp.exists():
    rows = list(csv.DictReader(open(kp, encoding='utf-8-sig')))
    kmdb = {r['제목']: r.get('포스터') or '' for r in rows}
    plots = {r['제목']: ' '.join((r.get('줄거리') or '').split()) for r in rows}  # 추천 화면에서 포스터를 누르면 보여 줄 줄거리 (KMDb)
info = {}
POSTER_FB = {}
for mcd, x in d['movies'].items():
    parts = [p.strip() for p in x.get('summary', '').split('|') if p.strip()]
    run = next((p for p in parts if '분' in p), '')
    kobis = ('https://www.kobis.or.kr' + x['img'].replace('thumb_x192/', 'thumb_x640/')) if x.get('img') else ''
    remote = (TMDB_IMG + tm[mcd][1]) if mcd in tm else (kmdb.get(movies[mcd]) or kobis)
    local = f'posters/now/{mcd}.jpg'
    poster = local if (APP / local).exists() else remote
    info[movies[mcd]] = {'code': mcd, 'kind': parts[1] if len(parts) > 1 else '', 'genre': parts[2] if len(parts) > 2 else '',
                         'min': int(run.split('분')[0]) if run else None,
                         'rating': next((p for p in parts if '관람' in p), ''),
                         'tmdb': tm[mcd][0] if mcd in tm else None,
                         'poster': poster, 'plot': plots.get(movies[mcd], '')}
    fb = remote if poster == local else kobis
    if fb and fb != poster:
        POSTER_FB[poster] = fb
th = {v[0]: {'type': v[1], 'kind': KIND_KO[v[1]], 'area': v[2], 'll': list(v[3]) if v[3] else None, 'addr': v[4], 'url': v[5]}
      for cd, v in THEATERS.items() if cd not in CLOSED}  # 주소, 홈페이지는 pricing.py (KOBIS url은 예매 대행 사이트라 안 씀)

out = Path(__file__).resolve().parents[1] / 'movie-reco' / 'data' / 'schedule.js'
J = lambda o: json.dumps(o, ensure_ascii=False, separators=(',', ':'))
out.write_text(
    f'// 자동 생성 파일. 손으로 고치지 말 것. 원본: 데시스/data/{src.name}, 생성: 데시스/data/build_schedule.py\n'
    f'// 가격 규칙: 데시스/data/pricing.py, 조사 내용: 데시스/docs/관람료_할인_정리.md\n'
    '// THEATERS 극장 정보 · SCREENINGS 상영작 정보 · SHOWS 영화 제목별 회차 [시간, 극장, 관, 가격, 잔여석, 상영방식, 메모]\n'
    '// SCREENINGS의 poster는 포스터 주소(TMDB, KMDb, KOBIS 순). POSTER_FB는 그 주소가 안 열릴 때 쓸 KOBIS 썸네일\n'
    f'const THEATERS={J(th)};\nconst SCREENINGS={J(info)};\nconst POSTER_FB={J(POSTER_FB)};\nconst SHOWS={J(SHOWS)};\n', encoding='utf-8', newline='\n')  # Windows에서도 LF로 저장

print(out, len(shows), '회차', len(SHOWS), '편')
