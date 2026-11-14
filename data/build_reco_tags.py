"""새 태그(data/상영작/tag_movies.py 결과) → movie-reco/data/tags.js, data.js PICKS 태그 (앱이 읽는 태그)
사용: data 폴더에서 python build_reco_tags.py raw/kobis_raw_20261101.json [raw/kobis_raw_20261030.json ...]
  raw JSON은 제목 → 영화코드 대응에만 씀. 여러 개 주면 앞의 것이 우선
- TAGS: 태그 → 화면 이름 (상영작/genome_tag_ko.csv 화면 이름 열). 앱의 추천 이유 문장에 씀
- NOW_TAGS: 영화코드 → 상영작 선택 태그 (상영작/now_tags.csv 선택 Y. 최대 5개 + 유형, 영진위 인정). 없는 영화(공연 등)는 추천 후보에서 빠짐
- data.js PICKS: 제목별 tags를 상영작/picks_tags.csv 선택 Y로 바꿈. picks_tags에 없는 영화(세계의 주인)는 지움
상영작을 새로 받으면: kmdb_fetch.py(채은 PC) → tag_movies.py now → 이 스크립트 → movie-reco 반영
"""
import csv, html, json, re, sys
from pathlib import Path

D = Path(__file__).parent
S = D / '상영작'
APP = D.parent / 'movie-reco' / 'data'
raws = [Path(a) for a in sys.argv[1:]] or [D / 'raw' / 'kobis_raw_20261101.json']

code = {}
for p in reversed(raws):  # 앞의 raw가 우선
    for c, m in json.load(open(p, encoding='utf-8'))['movies'].items():
        code[html.unescape(m.get('title', '')).strip()] = c

def selected(name):
    out = {}
    for r in csv.DictReader(open(S / name, encoding='utf-8-sig')):
        if r['선택'] == 'Y':
            out.setdefault(r['제목'], []).append(r['태그'])
    return out

now = selected('now_tags.csv')
picks = selected('picks_tags.csv')
disp = {r['묶음 대표']: (r['화면 이름'] or '').strip() for r in csv.DictReader(open(S / 'genome_tag_ko.csv', encoding='utf-8-sig'))}
used = sorted({t for v in list(now.values()) + list(picks.values()) for t in v})
miss = [t for t in used if not disp.get(t)]
assert not miss, f'화면 이름 없는 태그: {miss}'
nocode = [t for t in now if t not in code]
assert not nocode, f'영화코드 못 찾은 상영작: {nocode}'

J = lambda o: json.dumps(o, ensure_ascii=False, separators=(',', ':'))
tags_js = ('// 자동 생성 파일. 손으로 고치지 말 것. 생성: 데시스/data/build_reco_tags.py (입력: data/상영작/now_tags.csv, picks_tags.csv, genome_tag_ko.csv)\n'
           '// TAGS 태그 → 화면 이름, NOW_TAGS 영화코드 → 상영작 선택 태그(최대 5개 + 유형, 영진위 인정). 태그 이름은 genome 묶음 대표 (docs/추천로직_정리.md)\n'
           f'const TAGS={J({t: disp[t] for t in used})};\n'
           f'const NOW_TAGS={J({code[t]: v for t, v in now.items()})};\n')
(APP / 'tags.js').write_text(tags_js, encoding='utf-8', newline='\n')

# data.js PICKS 블록만 손봄: 제목별 tags 교체, picks_tags에 없는 영화는 줄 삭제
s = (APP / 'data.js').read_text(encoding='utf-8')
a = s.index('const PICKS=[')
b = s.index('];', a)
block, n, dropped = [], 0, []
for ln in s[a:b].split('\n'):
    m = re.match(r"\s*\{t:'([^']+)',f:", ln)
    if m:
        t = m.group(1)
        if t not in picks:
            dropped.append(t)
            continue
        ln = re.sub(r"tags:\[[^\]]*\]", 'tags:' + J(picks[t]), ln)
        n += 1
    block.append(ln)
block = '\n'.join(block).rstrip().rstrip(',') + '\n'
s = s[:a] + block + s[b:]
s = s.replace(f'풀 ({n + len(dropped)}편)', f'풀 ({n}편)')
(APP / 'data.js').write_text(s, encoding='utf-8', newline='\n')
print(f'tags.js: 태그 {len(used)}개, 상영작 {len(now)}편 / data.js PICKS: {n}편 태그 교체, 지움 {dropped}')
