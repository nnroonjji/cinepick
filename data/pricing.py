"""극장 정보와 가격 규칙. build_schedule.py가 씀.
가격은 일반 성인 1인 기준. 멀티플렉스는 상영관과 상영방식(특별관, 3D)까지 반영. 신분 확인이 필요한 할인(청소년, 학생, 주민 등)은 넣지 않고
누구나 받는 시간대, 요일 할인(조조, 수요일)만 반영함. 출처와 조사일은 docs/관람료_할인_정리.md
"""
from datetime import date

CLOSED = {'001195'}  # 롯데시네마 합정: 폐관

# KOBIS 극장코드 → 앱 표시 이름, 구분, 동네, 좌표, 도로명 주소(문화_영화상영관.csv), 홈페이지
THEATERS = {
    '001222': ('CGV 홍대', 'multi', '홍대', (37.55643, 126.92276), '마포구 양화로 153', 'http://www.cgv.co.kr'),
    '001283': ('CGV 연남', 'multi', '연남', (37.55767, 126.92590), '마포구 양화로 186, LC타워 7~10층', 'http://www.cgv.co.kr'),
    '001144': ('롯데시네마 홍대입구', 'multi', '홍대', (37.55733, 126.92531), '마포구 양화로 176', 'http://www.lottecinema.co.kr'),
    '001272': ('메가박스 홍대', 'multi', '홍대', (37.55607, 126.92209), '마포구 양화로 147, 아일렉스 7층', 'http://www.megabox.co.kr'),
    '001267': ('메가박스 상암', 'multi', '상암', (37.56907, 126.8982), '마포구 월드컵로 240', 'http://www.megabox.co.kr'),  # 인허가 데이터에 좌표가 비어 있어 OpenStreetMap 위치
    '001297': ('베스트슬립 시네마 앳 라이즈', 'etc', '홍대', (37.55443, 126.92125), '마포구 양화로 130, 라이즈호텔 4층', 'https://www.monoplex.com'),
    '001146': ('상상마당 시네마', 'indie', '홍대', (37.55100, 126.92103), '마포구 어울마당로 65, 상상마당 지하3층', 'https://www.sangsangmadang.com'),
    '001193': ('인디스페이스', 'indie', '홍대', (37.55719, 126.92476), '마포구 양화로 176, 스타피카소 8층', 'https://indiespace.kr'),
    '001282': ('라이카시네마', 'indie', '연희동', (37.56517, 126.93093), '서대문구 연희로8길 18, 지하1층', 'https://laikacinema.com'),
    '001148': ('아트하우스 모모', 'indie', '이대', (37.56256, 126.94745), '서대문구 이화여대길 52, ECC 지하4층', 'https://arthousemomo.co.kr'),
    '001149': ('필름포럼', 'indie', '신촌', (37.56413, 126.94452), '서대문구 성산로 527, 하늬솔빌딩 지하1층', 'http://www.filmforum.kr'),
}
KIND_KO = {'multi': '멀티플렉스', 'indie': '독립예술영화관', 'etc': '기타'}


def price(cd, d: date, tm: str, first_of_day: bool, hall: str = '', fmt: str = ''):
    """cd 극장코드, d 상영일, tm 'HH:MM', first_of_day 그 극장 그날 첫 회차 여부,
    hall KOBIS 상영관 이름, fmt KOBIS 상영방식(디지털, 4D, ScreenX, DOLBYCINEMA, VR, 3D 디지털 등) → (가격, 메모)"""
    wd = d.weekday()  # 월 0 ... 일 6
    fri_sun = wd >= 4
    pick = lambda weekday, weekend: weekend if fri_sun else weekday
    is3d = '3D' in fmt
    if cd == '001267':  # 메가박스 상암: 전 관이 컴포트, 리클라이너 (공식 요금표)
        if fmt == 'DOLBYCINEMA':
            return (pick(15000, 16000), '조조, Dolby Cinema') if tm <= '10:00' else (pick(18000, 19000), 'Dolby Cinema')
        if tm <= '10:00':
            return pick(14000, 15000) if is3d else pick(12000, 13000), '조조'
        return (pick(18000, 19000) if is3d else pick(16000, 17000)), ''
    if cd in ('001272', '001144'):  # 메가박스 홍대, 롯데시네마 홍대입구 (공식 요금표, 조조는 11시까지)
        extra, note = (1000, '광음 상영') if cd == '001144' and hall.startswith('04') else (0, '')
        if tm <= '11:00':
            return (pick(12000, 13000) if is3d else pick(10000, 11000)) + extra, ('조조, ' + note).strip(', ')
        return (pick(16000, 17000) if is3d else pick(14000, 15000)) + extra, note
    if cd in ('001222', '001283'):  # CGV 홍대, 연남: 공식 관람가격 (cgv.co.kr 극장 페이지의 관람가격, 11/15 확인. 두 곳의 2D, 3D 요금이 같음)
        # 시간대: 모닝 06:00~11:00, 브런치 11:01~13:00, 일반 13:01~. (평일 모닝, 브런치, 일반), (주말 모닝, 브런치, 일반)
        slot = 0 if '06:00' <= tm <= '11:00' else 1 if '11:00' < tm <= '13:00' else 2
        when = ('조조', '브런치', '')[slot]
        if 'SUITE' in hall:  # 연남 SUITE CINEMA(PRIVATE BOX). 요금표에 50,000원으로만 나와 1인 요금인지 박스 요금인지는 확인 못 함
            return 50000, 'SUITE CINEMA'
        if fmt == '4D':  # 연남 4DX(2D)
            table, kind = ((14000, 18000, 19000), (15000, 20000, 20000)), '4DX'
        elif fmt.upper() == 'SCREENX':  # 홍대 SCREENX(2D, 리클라이너)
            table, kind = ((14000, 17000, 18000), (14000, 19000, 19000)), 'ScreenX'
        elif is3d:
            table, kind = ((12000, 14000, 16000), (13000, 17000, 17000)), ''
        else:
            table, kind = ((10000, 12000, 14000), (11000, 15000, 15000)), ''
        return pick(*table)[slot], ', '.join(x for x in (when, kind) if x)
    if cd == '001297':  # 베스트슬립 시네마 앳 라이즈: 요일, 시간 구분 없이 2만 5천원 (채은 확인 11/15)
        return 25000, ''
    if cd == '001146':  # 상상마당: 정가 1만원, 매주 수요일 6천원
        return (6000, '수요일 할인') if wd == 2 else (10000, '')
    if cd == '001193':  # 인디스페이스: 1만원, 오전 11시 전 6천원
        return (6000, '조조') if tm < '11:00' else (10000, '')
    if cd == '001282':  # 라이카: 평일(월~목) 1만, 주말(금~일) 1.1만, 10시 전 첫 회 7천/8천
        if tm < '10:00' and first_of_day:
            return (8000 if fri_sun else 7000), '조조'
        return (11000 if fri_sun else 10000), ''
    if cd == '001149':  # 필름포럼: 평일 1만, 주말 1.1만(금 14시 이후~일), 첫 회차 조조 7천/8천
        weekend = wd >= 5 or (wd == 4 and tm >= '14:00')
        if first_of_day:
            return (8000 if weekend else 7000), '조조'
        return (11000 if weekend else 10000), ''
    if cd == '001148':  # 아트하우스 모모: 평일 1만, 주말 1.1만, 12시 전 회차는 6천원 (조조는 공식 관람 가이드, 일반 요금은 채은 확인 11/15)
        if tm < '12:00':
            return 6000, '조조'
        return (11000 if wd >= 5 else 10000), ''  # 주말은 토, 일로 둠 (금요일 포함 여부는 확인 못 함)
    return None, '요금 없음'
