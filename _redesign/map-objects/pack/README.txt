Arena Royale - obiecte de harta, grupul 1 (copaci, brad, tufis, pietre), 3 sezoane

png/<sezon>/<id>.png  - pentru meci, 3 px pe unitate-lume. Centrul imaginii = pozitia obiectului.
svg/<sezon>/<id>.svg  - aceeasi imagine vectoriala (lobby / editor de harta / alte rezolutii).
map-objects.json      - pentru fiecare id: visualRadius (raza desenului, in unitati), frameRadius
                        (jumatate din cadru), pngSize. Desenare: drawImage la (x - frameRadius, y - frameRadius),
                        marime 2*frameRadius unitati.
Sezoane: vara, toamna, iarna (aceleasi id-uri, aceeasi marime).

Atentie: umbra e inclusa in imagine (spre dreapta-jos, lumina din stanga-sus). Nu roti obiectele
pentru variatie (umbra ar iesi in alta directie); foloseste oglindire orizontala si scara 0.9-1.1.

Coliziune sugerata (raza, unitati) - doar sugestie, se pastreaza ce e deja in joc daca exista:
  copac_mare   trunchi ~22 (coroana fara coliziune, se poate face semi-transparenta cand jucatorul e dedesubt)
  copac_mediu  trunchi ~18
  copac_mic    trunchi ~14
  brad         trunchi ~16
  tufis        fara coliziune (ascunde jucatorul, optional)
  piatra_mare  ~40
  piatra_medie ~28
  pietre_mici  fara coliziune (decor)
