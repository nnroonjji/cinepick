# MBTI → 상영작 추천 (data\상영작 폴더에서 실행)
#   python match_mbti.py ISTJ
#   python match_mbti.py INFP --now "2026-11-03 10:00" --top 10 --seed 1
# 1. 내 태그: MBTI 네 글자 각각의 장르 2개 + 키워드 3개 (data\mbti\extreme_pick.csv, mbti_extreme.py 결과. Drama는 뺌)
# 2. 태그 점수: 네 글자 중 그 태그가 나온 글자 수 (ISTJ의 action은 I, S, J에 나와서 3점)
# 3. 상영작 점수: 상영작 태그(now_tags.csv에서 선택된 것만) 중 겹치는 것의 점수 합
# 4. 남은 상영이 없는 영화는 뺌. 1위 점수가 같은 영화 중 오늘 남은 상영이 있는 영화에서 무작위 한 편
#    오늘 상영이 없으면 가장 빠른 상영 날짜의 영화 중 무작위. --seed로 고정 가능
# 5. 추천 이유: 겹친 태그와 그 태그가 나온 글자
# match_picks.py(좋아하는 영화 30편)와 같은 구조. 다른 건 내 태그를 어디서 가져오는지뿐
import argparse, html, json, os, random
from datetime import datetime, timedelta
import pandas as pd
os.chdir(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join('..', 'raw', 'kobis_raw_20261101.json')
PICK = os.path.join('..', 'mbti', 'extreme_pick.csv')

ap = argparse.ArgumentParser()
ap.add_argument('mbti')
ap.add_argument('--now', default=datetime.now().strftime('%Y-%m-%d %H:%M'))
ap.add_argument('--top', type=int, default=10)
ap.add_argument('--seed', type=int, default=None)
a = ap.parse_args()
now = datetime.strptime(a.now, '%Y-%m-%d %H:%M')
mbti = a.mbti.upper()
if len(mbti) != 4 or any(c not in pair for c, pair in zip(mbti, ['EI', 'NS', 'FT', 'JP'])):
    raise SystemExit(f'MBTI 네 글자가 아님: {a.mbti}')

pick = pd.read_csv(PICK)
nw = pd.read_csv('now_tags.csv'); nw = nw[nw['선택'] == 'Y']

tag_from = {}   # 태그 → 그 태그가 나온 글자
for letter in mbti:
    for t in pick.loc[pick['글자'] == letter, '태그']:
        tag_from.setdefault(t, []).append(letter)

with open(RAW, encoding='utf-8') as f:
    raw = json.load(f)
title_of = {c: html.unescape(m.get('title', '')).strip() for c, m in raw['movies'].items()}
theater = {t['cd']: t['name'] for t in raw['theaters']}
next_show = {}
for th, day, code, _, screen, hms in raw['rows']:
    for hm in hms.split(','):   # 한 줄에 상영 시각이 여러 개 (1950,2200). 24시 넘는 시각(2530)은 다음 날
        hm = hm.strip()
        if not hm.isdigit():
            continue
        when = datetime.strptime(day, '%Y%m%d') + timedelta(hours=int(hm[:-2]), minutes=int(hm[-2:]))
        if when >= now:
            t = title_of[code]
            if t not in next_show or when < next_show[t][0]:
                next_show[t] = (when, theater.get(th, th))

rows = []
for title, g in nw.groupby('제목'):
    hit = [t for t in g['태그'] if t in tag_from]
    score = sum(len(tag_from[t]) for t in hit)
    if score == 0 or title not in next_show:   # 겹치는 태그가 없거나 남은 상영 없음
        continue
    ns = next_show[title]
    rows.append({'제목': title, '점수': score, '겹친 태그 수': len(hit), '가장 빠른 상영': f"{ns[0]:%m/%d %H:%M} {ns[1]}", '_t': ns[0],
                 '추천 이유': ' / '.join(f"{t}({', '.join(tag_from[t])})" for t in sorted(hit, key=lambda t: -len(tag_from[t])))})
out = pd.DataFrame(rows, columns=['제목', '점수', '겹친 태그 수', '가장 빠른 상영', '_t', '추천 이유'])
out = out.sort_values(['점수', '_t', '제목'], ascending=[False, True, True])
print(f'MBTI: {mbti} / 기준 시각 {now:%Y-%m-%d %H:%M}')
print(f"내 태그 (점수): {', '.join(f'{t}({len(v)})' for t, v in sorted(tag_from.items(), key=lambda kv: -len(kv[1])))}")
print(f"겹치는 상영작 {len(out)}편 / 전체 {nw['제목'].nunique()}편\n")
if out.empty:
    print('추천할 상영작 없음')
else:
    tie = out[out['점수'] == out['점수'].max()]
    day = tie['_t'].map(lambda w: w.date())
    first_day = now.date() if (day == now.date()).any() else day.min()
    pool = tie[day == first_day]
    best = pool.iloc[random.Random(a.seed).randrange(len(pool))]
    print(f"추천: {best['제목']} ({best['점수']}점, {best['가장 빠른 상영']})")
    print(f"이유: {best['추천 이유']}")
    print(f"1위 점수 {len(tie)}편 중 {'오늘' if first_day == now.date() else f'{first_day:%m/%d}'} 상영 {len(pool)}편에서 무작위: {', '.join(pool['제목'])}")
    print()
    print(out.drop(columns='_t').head(a.top).to_string(index=False))
out.drop(columns='_t').to_csv('match_mbti_result.csv', index=False, encoding='utf-8-sig')
