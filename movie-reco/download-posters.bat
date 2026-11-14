@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist posters mkdir posters
echo 포스터 31장 받는 중...
if not exist "posters\parasite.jpg" curl.exe -sfL -o "posters\parasite.jpg" "https://image.tmdb.org/t/p/w342/jjHccoFjbqlfr4VGLVLT7yek0Xn.jpg" || echo 실패: parasite
if not exist "posters\12-12-the-day.jpg" curl.exe -sfL -o "posters\12-12-the-day.jpg" "https://image.tmdb.org/t/p/w342/ukVVnY9ovwl78WE5KndcpA6SnAm.jpg" || echo 실패: 12-12-the-day
if not exist "posters\exhuma.jpg" curl.exe -sfL -o "posters\exhuma.jpg" "https://image.tmdb.org/t/p/w342/tw0i3kkmOTjDjGFZTLHKhoeXVvA.jpg" || echo 실패: exhuma
if not exist "posters\the-roundup.jpg" curl.exe -sfL -o "posters\the-roundup.jpg" "https://image.tmdb.org/t/p/w342/9XkAF2pl2uliiuAORaWTgPmr6zG.jpg" || echo 실패: the-roundup
if not exist "posters\zombie-daughter.jpg" curl.exe -sfL -o "posters\zombie-daughter.jpg" "https://image.tmdb.org/t/p/w342/aASLRiO8p9xLIvG9EHXSyZ71sPl.jpg" || echo 실패: zombie-daughter
if not exist "posters\la-la-land.jpg" curl.exe -sfL -o "posters\la-la-land.jpg" "https://image.tmdb.org/t/p/w342/ad9ndytwOckyShSc0A6tx1rZRkW.jpg" || echo 실패: la-la-land
if not exist "posters\interstellar.jpg" curl.exe -sfL -o "posters\interstellar.jpg" "https://image.tmdb.org/t/p/w342/gDN2NWtHbs8ZWEBQM8Dh5OVXdb4.jpg" || echo 실패: interstellar
if not exist "posters\about-time.jpg" curl.exe -sfL -o "posters\about-time.jpg" "https://image.tmdb.org/t/p/w342/cLfuuK1Y5FjX1xXDrrEa9ppnKuy.jpg" || echo 실패: about-time
if not exist "posters\first-slam-dunk.jpg" curl.exe -sfL -o "posters\first-slam-dunk.jpg" "https://image.tmdb.org/t/p/w342/coiJrdXAXuBkSGDvp9bZ7mkuU6E.jpg" || echo 실패: first-slam-dunk
if not exist "posters\suzume.jpg" curl.exe -sfL -o "posters\suzume.jpg" "https://image.tmdb.org/t/p/w342/95cnAy1nqjoEev1YkaXrSf0NDa1.jpg" || echo 실패: suzume
if not exist "posters\house-of-hummingbird.jpg" curl.exe -sfL -o "posters\house-of-hummingbird.jpg" "https://image.tmdb.org/t/p/w342/dWqvNwMkxTWUqClUdR2Xr30Xla4.jpg" || echo 실패: house-of-hummingbird
if not exist "posters\perfect-days.jpg" curl.exe -sfL -o "posters\perfect-days.jpg" "https://image.tmdb.org/t/p/w342/tD5njVBxiDBEPmBiPOSnmP6AmNt.jpg" || echo 실패: perfect-days
if not exist "posters\decision-to-leave.jpg" curl.exe -sfL -o "posters\decision-to-leave.jpg" "https://image.tmdb.org/t/p/w342/rXEJ28XDQsogIGqwVEgwM2oDdpl.jpg" || echo 실패: decision-to-leave
if not exist "posters\exit.jpg" curl.exe -sfL -o "posters\exit.jpg" "https://image.tmdb.org/t/p/w342/7GTwjMaEVLbDBkg6McEizHTH1PF.jpg" || echo 실패: exit
if not exist "posters\love-in-the-big-city.jpg" curl.exe -sfL -o "posters\love-in-the-big-city.jpg" "https://image.tmdb.org/t/p/w342/vn2qtaU5x4x6R54hFweigLE8C4M.jpg" || echo 실패: love-in-the-big-city
if not exist "posters\wanggwa-saneun-namja.jpg" curl.exe -sfL -o "posters\wanggwa-saneun-namja.jpg" "https://image.tmdb.org/t/p/w342/kkJB3SeUJp7Y0IXXLkv5QZHJGkH.jpg" || echo 실패: wanggwa-saneun-namja
if not exist "posters\little-forest.jpg" curl.exe -sfL -o "posters\little-forest.jpg" "https://image.tmdb.org/t/p/w342/adoiOpcuBUKeEqfzLqY47VBZN86.jpg" || echo 실패: little-forest
if not exist "posters\top-gun-maverick.jpg" curl.exe -sfL -o "posters\top-gun-maverick.jpg" "https://image.tmdb.org/t/p/w342/jeqXUwNilvNqNXqAHsdwm5pEfae.jpg" || echo 실패: top-gun-maverick
if not exist "posters\oppenheimer.jpg" curl.exe -sfL -o "posters\oppenheimer.jpg" "https://image.tmdb.org/t/p/w342/jpD6z9fgNe7OqsHoDeAWQWoULde.jpg" || echo 실패: oppenheimer
if not exist "posters\everything-everywhere.jpg" curl.exe -sfL -o "posters\everything-everywhere.jpg" "https://image.tmdb.org/t/p/w342/dd29Kt2p2voyP2sB6p3jC36A7ce.jpg" || echo 실패: everything-everywhere
if not exist "posters\past-lives.jpg" curl.exe -sfL -o "posters\past-lives.jpg" "https://image.tmdb.org/t/p/w342/5igEts2tRTgUd2gz0uuldAx0tcD.jpg" || echo 실패: past-lives
if not exist "posters\wicked.jpg" curl.exe -sfL -o "posters\wicked.jpg" "https://image.tmdb.org/t/p/w342/mCB6biaBEafLGbs1eTImqlOgZj9.jpg" || echo 실패: wicked
if not exist "posters\dune-part-two.jpg" curl.exe -sfL -o "posters\dune-part-two.jpg" "https://image.tmdb.org/t/p/w342/8AsDR2o5AC3V8Jmj6JH6cpta7dz.jpg" || echo 실패: dune-part-two
if not exist "posters\the-substance.jpg" curl.exe -sfL -o "posters\the-substance.jpg" "https://image.tmdb.org/t/p/w342/oUkeyrXvGUEylOQtlYMv9esNRiu.jpg" || echo 실패: the-substance
if not exist "posters\inside-out-2.jpg" curl.exe -sfL -o "posters\inside-out-2.jpg" "https://image.tmdb.org/t/p/w342/x2BHx02jMbvpKjMvbf8XxJkYwHJ.jpg" || echo 실패: inside-out-2
if not exist "posters\zootopia-2.jpg" curl.exe -sfL -o "posters\zootopia-2.jpg" "https://image.tmdb.org/t/p/w342/ib6v6qUXzez1x2qIOLN7C0yJNPQ.jpg" || echo 실패: zootopia-2
if not exist "posters\infinity-castle.jpg" curl.exe -sfL -o "posters\infinity-castle.jpg" "https://image.tmdb.org/t/p/w342/a6wK0b9cIEnpu1og37ZyBah0Bv6.jpg" || echo 실패: infinity-castle
if not exist "posters\moving-on.jpg" curl.exe -sfL -o "posters\moving-on.jpg" "https://image.tmdb.org/t/p/w342/6LQ1VQAaXskx59PRzG3yHDTQ4Mo.jpg" || echo 실패: moving-on
if not exist "posters\microhabitat.jpg" curl.exe -sfL -o "posters\microhabitat.jpg" "https://image.tmdb.org/t/p/w342/wOHA475h4iV1dXgDhoYHXdcnSSo.jpg" || echo 실패: microhabitat
if not exist "posters\monster-2023.jpg" curl.exe -sfL -o "posters\monster-2023.jpg" "https://image.tmdb.org/t/p/w342/7KEoTrMxLQILdhdcoQ2JGh8dilX.jpg" || echo 실패: monster-2023
if not exist "posters\segyeui-juin.jpg" curl.exe -sfL -o "posters\segyeui-juin.jpg" "https://image.tmdb.org/t/p/w342/1UrMMAChGXORYrbCef7GNId98Vk.jpg" || echo 실패: segyeui-juin
echo 완료. 포스터 출처 TMDB
pause
