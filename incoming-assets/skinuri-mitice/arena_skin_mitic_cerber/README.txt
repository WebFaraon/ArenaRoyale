Blastridge - skin MITIC pentru Falcon (burst): bu_cerber ("Cerber")  [v2: subtire, o singura gura]

SKINUL E STRICT COSMETIC. Rafala de 3 pleaca din ACELASI punct ca la arma normala (campul "muzzle" = gura capului din mijloc).
Capetele din lateral sunt doar decor: nu trag si nu schimba nimic in mecanica.

sprites/bu_cerber.png      320x576, acelasi cadru ca restul skin-urilor (viewBox -40 0 80 144, teava in jos, 4 px/unitate). Imaginea statica completa.
svg/bu_cerber.svg          aceeasi imagine, pentru lobby / Arsenal.
icons/bu_cerber.svg        iconita orizontala pentru carduri.
layers/                    bu_cerber_base.png (coada, trunchi, gaturi, lant; FARA capete) + 3 capete separate (104x144, viewBox -13 -17 26 36).
                           Fiecare cap se deseneaza la headPivots[i] (x, y, unghi, scara) din json, cu leganare de +-3.2 grade.
                           La fiecare glont: capul din mijloc se arunca 2.6 unitati inainte, cele laterale 45% din asta.
weapon-skin-sprites.json   intrarea bu_cerber: hands, muzzle, layers, fx.

Efectele (flacari fantoma, ochi, flash la gura centrala, gloante-flacara) sunt cod, vezi "fx".
Setare "Efecte skin" (Redus/Normal): Redus = imaginea statica + aura.
