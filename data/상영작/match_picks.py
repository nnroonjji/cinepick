# 좋아하는 영화(30편 중 고른 것) → 비슷한 상영작 추천 (data\상영작 폴더에서 실행)
#   python match_picks.py 벌새 라라랜드 "헤어질 결심"
#   python match_picks.py 벌새 --now "2026-11-03 10:00" --top 10
#   python match_picks.py 벌새 라라랜드 --mbti INFP   (MBTI를 주면 의외성 규칙을 씀)
# 1. 태그 점수: 고른 영화 중 그 태그가 붙은 편수 (2편에 다 있으면 2점)
# 2. 상영작 점수: 상영작 태그 중 고른 영화 태그와 겹치는 것의 점수 합 (교집합). 유형(animation, documentary)과 영진위 인정(art house, independent film)도 같은 태그로 셈
# 3. 남은 상영이 없는 영화는 뺌 (상영 일정은 KOBIS 원본)
#    동점 순서 (채은 결정 11/4): 겹친 점수 1위 → MBTI 방향(의외성) → 오늘 남은 상영(없으면 가장 빠른 날짜) → 무작위
#    --seed로 무작위 결과를 고정할 수 있음
# 3-1. MBTI는 의외성 선호에만 씀 (채은 결정 11/3). MBTI 글자별 태그 점수는 합친 추천에 안 씀 (MBTI만 추천은 match_mbti.py)
# 3-2. 의외성 (--mbti를 줬을 때): 논문처럼 취향에 맞는 후보를 넉넉히 두고 그 안에서 새로운 영화를 고름
#    의외성 선호(+): 겹친 점수가 1위의 절반 이상인 영화 중 의외성 최고 → 오늘 상영 → 무작위
#    0이나 익숙함 선호(−): 겹친 점수 1위 중 (−면 의외성 최저) → 오늘 상영 → 무작위
#    의외성 = 고른 영화들과 상영작의 태그 차이. 고른 영화마다 코사인 거리(1 − 겹친 태그 수 ÷ √(두 영화 태그 수의 곱))를 내서 평균
#    Nguyen 외(2018)가 Tag Genome 공간에서 쓴 방식을 우리 태그(genome 태그 이름)로 그대로 옮김
#    선호 방향: 아래 SEREN_OR 참고 (논문 효과 크기 반영)
# 추천은 1위 한 편. 나머지 순위는 match_result.csv에 저장
# 4. 추천 이유: 겹친 태그와 그 태그가 붙은 고른 영화
# 태그는 tag_movies.py 결과(picks_tags.csv, now_tags.csv)에서 선택된 것(Y)만 씀
import argparse, glob, html, json, math, os, random
from datetime import datetime, timedelta
import pandas as pd
os.chdir(os.path.dirname(os.path.abspath(__file__)))
RAW = sorted(glob.glob(os.path.join('..', 'raw', 'kobis_raw_*.json')))[-1]  # 가장 최근 상영작 원본 (파일 이름의 날짜 순, 11/4부터)

ap = argparse.ArgumentParser()
ap.add_argument('picks', nargs='+')
ap.add_argument('--now', default=datetime.now().strftime('%Y-%m-%d %H:%M'))
ap.add_argument('--top', type=int, default=10)
ap.add_argument('--seed', type=int, default=None)
ap.add_argument('--mbti', default=None)
a = ap.parse_args()
now = datetime.strptime(a.now, '%Y-%m-%d %H:%M')

pk = pd.read_csv('picks_tags.csv'); pk = pk[pk['선택'] == 'Y']
nw = pd.read_csv('now_tags.csv'); nw = nw[nw['선택'] == 'Y']
miss = [p for p in a.picks if p not in set(pk['제목'])]
if miss:
    raise SystemExit(f'30편에 없는 제목: {miss}')

tag_from = {}   # 태그 → 그 태그가 붙은 고른 영화
for p in a.picks:
    for t in pk.loc[pk['제목'] == p, '태그']:
        tag_from.setdefault(t, []).append(p)

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

pt = {f: set(pk.loc[pk['제목'] == f, '태그']) for f in a.picks}   # 고른 영화마다 태그
POOL_RATIO = 0.5   # 의외성 선호 유형의 후보 풀: 겹친 점수가 1위 점수의 절반 이상 (채은 결정 11/3, 절반은 임의)
# 글자별 의외성 선호 (Nguyen 외 2018 결과의 방향만 씀, 채은 결정 11/3: 글자마다 같은 크기로 셈)
# I, P는 새로운 쪽 +1 / E, S, J는 익숙한 쪽 −1 / N, F, T는 0. 네 글자 합이 양수면 새로운 쪽, 음수면 익숙한 쪽, 0이면 규칙 없음
# 효과 크기(오즈비 I 1.03, E 0.82, P 1.06, J 0.86, S 0.76)대로 더하면 INFP, INTP만 새로운 쪽이 돼서 쓰지 않음
SEREN_DIR = {'E': -1, 'I': 1, 'N': 0, 'S': -1, 'F': 0, 'T': 0, 'J': -1, 'P': 1}
seren_dir = 0
if a.mbti:
    m = a.mbti.upper()
    if len(m) != 4 or any(c not in pair for c, pair in zip(m, ['EI', 'NS', 'FT', 'JP'])):
        raise SystemExit(f'MBTI 네 글자가 아님: {a.mbti}')
    seren_dir = sum(SEREN_DIR[c] for c in m)

rows = []
for title, g in nw.groupby('제목'):
    hit = [t for t in g['태그'] if t in tag_from]
    score = sum(len(tag_from[t]) for t in hit)
    if score == 0:
        continue
    ns = next_show.get(title)
    if ns is None:   # 남은 상영 없음
        continue
    my = set(g['태그'])
    seren = sum(1 - len(my & pt[f]) / (len(my) * len(pt[f])) ** 0.5 for f in a.picks) / len(a.picks)
    rows.append({'제목': title, '점수': score, '겹친 태그 수': len(hit), '의외성': round(seren, 3),
                 '가장 빠른 상영': f"{ns[0]:%m/%d %H:%M} {ns[1]}" if ns else '남은 상영 없음', '_t': ns[0] if ns else datetime.max,
                 '추천 이유': ' / '.join(f"{t}({', '.join(tag_from[t])})" for t in sorted(hit, key=lambda t: -len(tag_from[t])))})
out = pd.DataFrame(rows).sort_values(['점수', '_t', '제목'], ascending=[False, True, True]).drop(columns='_t')
print(f"고른 영화: {', '.join(a.picks)} / 기준 시각 {now:%Y-%m-%d %H:%M}")
print(f"고른 영화 태그 (점수): {', '.join(f'{t}({len(v)})' for t, v in sorted(tag_from.items(), key=lambda kv: -len(kv[1])))}")
print(f"겹치는 상영작 {len(out)}편 / 전체 {nw['제목'].nunique()}편\n")
if out.empty:
    print('추천할 상영작 없음')
else:
    best_score = out['점수'].max()
    if seren_dir > 0:   # 의외성 선호: 1위 점수의 POOL_RATIO 이상인 영화를 후보로 두고 그 안에서 의외성이 가장 높은 영화
        tie = out[out['점수'] >= best_score * POOL_RATIO]
        head = f"겹친 점수 {best_score * POOL_RATIO:g}점 이상 {len(tie)}편"
    else:
        tie = out[out['점수'] == best_score]
        head = f"1위 점수 {len(tie)}편"
    pool = tie
    note = ''
    def keep(col, high, label):
        global pool, note
        if len(pool) > 1:
            before = len(pool)
            pool = pool[pool[col] == (pool[col].max() if high else pool[col].min())]
            note += f" → {label} {before}편 중 {len(pool)}편"
    if seren_dir > 0:
        keep('의외성', True, f'의외성 높은 쪽({a.mbti.upper()}, {seren_dir:+d})')
    elif seren_dir < 0:
        keep('의외성', False, f'의외성 낮은 쪽({a.mbti.upper()}, {seren_dir:+d})')
    day = pool['제목'].map(lambda t: next_show[t][0].date())
    first_day = now.date() if (day == now.date()).any() else day.min()
    before = len(pool)
    pool = pool[day == first_day]
    note += f" → {'오늘' if first_day == now.date() else f'{first_day:%m/%d}'} 상영 {before}편 중 {len(pool)}편"
    best = pool.iloc[random.Random(a.seed).randrange(len(pool))]
    print(f"추천: {best['제목']} ({best['점수']}점, {best['가장 빠른 상영']})")
    if seren_dir > 0:   # 채은 결정 11/3: 의외성 쪽으로 고른 영화는 이유 문장을 따로
        print(f"이유: 고른 영화와 비슷하면서 새로운 영화예요 (겹친 태그: {best['추천 이유']})")
    else:
        print(f"이유: {best['추천 이유']}")
    print(f"{head}{note} → {len(pool)}편에서 무작위: {', '.join(pool['제목'])}")
    print()
    print(out.head(a.top).to_string(index=False))
out.to_csv('match_result.csv', index=False, encoding='utf-8-sig')
