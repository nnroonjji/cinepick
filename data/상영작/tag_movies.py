# 영화에 genome 태그 붙이기 (data\상영작 폴더에서 python tag_movies.py picks  또는  python tag_movies.py now)
#   picks: 좋아하는 영화 후보 30편 (30편/kmdb_picks.csv + tmdb_picks.csv)
#   now:   현재 상영작 (현재상영작/kmdb_now.csv만. TMDB 안 씀)
# 근거 1. 한국어: KMDb 장르, KMDb 키워드, 줄거리 → kiwi 형태소 분석 → genome_tag_ko.csv의 한국어와 비교
#   - 접사는 붙여서 나눔 (사랑스럽다, 영화계, 신도시가 사랑, 영화, 도시로 쪼개지지 않게)
#   - 명사 + 하다 동사는 명사로 바꿈 (사랑하다 → 사랑, 여행하다 → 여행, 결혼하다 → 결혼)
#   - 내용어(명사, 동사, 형용사, 어근, 외국어, 숫자)만 남기고 동사, 형용사는 기본형(~다)
#   - 번역어가 여러 단어면(아빠와 딸) 같은 순서로 붙어 나올 때만 걸림
# 근거 2. 영어 (picks만): TMDB 키워드, TMDB 장르 → genome 태그 이름과 비교 (소문자, 기호 제거, lemminflect 명사 기본형)
# 대표가 평가, 등급, 애매인 묶음은 붙이지 않음. 붙는 이름은 묶음 대표
# 영화당 TOP_N개 선택. 우선순위: 1 장르(최대 GENRE_MAX개) → 2 키워드 → 3 흔한 장르 → 4 줄거리
#   흔한 장르: 장르로 붙는 영화가 전체의 COMMON_RATIO를 넘는 장르 (30편이면 10편 초과)
#   줄거리로만 붙는 태그는 줄거리에 PLOT_MIN번 이상 나온 것만 씀. 그래도 MIN_N개가 안 되면 1번 나온 줄거리 태그로 MIN_N개까지 채움 (줄거리 후보가 없으면 비워 둠)
#   같은 순위 안에서는 근거 종류 수 → 근거 수 → 줄거리에 나온 횟수 → 후보에 더 많이 나온 태그 순 (교집합이 잘 생기게)
# 유형: KMDb 유형이 애니메이션이면 animation, 다큐멘터리면 documentary를 5개와 별개로 붙임
# 영진위 인정 (상영작은 KOBIS 원본, 30편은 kobis_picks.csv): 예술영화 인정이면 art house, 독립영화 인정이면 independent film을 5개와 별개로 붙임
# 결과: {mode}_tags.csv (후보 전부, 선택 열에 Y), {mode}_tags_report.txt
import glob, html, json, os, re, sys
import pandas as pd
from kiwipiepy import Kiwi, Match
from lemminflect import getLemma
os.chdir(os.path.dirname(os.path.abspath(__file__)))

MODE = sys.argv[1] if len(sys.argv) > 1 else 'picks'
DIR = {'picks': '30편', 'now': '현재상영작'}[MODE]   # 입력과 태그 결과를 두는 폴더. 리포트는 보고서 폴더 (11/14 폴더 정리)
TOP_N = 5
MIN_N = 3      # 채은 결정: 태그 최소 3개
PLOT_MIN = 2   # 채은 결정: 줄거리 태그는 2번 이상 나온 것 (검증 85편에서 1번 나온 것 맞음 36%, 2번 이상 71%)
GENRE_MAX = 3
COMMON_RATIO = 1 / 3
SRC_RANK = {'유형': -1, 'KOBIS': 0, 'KMDb장르': 1, 'KMDb유형': 1, 'TMDB장르': 1, 'KMDb키워드': 2, 'TMDB키워드': 2, '줄거리': 4}
RANK_NAME = {-1: '유형', 0: '영진위 인정', 1: '장르', 2: '키워드', 3: '흔한 장르', 4: '줄거리'}
TYPE_SEPARATE = {'애니메이션': 'animation', '다큐멘터리': 'documentary'}   # 채은 결정: KMDb 유형은 5개와 별개로 붙임 (극영화는 태그 없음, (실황)공연물은 맞는 genome 태그 없음)
# 채은 결정: KMDb 장르 중 번역표에 없던 것. 줄거리에서는 흔한 말이라(사회, 인물) 번역표에 넣지 않고 장르에만 씀. 붙일 태그는 Claude가 고름
GENRE_ONLY = {'어드벤처': 'adventure', '뮤직': 'music', '인물': 'biographical', '멜로드라마': 'romance', '사회': 'social commentary', '사회물(경향)': 'social commentary'}   # KMDb 유형 → 장르 근거로 쓸 말

kiwi = Kiwi()
OPT = Match.ALL | Match.JOIN_AFFIX
KEEP = ('NNG', 'NNP', 'VV', 'VA', 'XR', 'SL', 'SN')

_noun_ha = {}
def noun_of_ha(form):
    # 사랑하 → 사랑 (기본 분석에서 명사 + 하(접사)로 나뉠 때만). 피하, 향하처럼 원래 한 동사인 것은 그대로
    if form not in _noun_ha:
        toks = kiwi.tokenize(form + '다')
        ok = len(toks) >= 2 and toks[0].tag.startswith('NN') and toks[1].tag.startswith('XSV') and toks[0].form + '하' == form
        _noun_ha[form] = toks[0].form if ok else None
    return _noun_ha[form]

def norm(t):
    # 형태소 하나를 비교용 말로: 외국어는 소문자, 명사+하다 동사는 명사, 동사와 형용사는 기본형
    tag = t.tag.split('-')[0]
    if tag == 'SL':
        return t.form.lower()
    if tag == 'VV' and t.form.endswith('하') and len(t.form) > 1 and noun_of_ha(t.form):
        return noun_of_ha(t.form)
    return t.form + ('다' if tag in ('VV', 'VA') else '')

def ko_tokens(text):
    return [norm(t) for t in kiwi.tokenize(text or '', match_options=OPT) if t.tag.split('-')[0] in KEEP]

def dict_tokens(word):
    # 번역어 쪽: 앞뒤 문맥이 없어서 품사가 틀릴 수 있어 조사, 어미, 기호만 빼고 다 남김
    out = []
    for t in kiwi.tokenize(word, match_options=OPT):
        tag = t.tag.split('-')[0]
        if tag.startswith(('J', 'E')) or (tag.startswith('S') and tag not in ('SL', 'SN')):
            continue
        out.append(norm(t))
    return out

def bad_split(word):
    # 번역어가 잘못 나뉘는지 (아드만 → 아/감탄사 + 드만/어미, 내면 → 내/보조용언 + 면)
    tags = [t.tag.split('-')[0] for t in kiwi.tokenize(word, match_options=OPT)]
    for i, tag in enumerate(tags):
        if tag in ('IC', 'VX', 'ETN'):
            return True
        if tag in ('EF', 'EC') and not (i > 0 and tags[i - 1] in ('VV', 'VA', 'XSV', 'XSA')):
            return True
    return False

def in_sentence(word):
    # 문장 속에 넣어 다시 나눔 (그 아이의 이야기 → 아이/명사, 그 삶의 이야기 → 삶/명사)
    return kiwi.tokenize('그 ' + word + '의 이야기', match_options=OPT)[1:-2]

def en_key(s):
    words = re.sub(r'[^a-z0-9]+', ' ', (s or '').lower()).split()
    return ''.join(getLemma(w, upos='NOUN')[0] for w in words)

# 번역표
tk = pd.read_csv('genome_tag_ko.csv').fillna('')
tk = tk[tk['구분'] == '']
ko_dict, en_dict, raw_words = {}, {}, {}
for _, r in tk.iterrows():
    for w in [x for x in r['한국어'].split('|') if x]:
        seq = tuple(dict_tokens(w))
        if ' ' not in w and not w.endswith('다'):
            # 한 단어 명사는 문장 속에서 명사로 나오면 그대로 씀 (삶이 살다로, 섬이 서다로 바뀌는 것 방지)
            if any(t.form == w and t.tag.startswith('NN') for t in in_sentence(w)):
                seq = (w,)
            elif bad_split(w):
                toks = in_sentence(w)
                seq = () if any(t.tag.split('-')[0] in ('IC', 'VX') for t in toks) else tuple(norm(t) for t in toks if t.tag.split('-')[0] in KEEP)
        elif bad_split(w):
            toks = in_sentence(w)
            seq = () if any(t.tag.split('-')[0] in ('IC', 'VX') for t in toks) else tuple(norm(t) for t in toks if t.tag.split('-')[0] in KEEP)
        if seq:
            ko_dict.setdefault(seq, set()).add((r['묶음 대표'], w))
        else:   # 그래도 안 되는 말(아니메 등)은 원문에서 그대로 찾음
            raw_words.setdefault(w, set()).add(r['묶음 대표'])
    for e in [x for x in r['영어'].split('|') if x]:
        en_dict.setdefault(en_key(e), set()).add((r['묶음 대표'], e))
dup = {' '.join(s): sorted({m for m, _ in v}) for s, v in ko_dict.items() if len({m for m, _ in v}) > 1}
dup.update({w: sorted(v) for w, v in raw_words.items() if len(v) > 1})
assert not dup, f'한 말이 태그 두 개 이상에 있음 (dedupe_ko.py를 돌릴 것): {dup}'   # 11/14: 한 말은 태그 하나에만
max_len = max(len(s) for s in ko_dict)

def match_ko(text, source):
    toks = ko_tokens(text)
    hits = []
    for w, mains in raw_words.items():
        for _ in re.finditer(r'(?<![가-힣A-Za-z0-9])' + r'\s+'.join(map(re.escape, w.split())), text or '', flags=re.I):
            hits += [(m, f'{source}:{w}') for m in mains]
    found = []
    for i in range(len(toks)):
        for n in range(1, max_len + 1):
            for main, w in ko_dict.get(tuple(toks[i:i + n]), ()):
                found.append((main, i, i + n, w))
    # 긴 말이 걸린 자리 안의 짧은 말은 세지 않음 (남자친구 → 친구로 friendship이 붙지 않게, 소설원작 → 원작 중복 방지)
    used = set()
    for main, a, b, w in found:
        if any(a2 <= a and b <= b2 and (b2 - a2) > (b - a) for m2, a2, b2, _ in found):
            continue
        if (main, a, b) not in used:          # 같은 자리, 같은 길이로 겹치면 하나만
            used.add((main, a, b)); hits.append((main, f'{source}:{w}'))
    return hits

def match_en(items, source):
    return [(main, f'{source}:{it}') for it in items for main, _ in en_dict.get(en_key(it), ())]

# 영진위 인정 여부 (KOBIS 원본)
RAW = sorted(glob.glob(os.path.join('..', 'raw', 'kobis_raw_*.json')))[-1]  # 가장 최근 상영작 원본 (파일 이름의 날짜 순, 11/4부터)
KOBIS = {}
if MODE == 'now':
    with open(RAW, encoding='utf-8') as f:
        for x in json.load(f)['movies'].values():
            KOBIS[html.unescape(x.get('title', '')).strip()] = x
else:   # 30편은 KOBIS 영화정보에서 찾아 둔 kobis_picks.csv (제목, 연도, 감독으로 확인)
    for _, x in pd.read_csv('30편/kobis_picks.csv').fillna('').iterrows():
        KOBIS[x['제목']] = {'art': x['예술영화 인정'], 'indie': x['독립영화 인정']}

# 영화별 근거 모으기
km = pd.read_csv(f'{DIR}/kmdb_{MODE}.csv').fillna('')
tm = pd.read_csv('30편/tmdb_picks.csv').fillna('').set_index('제목') if MODE == 'picks' else None
films = []
for _, r in km.iterrows():
    title = r['제목']
    t = tm.loc[title] if (tm is not None and title in tm.index) else None
    plot = r['줄거리'] or (t['줄거리_ko(KMDb 없는 영화만)'] if t is not None else '')
    hits = match_ko(plot, '줄거리')
    hits += match_ko(' '.join(r['키워드'].split(',')), 'KMDb키워드')
    hits += match_ko(' '.join(r['장르'].replace('/', ',').split(',')), 'KMDb장르')
    if r['유형'] in TYPE_SEPARATE:
        hits.append((TYPE_SEPARATE[r['유형']], f"유형:{r['유형']}"))
    hits += [(GENRE_ONLY[g], f'KMDb장르:{g}') for g in (x.strip() for x in r['장르'].replace('/', ',').split(',')) if g in GENRE_ONLY]
    if t is not None:
        hits += match_en([k for k in t['키워드_en'].split('|') if k], 'TMDB키워드')
        hits += match_en([g for g in t['장르_en'].split('|') if g], 'TMDB장르')
    kb = KOBIS.get(title)
    if kb is not None:
        if kb.get('art') == '인정':
            hits.append(('art house', 'KOBIS:예술영화 인정'))
        if kb.get('indie') == '인정':
            hits.append(('independent film', 'KOBIS:독립영화 인정'))
    ev, occ = {}, {}
    for main, e in hits:
        ev.setdefault(main, [])
        if e not in ev[main]:
            ev[main].append(e)
        if e.startswith('줄거리:'):
            occ[main] = occ.get(main, 0) + 1
    films.append((title, ev, occ))

genre_films, cand_films = {}, {}
for title, ev, occ in films:
    for main, es in ev.items():
        cand_films[main] = cand_films.get(main, 0) + 1
        if any(SRC_RANK[e.split(':')[0]] == 1 for e in es):
            genre_films[main] = genre_films.get(main, 0) + 1
COMMON_MAX = len(films) * COMMON_RATIO
COMMON = {m for m, n in genre_films.items() if n > COMMON_MAX}

def rank(main, es):
    return min(3 if (SRC_RANK[e.split(':')[0]] == 1 and main in COMMON) else SRC_RANK[e.split(':')[0]] for e in es)

srcs = lambda es: len({e.split(':')[0] for e in es})
rows, L = [], []
for title, ev, occ in films:
    tags = sorted(ev.items(), key=lambda kv: (rank(*kv), -srcs(kv[1]), -len(kv[1]), -occ.get(kv[0], 0), -cand_films[kv[0]], kv[0]))
    picked, n_genre = [], 0
    weak = lambda main, es: rank(main, es) == 4 and occ.get(main, 0) < PLOT_MIN
    for main, es in tags:
        is_genre = rank(main, es) in (1, 3)
        if rank(main, es) <= 0:   # 유형, 영진위 인정은 5개와 별개
            continue
        if len(picked) < TOP_N and not weak(main, es) and not (is_genre and n_genre >= GENRE_MAX):
            picked.append(main); n_genre += is_genre
    for main, es in tags:   # MIN_N개가 안 되면 1번 나온 줄거리 태그로 채움
        if len(picked) < MIN_N and weak(main, es):
            picked.append(main)
    picked += [main for main, es in tags if rank(main, es) <= 0]
    for main, es in tags:
        rows.append({'제목': title, '태그': main, '선택': 'Y' if main in picked else '', '우선순위': RANK_NAME[rank(main, es)],
                     '근거 종류 수': srcs(es), '근거 수': len(es), '줄거리 횟수': occ.get(main, 0), '근거': ' / '.join(es)})
    L.append(f'[{title}] 후보 {len(tags)}개 중 {len(picked)}개 선택')
    L += [f"  {'*' if main in picked else ' '} {main} [{RANK_NAME[rank(main, es)]}] ({srcs(es)}종류 {len(es)}개" + (f", 줄거리 {occ[main]}번" if occ.get(main) else '') + '): ' + ', '.join(es)
          for main, es in tags]
    L.append('')

out = pd.DataFrame(rows, columns=['제목', '태그', '선택', '우선순위', '근거 종류 수', '근거 수', '줄거리 횟수', '근거'])
out.to_csv(f'{DIR}/{MODE}_tags.csv', index=False, encoding='utf-8-sig')
per = out.groupby('제목').size().reindex(km['제목'], fill_value=0)
sel = out[out['선택'] == 'Y']
nsel = sel.groupby('제목').size().reindex(km['제목'], fill_value=0)
cnt = sel.groupby('태그')['제목'].nunique().sort_values(ascending=False)
words = out.assign(근거=out['근거'].str.split(' / ')).explode('근거')
wcnt = words[words['근거'].str.startswith('줄거리')].groupby('근거')['제목'].nunique().sort_values(ascending=False)
name = '좋아하는 영화 후보 30편' if MODE == 'picks' else f'현재 상영작 {len(km)}편'
head = [f'{name} 태그 붙이기 결과 (영화당 최대 {TOP_N}개, 장르(최대 {GENRE_MAX}개) → 키워드 → 흔한 장르 → 줄거리({PLOT_MIN}번 이상) 순, {MIN_N}개가 안 되면 1번 나온 줄거리 태그로 채움)',
        f'흔한 장르 (장르로 붙는 영화 {COMMON_MAX:.1f}편 초과, 키워드 다음 순위로 내림): ' + ', '.join(f'{m} {genre_films[m]}편' for m in sorted(COMMON)),
        f'후보 태그 수: 최소 {per.min()}, 중앙값 {int(per.median())}, 최대 {per.max()} / 선택된 태그 수: ' + ', '.join(f'{k}개 {v}편' for k, v in nsel.value_counts().sort_index(ascending=False).items()),
        f'선택된 태그 {len(sel)}개의 우선순위: ' + ', '.join(f'{k} {v}' for k, v in sel['우선순위'].value_counts().items()) + f' / 서로 다른 태그 {sel["태그"].nunique()}개',
        '선택된 태그 중 많은 영화에 붙은 것 (붙은 영화 수): ' + ', '.join(f'{k} {v}' for k, v in cnt.head(30).items()),
        '줄거리에서 많이 걸린 한국어 (걸린 영화 수): ' + ', '.join(f'{k.split(":")[1]} {v}' for k, v in wcnt.head(30).items()), '']
os.makedirs('보고서', exist_ok=True)
with open(f'보고서/{MODE}_tags_report.txt', 'w', encoding='utf-8') as f:
    f.write('\n'.join(head + L))
print('\n'.join(head))
