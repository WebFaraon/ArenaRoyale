Arena Royale - skin MITIC pentru Vanguard (assault): as_storm ("Furtuna")

sprites/as_storm.png     320x576, acelasi cadru ca restul skin-urilor (viewBox -40 0 80 144, teava in jos, 4 px/unitate).
                         Imaginea statica completa (cu inelele intr-o pozitie fixa): pentru lista, lobby si rezerva.
svg/as_storm.svg         aceeasi imagine, pentru lobby / Arsenal.
icons/as_storm.svg       iconita orizontala pentru carduri.
layers/                  as_storm_base.png (fara inele si fara fulger) + 3 inele separate (240x240, centrate pe miez).
                         In meci: se deseneaza baza, apoi cele 3 inele rotite in jurul lui ringCenter [0,56], apoi fulgerul din furca.
weapon-skin-sprites.json intrarea as_storm: hands, muzzle, accent, layers si "fx" (parametrii efectelor).

Efectele sunt cod, nu imagini: fulger zigzag intre varfurile furcii (refacut de ~12 ori/s), aura pulsanta,
scantei si arce scurte, flash la tragere si gloante-fulger (zigzag). Doar pentru jucatorii de pe ecran.
Plafon de ~300 de scantei per client. Setare "Efecte skin" (Redus/Normal): Redus = baza statica + aura, fara inele rotite si scantei.
