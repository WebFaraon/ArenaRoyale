Arena Royale - skin MITIC pentru Hawkeye (sniper): sn_phoenix

sprites/sn_phoenix.png  320x576, acelasi cadru ca restul skin-urilor (viewBox -40 0 80 144, teava in jos, 4 px/unitate).
svg/sn_phoenix.svg      aceeasi imagine, pentru lobby / Arsenal.
icons/sn_phoenix.svg    iconita orizontala pentru carduri.
weapon-skin-sprites.json  intrarea sn_phoenix: hands, muzzle, accent + "fx" cu parametrii efectelor.

Spre deosebire de celelalte skin-uri, Phoenix are SI cod, nu doar imagine (vezi "fx" din json):
 - aura pulsanta in jurul miezului, - aripi care "respira" (scaleX +-3%),
 - particule de jar emise din penele de la coada si aripi (in spatiul lumii, raman in urma cand te misti),
 - flash la tragere in forma de stea de flacari, - glont cu dara de foc si jar.
Efectele se pornesc doar pentru jucatorii aflati pe ecran. Plafon de 400 de particule per client.
Pastreaza o setare "Efecte skin" (Redus/Normal) pentru dispozitive slabe: Redus = fara particule, doar aura.
