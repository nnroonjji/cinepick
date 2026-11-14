"""KOBIS 상영시간표와 영화 상세를 받아 raw/kobis_raw_날짜.json으로 저장 (브라우저로 모으던 원본과 같은 구조)
사용: data 폴더에서 python kobis_fetch.py [일수, 기본 11]   키 필요 없음. 오늘(한국 시간)부터 일수만큼
극장은 pricing.py의 THEATERS (폐관 제외). 회차가 MIN_ROWS보다 적으면 KOBIS 쪽 문제로 보고 저장하지 않고 끝냄
"""
import html, json, re, sys, time, urllib.parse, urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from pricing import CLOSED, THEATERS

BASE = 'https://www.kobis.or.kr'
KST = timezone(timedelta(hours=9))
MIN_ROWS = 50


def post(path, **form):
    req = urllib.request.Request(BASE + path, urllib.parse.urlencode(form).encode(), {'User-Agent': 'Mozilla/5.0'})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read().decode('utf-8', 'replace')
        except OSError:
            if attempt == 2:
                raise
            time.sleep(3)


def text(s):
    # 태그만 뗌. <오만과 편견>처럼 글에 쓴 꺾쇠와 줄바꿈 없는 공백(nbsp)은 둠
    return re.sub(r'[ \t\r\n]+', ' ', html.unescape(re.sub(r'<!--.*?-->|</?[a-zA-Z][^>]*>', '', s, flags=re.S))).strip()


def parse_movie(page):
    """상세 페이지 HTML → 원본의 movies 항목. 못 찾은 칸은 빈 문자열"""
    def grab(pat):
        m = re.search(pat, page, re.S)
        return m.group(1) if m else ''
    dd = lambda label: text(grab(r'<dt>%s</dt>\s*<dd>(.*?)</dd>' % label))
    ok = lambda kind: '인정' if text(grab(r'\[%s영화 인정여부\]</strong>(.*?)<' % kind)) == '인정' else ''
    return {'title': text(grab(r'<strong class="tit">(.*?)</strong>')),
            'summary': dd('요약정보'), 'promo': '', 'open': dd('개봉일'),
            'art': ok('예술'), 'indie': ok('독립'),
            # 시놉시스는 <br>로 나눈 줄바꿈을 살림 (앱에서 포스터를 누르면 보여 줌). 빈 줄은 하나까지만
            'syn': re.sub(r'\n{3,}', '\n\n', '\n'.join(text(l) for l in re.split(r'<br\s*/?>', grab(r'시놉시스</strong>\s*<p class="desc_info">(.*?)</p>')))).strip(),
            'img': grab(r'src="(/common/mast/movie/[^"]*thumb_x192/[^"]*)"')}


def main(days=11):
    now = datetime.now(KST)
    dates = [(now + timedelta(days=i)).strftime('%Y%m%d') for i in range(days)]
    theaters, rows = [], []
    for cd, v in THEATERS.items():
        if cd in CLOSED:
            continue
        url = ''
        for dt in dates:
            d = json.loads(post('/kobis/business/mast/thea/findSchedule.do', theaCd=cd, showDt=dt), strict=False)
            url = url or (d.get('theater') or [{}])[0].get('homepgUrl', '')
            grouped = {}  # (영화코드, 영화명(상영방식), 상영관) → 시간들
            for s in d.get('schedule') or []:
                grouped.setdefault((s['movieCd'], s['movieNm'], s['scrnNm']), []).append(s['showTm'])
            rows += [[cd, dt, mcd, mnm, scrn, ','.join(sorted(tms))] for (mcd, mnm, scrn), tms in grouped.items()]
            time.sleep(0.15)
        theaters.append({'gu': v[4].split()[0], 'name': v[0], 'cd': cd, 'url': url})
    if len(rows) < MIN_ROWS:
        sys.exit(f'회차 묶음이 {len(rows)}개뿐이라 저장하지 않음 (KOBIS 응답 확인 필요)')
    movies = {}
    for mcd in sorted({r[2] for r in rows}):
        movies[mcd] = parse_movie(post('/kobis/business/mast/mvie/searchMovieDtl.do', code=mcd, sType='', titleYN='Y', etcParam='', isOuterReq='false'))
        if not movies[mcd]['title']:  # 상세를 못 읽으면 상영표의 이름에서 상영방식 괄호만 떼고 씀
            movies[mcd]['title'] = re.sub(r'\s*\([^()]*\)\s*$', '', html.unescape(next(r[3] for r in rows if r[2] == mcd)))
        time.sleep(0.15)
    out = Path(__file__).with_name('raw') / f'kobis_raw_{dates[0]}.json'
    out.parent.mkdir(exist_ok=True)
    json.dump({'fetched': now.isoformat(), 'theaters': theaters, 'rows': rows, 'movies': movies}, open(out, 'w', encoding='utf-8'), ensure_ascii=False)
    print(f'{out.name}: {dates[0]}~{dates[-1]}, 극장 {len(theaters)}곳, 회차 묶음 {len(rows)}개, 영화 {len(movies)}편')


if __name__ == '__main__':
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 11)
