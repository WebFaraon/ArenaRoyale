# Arsenal - specificatie pentru implementare

Referinta vizuala: arsenal-design.png + arsenal-design.html (1440x810, stil, culori, fonturi Lilita One / Nunito).
Designul e un mock: textele si cifrele din el sunt exemple. Datele reale vin din joc, ca mai jos.

## Structura (3 coloane)
1. Stanga - "ARMELE TALE": lista armelor grupate pe clasa, in ordinea din weapons.json (classes).
   Rand: iconita armei (cu skinul echipat), numele propriu (Scout, Stinger, Vanguard, Falcon, Boomer, Hawkeye),
   "Clasa · mod de tragere", punct colorat cu accentul armei, numarul de kill-uri (weapon_stats[id].kills).
   Randul selectat: chenar albastru (#3aa0ff), fundal mai deschis.
2. Centru - arma selectata:
   - eticheta "CLASA · MOD" (ex. "SNIPER · MANUAL"), numele mare, "Skin: <nume> · <raritate>" (daca e echipat).
   - "CULOAREA GLONTULUI": bulina + numele culorii, din accentul skinului echipat (sau al armei).
   - previzualizarea mare a armei, culcata, cu skinul selectat (folosim svg/ din pachetul de skin-uri).
   - barele de statistici, calculate din weapons.json, relative la cea mai buna arma (0..1):
     DAMAGE, CADENTA (din shootCd, inversat), BATAIE (bulletSpeed*bulletLife), PRECIZIE (din spread),
     INCARCATOR (ammoMax, cu numarul exact), REINCARCARE (inversat). Eticheta text: Foarte mica / Mica / Medie / Mare / Foarte mare.
   - butoane: "FOLOSESTE IN MECI" (seteaza arma aleasa pentru meci, ca meniul de arme de acum)
     si "VEZI IN MANA" (arata personajul cu arma si skinul in mana - etapa D).
3. Dreapta:
   - "STATISTICILE TALE CU <NUME>": 4 casete din weapon_stats:
     KILL-URI (kills), ZOMBI UCISI (zombieKills), PRECIZIE (hits/shots, %), DAMAGE TOTAL (damage).
     (Nu avem "meciuri jucate" sau "cel mai lung kill" - nu le inventa.)
   - in locul "Nivel arma": progresul spre skinul cu deblocare: "Deblochezi <skin> la 50 de kill-uri", bara kills/50.
     Daca e deja deblocat: "Toate skin-urile cu deblocare obtinute" sau se ascunde.
   - "SKINURI <NUME>": "x / 5 detinute" (Standard + 4). Grila de carduri:
     Standard (mereu detinut) + cele 4 skin-uri din weapon-skins.json.
     Card: eticheta raritate colorata (RAR albastru, EPIC mov, LEGENDAR auriu), iconita, nume, si jos una din:
       - "ECHIPAT" (badge auriu, card cu chenar auriu)
       - "DETINUT" (verde) - click = echipeaza
       - pret cu lacat + moneda/diamant - click = confirmare cumparare
       - "50 kill-uri" cu lacat pentru skinul cu unlock (nu se poate cumpara)
     Click pe card = previzualizare in centru; echiparea/cumpararea prin butoane clare, cu confirmare la cumparare.

## Reguli
- Toate cumpararile/echiparile prin API-urile existente (/api/weapon-skins/buy si /equip), serverul decide.
- Banii din bara de sus se actualizeaza dupa cumparare. Eroare de la server = mesaj scurt, fara schimbare locala.
- Fara diacritice probleme: foloseste textele exact ca in restul jocului.
- Responsive: pe ecran ingust, coloanele trec una sub alta (lista armelor ca rand orizontal scrollabil).
