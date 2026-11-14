"""KOBIS 상영스케줄 원본(JSON) → 엑셀 변환.
시놉시스는 원본 JSON에만 남기고 엑셀에서는 뺌(줄거리, 키워드는 KMDb API로 추가 예정).
원본 JSON은 KOBIS 상영스케줄 페이지(findSchedule.do, searchMovieDtl.do)에서 받은 것.
사용: python kobis_to_excel.py raw/kobis_raw_20261101.json (생략하면 raw/kobis_raw_20261030.json)
"""
import json, re, sys, html
from pathlib import Path
import pandas as pd
from openpyxl.styles import Font
from datetime import date
from pricing import CLOSED, THEATERS as TH, KIND_KO, price

src = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).with_name('raw') / 'kobis_raw_20261030.json'
d = json.load(open(src, encoding='utf-8'))
fetched = (pd.Timestamp(d['fetched']).tz_convert('Asia/Seoul')).strftime('%Y-%m-%d')  # 한국 시간 기준

# 극장 구분과 좌표 (좌표: 문화_영화상영관.csv EPSG:5174 → 위경도)
KIND = {'CGV': '멀티플렉스', '롯데시네마': '멀티플렉스', '메가박스': '멀티플렉스',
        'KT&G 상상마당': '독립예술영화관', '인디스페이스': '독립예술영화관', '라이카시네마': '독립예술영화관',
        '아트하우스모모': '독립예술영화관', '필름포럼': '독립예술영화관', '베스트슬립': '기타'}
COORD = {'001222': (37.55643, 126.92276), '001272': (37.55607, 126.92209), '001144': (37.55733, 126.92531),
         '001283': (37.55767, 126.92590), '001146': (37.55100, 126.92103), '001193': (37.55719, 126.92476),
         '001282': (37.56517, 126.93093), '001148': (37.56256, 126.94745), '001149': (37.56413, 126.94452),
         '001297': (37.55443, 126.92125)}
th = [t for t in d['theaters'] if t['cd'] not in CLOSED]
for t in th:
    t['name'] = TH[t['cd']][0]
theater_name = {t['cd']: t['name'] for t in th}

# 상영표: 한 줄 = 한 회차
rows = []
for cd, dt, mcd, mnm, scrn, tms in d['rows']:
    if cd in CLOSED:
        continue
    m = re.search(r'\(([^()]*)\)\s*$', mnm)
    fmt = m.group(1) if m else ''
    for tm in tms.split(','):
        tm = tm.strip()
        if not tm:
            continue
        rows.append({'날짜': f'{dt[:4]}-{dt[4:6]}-{dt[6:]}', '시작': f'{tm[:2]}:{tm[2:]}',
                     '극장': theater_name[cd], '상영관': scrn, '영화코드': mcd,
                     '영화': None, '상영방식': html.unescape(fmt), '극장코드': cd})

# 영화 정보
movies = []
for mcd, x in d['movies'].items():
    parts = [p.strip() for p in x.get('summary', '').split('|') if p.strip()]
    kind = parts[1] if len(parts) > 1 else ''
    genre = parts[2] if len(parts) > 2 else ''
    run = next((p for p in parts if '분' in p), '')
    run_min = int(re.match(r'(\d+)', run).group(1)) if re.match(r'(\d+)', run) else None
    rating = next((p for p in parts if '관람' in p), '')
    country = parts[-1] if parts and parts[-1] not in (run, rating, genre, kind) else ''
    img = x.get('img', '')
    movies.append({'영화코드': mcd, '제목': html.unescape(x.get('title', '')), '구분': kind, '장르': genre,
                   '러닝타임(분)': run_min, '관람등급': rating, '국가': country,
                   '개봉일': '' if '없음' in x.get('open', '') else x.get('open', ''),
                   '예술영화 인정': 'Y' if '인정' in x.get('art', '') else '',
                   '홍보 문구': html.unescape(x.get('promo', '')),
                   '포스터': ('https://www.kobis.or.kr' + img) if img else ''})
mv = pd.DataFrame(movies)
title = dict(zip(mv['영화코드'], mv['제목']))

st = pd.DataFrame(rows)
st['영화'] = st['영화코드'].map(title)
st = st.sort_values(['날짜', '극장', '시작']).reset_index(drop=True)
first = st.groupby(['극장코드', '날짜'])['시작'].transform('min')
pr = [price(r.극장코드, date.fromisoformat(r.날짜), r.시작, r.시작 == f, r.상영관, r.상영방식) for r, f in zip(st.itertuples(), first)]
st['가격'] = [x[0] for x in pr]
st['가격 메모'] = [x[1] for x in pr]
st = st[['날짜', '시작', '극장', '상영관', '영화', '상영방식', '가격', '가격 메모', '영화코드', '극장코드']]

# 영화별 상영 규모
agg = st.groupby('영화코드').agg(상영극장수=('극장', 'nunique'), 회차수=('시작', 'size'),
                                  첫상영일=('날짜', 'min'), 마지막상영일=('날짜', 'max')).reset_index()
mv = mv.merge(agg, on='영화코드', how='left').sort_values('회차수', ascending=False)
mv = mv[['영화코드', '제목', '구분', '장르', '러닝타임(분)', '관람등급', '국가', '개봉일', '예술영화 인정',
         '상영극장수', '회차수', '첫상영일', '마지막상영일', '홍보 문구', '포스터']]

# 극장
cnt = st.groupby('극장코드').size()
ths = []
for t in th:
    kind = KIND_KO[TH[t['cd']][1]]
    lat, lng = TH[t['cd']][3] or (None, None)
    n = int(cnt.get(t['cd'], 0))
    ths.append({'극장코드': t['cd'], '극장': t['name'], '구': t['gu'], '구분': kind, '회차수': n,
                '홈페이지': t.get('url', ''), '위도': lat, '경도': lng,
                '동네': TH[t['cd']][2]})
thdf = pd.DataFrame(ths)

info = pd.DataFrame({'항목': ['수집일', '출처', '범위', '기간', '가격', '빈 데이터', '좌표'],
                      '내용': [fetched, 'KOBIS 영화관 입장권 통합전산망 상영스케줄, 영화 상세정보',
                               '마포구 영화관 전체 + 서대문구 라이카시네마, 아트하우스모모, 필름포럼',
                               f"{st['날짜'].min()} ~ {st['날짜'].max()}. 극장마다 공개된 날짜까지만 있음(보통 2~3일 앞까지)",
                               '일반 성인 1인. 멀티플렉스 평일(월~목) 14,000 금토일 15,000, 독립영화관은 극장 공식 요금(조조, 수요일 할인 반영). 규칙은 pricing.py, 출처는 docs/관람료_할인_정리.md',
                               '롯데시네마 합정은 폐관이라 제외. 아트하우스 모모, 베스트슬립 시네마 앳 라이즈는 요금을 못 찾아 임시값',
                               '문화_영화상영관.csv 좌표를 위경도로 변환. 메가박스 상암은 원본에 좌표 없음']})

out = src.with_name(f'상영중_영화_KOBIS_{fetched.replace("-", "")}.xlsx')
with pd.ExcelWriter(out, engine='openpyxl') as w:
    for name, df in [('상영표', st), ('영화', mv), ('극장', thdf), ('안내', info)]:
        df.to_excel(w, sheet_name=name, index=False)
        ws = w.sheets[name]
        ws.freeze_panes = 'A2'
        ws.auto_filter.ref = ws.dimensions
        for col in ws.columns:
            head = str(col[0].value)
            width = min(max(len(str(c.value or '')) for c in col[:200]) * 1.6 + 2, 60)
            ws.column_dimensions[col[0].column_letter].width = width
        for c in ws[1]:
            c.font = Font(bold=True)
print(out, len(st), '회차', len(mv), '편', len(thdf), '곳')
