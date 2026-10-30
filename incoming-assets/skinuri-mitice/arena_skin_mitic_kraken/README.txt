Blastridge - skin MITIC pentru Boomer (shotgun): sg_kraken ("Kraken")

SKINUL E STRICT COSMETIC: gura de foc e una singura (muzzle), alicele raman cele ale armei (numar, dispersie, viteza, raza).
Bulele sunt doar aspectul vizual al alicelor.

sprites/sg_kraken.png      320x576, acelasi cadru ca restul skin-urilor (viewBox -40 0 80 144, teava in jos, 4 px/unitate). Imaginea statica completa.
svg/sg_kraken.svg          aceeasi imagine, pentru lobby / Arsenal.
icons/sg_kraken.svg        iconita orizontala pentru carduri.
layers/                    sg_kraken_tentL.png, sg_kraken_tentR.png, sg_kraken_base.png (toate cadru complet 320x576).
                           Ordine de desen: tentL, tentR, base. Tentaculele se rotesc in jurul pivotului din json (+-3.4 grade, bici de 8 grade la tragere).
weapon-skin-sprites.json   intrarea sg_kraken: hands, muzzle, layers, fx.

Efectele (aura, pete luminoase, bule, stropi de cerneala la gura sifonului) sunt cod, vezi "fx".
Setare "Efecte skin" (Redus/Normal): Redus = imaginea statica + aura.
