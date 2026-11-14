# KMDb 줄거리, 키워드, 장르 받기 (채은 Windows에서 실행: 이 폴더에서 python kmdb_fetch.py)
# 설치 필요 없음 (파이썬 기본 기능만 씀). 실행하면 KMDb API 키를 물어봄 (화면에 안 보임)
# 대상: 좋아하는 영화 후보 30편(PICKS) + 현재 상영작(../raw/kobis_raw_*.json 중 가장 최근 파일)
# 매칭: KMDb 검색 결과 중 제목이 정확히 같은 것 (없으면 제목이 포함되는 것) → 개봉연도가 연도 힌트와 가장 가까운 것 → 한국어 줄거리 있는 것 → 극영화
# 결과: kmdb_picks.csv, kmdb_now.csv, kmdb_report.txt (후보가 여러 개였던 영화는 리포트에 후보 목록을 남김)
import csv, getpass, glob, html, json, os, re, sys, time, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = sorted(glob.glob(os.path.join(HERE, '..', 'raw', 'kobis_raw_*.json')))[-1]  # 가장 최근 상영작 원본 (파일 이름의 날짜 순, 11/4부터)
URL = 'http://api.koreafilm.or.kr/openapi-data2/wisenut/search_api/search_json2.jsp'

# 30편: 제목, 연도 힌트 (국내 개봉연도. Claude가 알고 있는 값이라 결과에서 매칭된 연도를 꼭 확인할 것)
PICKS = [
    ('기생충', 2019), ('서울의 봄', 2023), ('파묘', 2024), ('범죄도시2', 2022), ('좀비딸', 2025),
    ('라라랜드', 2016), ('인터스텔라', 2014), ('어바웃 타임', 2013), ('더 퍼스트 슬램덩크', 2023),
    ('스즈메의 문단속', 2023), ('벌새', 2019), ('퍼펙트 데이즈', 2024), ('헤어질 결심', 2022), ('엑시트', 2019),
    ('대도시의 사랑법', 2024), ('왕과 사는 남자', None), ('리틀 포레스트', 2018), ('탑건: 매버릭', 2022),
    ('오펜하이머', 2023), ('에브리씽 에브리웨어 올 앳 원스', 2022), ('패스트 라이브즈', 2024), ('위키드', 2024),
    ('듄: 파트 2', 2024), ('서브스턴스', 2024), ('인사이드 아웃 2', 2024), ('주토피아 2', 2025),
    ('귀멸의 칼날: 무한성편', 2025), ('남매의 여름밤', 2020), ('소공녀', 2018), ('괴물', 2023),   # 세계의 주인은 11/2 30편으로 줄이며 뺌
]

def clean(s):
    return re.sub(r'[\s:\-·,.!?]+', '', (s or '').replace('!HS', '').replace('!HE', '')).lower()

def strip_hl(s):
    return re.sub(r'\s+', ' ', (s or '').replace('!HS', '').replace('!HE', '')).strip()

def search(key, title):
    q = urllib.parse.urlencode({'collection': 'kmdb_new2', 'detail': 'Y', 'ServiceKey': key, 'title': title, 'listCount': 50})
    with urllib.request.urlopen(URL + '?' + q, timeout=30) as r:
        d = json.loads(r.read().decode('utf-8'), strict=False)
    return (d.get('Data') or [{}])[0].get('Result') or []

def kr_plot(m):
    for p in (m.get('plots') or {}).get('plot', []) or []:
        if p.get('plotLang') == '한국어' and (p.get('plotText') or '').strip():
            return p['plotText'].strip()
    return ''

def year_of(m):
    y = (m.get('repRlsDate') or '')[:4]
    return int(y) if y.isdigit() else (int(m['prodYear']) if str(m.get('prodYear', '')).isdigit() else None)

def directors(m):
    return ', '.join(d.get('directorNm', '') for d in (m.get('directors') or {}).get('director', []) or [])

def pick(key, title, year):
    allres = search(key, title)
    res = [m for m in allres if clean(m.get('title')) == clean(title)]
    if not res:   # 제목이 정확히 같은 게 없으면 제목이 포함되는 것 (예: 극장판 귀멸의 칼날)
        res = [m for m in allres if clean(title) in clean(m.get('title')) or clean(m.get('title')) in clean(title)]
    def score(m):
        y = year_of(m)
        gap = abs(y - year) if (y and year) else 99   # 연도 차이를 끝까지 비교
        return (-gap, bool(kr_plot(m)), m.get('type') == '극영화', y or 0)
    res.sort(key=score, reverse=True)
    return res

def row(kind, title, hint, res):
    m = res[0] if res else {}
    return {'구분': kind, '제목': title, '제목 일치': ('정확' if res and clean(res[0].get('title')) == clean(title) else ('포함' if res else '')), '연도 힌트': hint or '', '후보 수': len(res),
            'KMDb 제목': strip_hl(m.get('title')), 'KMDb ID': (m.get('movieId', '') + m.get('movieSeq', '')) if m else '',
            '개봉일': m.get('repRlsDate', ''), '제작연도': m.get('prodYear', ''), '감독': directors(m) if m else '',
            '국가': m.get('nation', ''), '유형': m.get('type', ''), '장르': m.get('genre', ''),
            '키워드': m.get('keywords', ''), '줄거리': kr_plot(m) if m else '',
            '포스터': big_poster((m.get('posters') or '').split('|')[0].strip().replace('http://', 'https://'))}   # 앱 상영작 포스터(build_schedule.py). 첫 장만

def big_poster(u):
    # KMDb가 주는 주소는 가로 213px 썸네일(thm/02/../tn_이름.jpg). 같은 자리의 큰 그림(poster/../이름_01.jpg, 가로 418px쯤)으로 바꿈. 11/14 상영작 36장 모두 열림
    return re.sub(r'thm/02/(.*)/tn_([^./]+)\.\w+$', r'poster/\1/\2_01.jpg', u)

def main():
    # 자동 실행(GitHub Actions): 환경변수 KMDB_KEY에 키, python kmdb_fetch.py now 로 상영작만 받음 (30편은 확인해 둔 kmdb_picks.csv 그대로)
    key = os.environ.get('KMDB_KEY') or getpass.getpass('KMDb API 키 (화면에 안 보임): ').strip()
    only_now = sys.argv[1:] == ['now']
    raw = json.load(open(RAW, encoding='utf-8'))
    now = [(html.unescape(x.get('title', '')).strip(), (x.get('open') or '')[:4]) for x in raw['movies'].values()]
    now = [(t, int(y) if y.isdigit() else None) for t, y in now]
    report = []
    for kind, items, out in [('후보', PICKS, 'kmdb_picks.csv'), ('상영작', now, 'kmdb_now.csv')][only_now:]:
        rows = []
        for i, (title, hint) in enumerate(items, 1):
            try:
                res = pick(key, title, hint)
            except Exception as e:
                print('실패:', title, e); res = []
            r = row(kind, title, hint, res)
            rows.append(r)
            print(f'[{kind} {i}/{len(items)}] {title} → {r["KMDb 제목"] or "없음"} {r["개봉일"] or r["제작연도"]} 줄거리 {"O" if r["줄거리"] else "X"} 키워드 {"O" if r["키워드"].strip() else "X"}')
            if len(res) > 1:
                report.append(f'{kind} {title} (힌트 {hint}): 후보 ' + ' / '.join(f'{strip_hl(m.get("title"))} {m.get("repRlsDate") or m.get("prodYear")} {directors(m)} {m.get("type", "")}' for m in res[:6]))
            time.sleep(0.2)
        with open(os.path.join(HERE, out), 'w', encoding='utf-8-sig', newline='') as f:
            w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
            w.writeheader(); w.writerows(rows)
        n = len(rows)
        report.insert(0, f'{kind} {n}편: KMDb 찾음 {sum(1 for r in rows if r["KMDb 제목"])}편, 줄거리 {sum(1 for r in rows if r["줄거리"])}편, 키워드 {sum(1 for r in rows if r["키워드"].strip())}편, 못 찾음: ' + ', '.join(r['제목'] for r in rows if not r['KMDb 제목']))
    with open(os.path.join(HERE, 'kmdb_report.txt'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(report))
    print('\n'.join(report[:2]))
    print('저장: kmdb_picks.csv, kmdb_now.csv, kmdb_report.txt')

if __name__ == '__main__':
    main()
