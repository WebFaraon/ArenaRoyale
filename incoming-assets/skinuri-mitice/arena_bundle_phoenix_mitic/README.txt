BUNDLE PHOENIX = personaj (acest folder) + sniper sn_phoenix (pachet separat) + rucsac (backpack/)
ARENA ROYALE - skin mitic de PERSONAJ "Phoenix" (phoenix_mythic) + bundle cu sniperul Phoenix (sn_phoenix)
Strict cosmetic: cercul de coliziune ramane r=36; aripile, coada si creasta sunt doar imagine. Mainile si arma raman ca acum (culori: base #FF6B1A, dark #B0200F).
Stil: corpul foloseste exact constructia celorlalte skinuri de personaj (cerc r=36 din grup 100x100 scara 0.8182, lumina stanga-sus, inel auriu interior, contur negru #0B0F1A latime 6.2 in grup); accesoriile au contur negru 3, culori plate, fara degradeuri.
sprites/phoenix_mythic.png   - sprite complet 400x400 (cadru extins: aripi, coada, creasta). Centrul corpului la (199.7, 179.2) px, raza corpului 92.3 px (=36 unitati, aceeasi scara ca la celelalte skinuri: 256 px = 100 unitati)
svg/, icons/                 - sursa vectoriala si icoana pentru lobby/magazin
layers/                      - wingL, wingR, tail, crest, base: cadru complet 400x400, desenate in aceasta ordine
character-skin-phoenix_mythic.json - pivoturi, miscare, efecte, bundle
Efecte (cod): aura, aripi care bat (mai tare la mers si la foc), coada se leagana, creasta palpaie, scantei care se ridica, urma la mers, efect de renastere la intrarea in meci.
Setarea "Efecte skin" Redus = imagine statica + aura.
Nota: spritele existente sunt 256x256 cu pivot (128,118); acesta are alt cadru si alt pivot (vezi JSON), deci codul de desen trebuie sa citeasca frame/pivot din JSON, nu sa le presupuna.
