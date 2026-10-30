Blastridge - skin-uri de arme (24)

sprites/<skinId>.png  - pentru meci, 320x576, ACELASI cadru ca sprite-urile armelor de baza
                        (viewBox -40 0 80 144, coltul stanga-sus la (-40, 6) fata de centrul corpului,
                        teava in jos, 4 px pe unitate). Se deseneaza exact ca arma de baza.
svg/<skinId>.svg      - aceeasi imagine in SVG, pentru lobby / Arsenal (claritate pe ecrane dense).
icons/<skinId>.svg    - iconita orizontala (arma culcata), pentru carduri, kill-feed, magazin.
weapon-skin-sprites.json - pentru fiecare skin: weapon (id intern), sprite, hands si muzzle
                        (coordonate fata de centrul corpului, ca in weapons.json), accent.
                        Unele skin-uri au alta forma, deci hands/muzzle pot diferi de arma de baza:
                        se folosesc valorile din acest fisier cand skin-ul e echipat.

Id-urile se potrivesc cu public/data/weapon-skins.json.
Loc recomandat: public/images/weapons/skins/
