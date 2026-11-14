"""상영작 포스터를 선명하게: KOBIS 원본 그림(장당 0.3~33MB)을 받아 가로 800px JPEG로 줄여 저장
사용: data 폴더에서 python poster_fetch.py raw/kobis_raw_날짜.json [저장할 폴더, 기본 ../movie-reco/posters/now]
- 배포할 때(GitHub Actions) 도는 스크립트. 만든 파일은 저장소에 안 올라가고 Actions 캐시에 남아 다음 날은 새 영화만 받음
- TMDB 표(tmdb_posters.json)에 있는 영화는 TMDB 주소가 충분히 커서 건너뜀. 이미 있는 파일도 건너뜀
- 못 받은 영화는 그냥 넘어감. build_schedule.py가 파일이 없는 영화는 주소(KMDb, KOBIS 썸네일)로 채움
- 지금 상영작에 없는 영화의 파일은 지움
"""
import io, json, sys, time, urllib.request
from pathlib import Path
from PIL import Image

WIDTH, BUDGET, MAX_BYTES = 800, 420, 40_000_000  # 가로 px, 전체 제한 시간(초), 한 장 최대 크기
here = Path(__file__).parent
raw = json.load(open(sys.argv[1], encoding='utf-8'))
out = Path(sys.argv[2]) if len(sys.argv) > 2 else here.parent / 'movie-reco' / 'posters' / 'now'
out.mkdir(parents=True, exist_ok=True)
tmdb = json.load(open(here / 'tmdb_posters.json', encoding='utf-8'))

want = {c: m['img'].replace('thumb_x192/thn_', '') for c, m in raw['movies'].items() if c not in tmdb and m.get('img')}
for f in out.glob('*.jpg'):
    if f.stem not in want:
        f.unlink()
t0, made, failed = time.time(), 0, []
for code, path in want.items():
    dst = out / f'{code}.jpg'
    if dst.exists():
        continue
    if time.time() - t0 > BUDGET:
        print('시간 제한으로 멈춤. 남은 영화는 다음 실행에서 받음'); break
    try:
        req = urllib.request.Request('https://www.kobis.or.kr' + path, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=30) as r:
            data = r.read(MAX_BYTES + 1)
        assert len(data) <= MAX_BYTES, '너무 큼'
        im = Image.open(io.BytesIO(data)).convert('RGB')
        if im.width > WIDTH:
            im = im.resize((WIDTH, round(im.height * WIDTH / im.width)), Image.LANCZOS)
        im.save(dst, 'JPEG', quality=82, optimize=True, progressive=True)
        made += 1
    except Exception as e:
        failed.append(f'{code} {e}')
print(f'포스터 파일 {len(list(out.glob("*.jpg")))}장 (새로 {made}장, 대상 {len(want)}편), 실패 {len(failed)}: {failed[:5]}')
