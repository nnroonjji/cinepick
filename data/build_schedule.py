"""KOBIS 원본 JSON → movie-reco/data/schedule.js (앱이 읽는 상영표)
사용: python build_schedule.py raw/kobis_raw_20261101.json (생략하면 raw/kobis_raw_20261030.json)
"""
import json, re, sys, html
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

tm = json.load(open(Path(__file__).with_name('tmdb_posters.json'), encoding='utf-8'))  # 영화코드 → [TMDB id, 포스터 파일]
TMDB_IMG = 'https://image.tmdb.org/t/p/w500/'
info = {}
POSTER_FB = {}
for mcd, x in d['movies'].items():
    parts = [p.strip() for p in x.get('summary', '').split('|') if p.strip()]
    run = next((p for p in parts if '분' in p), '')
    info[movies[mcd]] = {'code': mcd, 'kind': parts[1] if len(parts) > 1 else '', 'genre': parts[2] if len(parts) > 2 else '',
                         'min': int(run.split('분')[0]) if run else None,
                         'rating': next((p for p in parts if '관람' in p), ''),
                         'tmdb': tm[mcd][0] if mcd in tm else None,
                         'poster': f'posters/now/{mcd}.jpg'}
    # 로컬 포스터가 없으면 TMDB, TMDB에도 없으면 KOBIS 썸네일
    POSTER_FB[f'posters/now/{mcd}.jpg'] = (TMDB_IMG + tm[mcd][1]) if mcd in tm else (('https://www.kobis.or.kr' + x['img']) if x.get('img') else '')
th = {v[0]: {'type': v[1], 'kind': KIND_KO[v[1]], 'area': v[2], 'll': list(v[3]) if v[3] else None, 'addr': v[4], 'url': v[5]}
      for cd, v in THEATERS.items() if cd not in CLOSED}  # 주소, 홈페이지는 pricing.py (KOBIS url은 예매 대행 사이트라 안 씀)

out = Path(__file__).resolve().parents[1] / 'movie-reco' / 'data' / 'schedule.js'
J = lambda o: json.dumps(o, ensure_ascii=False, separators=(',', ':'))
out.write_text(
    f'// 자동 생성 파일. 손으로 고치지 말 것. 원본: 데시스/data/{src.name}, 생성: 데시스/data/build_schedule.py\n'
    f'// 가격 규칙: 데시스/data/pricing.py, 조사 내용: 데시스/docs/관람료_할인_정리.md\n'
    '// THEATERS 극장 정보 · SCREENINGS 상영작 정보 · SHOWS 영화 제목별 회차 [시간, 극장, 관, 가격, 잔여석, 상영방식, 메모]\n'
    '// POSTER_FB 로컬 포스터(posters/now/영화코드.jpg)가 없을 때 쓸 주소. download-posters-now.bat로 받으면 오프라인에서도 보임\n'
    f'const THEATERS={J(th)};\nconst SCREENINGS={J(info)};\nconst POSTER_FB={J(POSTER_FB)};\nconst SHOWS={J(SHOWS)};\n', encoding='utf-8', newline='\n')  # Windows에서도 LF로 저장

# 포스터 내려받기 배치 파일 (Windows)
bat = ['@echo off', 'chcp 65001 >nul', 'cd /d "%~dp0"', 'if not exist posters\\now mkdir posters\\now', f'echo 상영작 포스터 {len(POSTER_FB)}장 받는 중...']
for local, url in POSTER_FB.items():
    if url:
        f = local.replace('/', '\\')
        bat.append(f'if not exist "{f}" curl.exe -sfL -o "{f}" "{url}" || echo 실패: {local}')
bat += ['echo 끝', 'pause']
(out.parents[1] / 'download-posters-now.bat').write_bytes(('\r\n'.join(bat) + '\r\n').encode('utf-8'))
print(out, len(shows), '회차', len(SHOWS), '편')
