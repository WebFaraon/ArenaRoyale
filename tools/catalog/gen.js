const fs = require('fs');
const D = JSON.parse(fs.readFileSync(require('path').join(__dirname, 'data.json'), 'utf8'));
const SPR = require('./sprites-towers.js'), IDEAS2 = require('./ideas-towers.js'), ZSPR = require('./sprites-zombies.js'), IDEAS3 = require('./ideas-zombies.js');
const svgUri = svg => 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
const src = fs.readFileSync(require('path').join(__dirname, '..', '..', 'server.js'), 'utf8');
const sv = n => +new RegExp('const ' + n + '\\s*=\\s*(\\d+)').exec(src)[1];
const PLAYER = sv('PLAYER_SIZE'), AW = sv('ARENA_W'), AH = sv('ARENA_H');
const f = (n, d = 1) => { const v = Math.round(n * 10 ** d) / 10 ** d; return String(v).replace('.', ','); };
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const img = (src, alt, cls = '') => `<img class="${cls}" src="${src}" alt="${esc(alt)}" loading="lazy" decoding="async">`;

// ---------------- zombies ----------------
const NAMES = { normal: 'Normal', runner: 'Runner', tank: 'Tank', spitter: 'Scuipător', exploder: 'Exploziv', brute: 'Brută', summoner: 'Summoner', minion: 'Minion', shielded: 'Shielded', screamer: 'Screamer', ghoul: 'Ghoul', stalker: 'Stalker' };
const ORDER = ['normal', 'runner', 'tank', 'spitter', 'exploder', 'brute', 'shielded', 'screamer', 'summoner', 'minion', 'ghoul', 'stalker'];
const ROLE = { normal: ['Vânează', 'go'], runner: ['Vânează', 'go'], tank: ['Asediu', 'build'], spitter: ['Distanță', 'sky'], exploder: ['Kamikaze', 'bad'], brute: ['Vânează', 'go'], summoner: ['Suport', 'sky'], minion: ['Vânează', 'go'], shielded: ['Asediu', 'build'], screamer: ['Vânează', 'go'], ghoul: ['Vânează · val 13+', 'go'], stalker: ['Vânează · val 13+', 'go'] };
const d = D.defs;
const SPECIAL = {
  normal: 'Cel mai simplu zombi: merge spre cel mai apropiat jucător. De la valul 13 îl înlocuiește Ghoul.',
  runner: 'Rapid și fragil. De la valul 13 îl înlocuiește Stalker.',
  tank: 'Tip de asediu: merge la baricade, turete și bază și le sparge. Nu poate fi împins de jucători (e un zid pentru ei). Armură ' + d.tank.armor + '.',
  spitter: `Merge spre bază și se oprește când ceva e la ${d.spitter.ranged.range} de el (întâi o turetă, apoi jucător, baricadă, bază). Scuipă acid la ${f(d.spitter.ranged.cd)} s; stropul (rază ${d.spitter.ranged.splash}) rănește construcțiile cu ${d.spitter.ranged.sdmg}, jucătorii cu ${d.spitter.ranged.pdmg}, baza cu ${d.spitter.ranged.bdmg}.`,
  exploder: `Caută cea mai apropiată construcție sau jucător în ${d.exploder.explode.seek} și explodează la atingere: rază ${d.exploder.explode.r}, construcții ${d.exploder.explode.sdmg}, jucători ${d.exploder.explode.pdmg}, bază ${d.exploder.explode.bdmg}. Ucis pe drum nu explodează și nu lasă monede.`,
  brute: `Lentă și grea, armură ${d.brute.armor}: din fiecare lovitură se scad ${d.brute.armor}, dar niciodată mai mult de patru cincimi din ea. Nu poate fi împinsă de jucători.`,
  summoner: `Nu urmărește și nu lovește. La ${d.summoner.summon.first} s, apoi la fiecare ${d.summoner.summon.every} s cheamă ${d.summoner.summon.count} minioni, cel mult ${d.summoner.summon.max} vii deodată. Minionii rămân după moartea lui.`,
  minion: 'Chemat de Summoner. Nu crește cu valul (viața rămâne fixă).',
  shielded: `Scut în față (±${Math.round(d.shielded.shield.half * 180 / Math.PI)}°): gloanțele jucătorilor și loviturile turetelor cu mitralieră din față nu trec. Din lateral sau din spate se rănește ca oricare. Tesla, Bomb Tower și Flamethrower trec peste scut. Nu urmărește jucători.`,
  screamer: `Aleargă la cel mai apropiat jucător de la apariție. La ${d.screamer.scream.near} de el se oprește ${f(d.screamer.scream.windup)} s și țipă, o singură dată: orice turetă din ${d.screamer.scream.range} de zombi e amețită ${d.screamer.scream.stun} s (nu trage, nu arde, nu vindecă). Poate fi atras departe de turete.`,
  ghoul: 'Versiunea întunecată a zombiului normal, de la valul 13, în locul lui.',
  stalker: 'Versiunea întunecată a runner-ului, de la valul 13, în locul lui. (Nu are legătură cu ideea „Stalker" de mai jos.)',
};
const TARGET = z => {
  if (z === 'spitter') return 'Ținta o alege singur: turetă, apoi jucător, baricadă, bază (de la distanță)';
  if (z === 'exploder') return 'Cea mai apropiată construcție sau jucător (în ' + d.exploder.explode.seek + ')';
  if (z === 'summoner') return 'Merge spre bază; nu atacă';
  if (z === 'screamer') return 'Jucătorii, de oriunde; apoi construcții și baza';
  return d[z].hunts ? 'Jucători (în 320), apoi baricade și turete (în 130), apoi baza' : 'Doar baricade, turete și baza; nu lovește jucătorii';
};
const speedWord = s => s >= 120 ? 'foarte rapid' : s >= 80 ? 'rapid' : s >= 55 ? 'mediu' : s >= 40 ? 'lent' : 'foarte lent';
const stat = (k, v, sub = '') => `<div><dt>${k}</dt><dd>${v}${sub ? `<small>${sub}</small>` : ''}</dd></div>`;
function zcard(z) {
  const q = d[z], w = D.waves[z], role = ROLE[z];
  const hit = q.dmg ? `${q.dmg}` : '—';
  const dps = q.dmg ? `${f(q.dmg / q.attackCd)} pe secundă (la ${f(q.attackCd)} s)` : '';
  const when = z === 'minion' ? 'Chemat de Summoner' : `De la valul ${w.first} · până la ${w.max} pe val (solo)`;
  const coins = `${q.coinsMin}–${q.coinsMax}`;
  return `<article class="zc" id="z-${z}"><div class="zt">${img(D.zimg[z], NAMES[z] + ', vedere de sus')}</div>
  <div class="zb"><header><h3>${NAMES[z]}</h3><span class="pill ${role[1]}">${role[0]}</span></header><p class="when">${when}</p>
  <dl class="stats">
   ${stat('Viață', q.hp, q.noScale ? 'nu crește cu valul' : 'crește cu valul')}
   ${stat('Viteză', `${q.chaseSpd}`, `${speedWord(q.chaseSpd)} · patrulare ${q.patrolSpd}`)}
   ${stat('Daună jucător', hit, dps)}
   ${stat('Daună baricade / bază', q.baseDmg || '—', q.baseDmg ? 'pe lovitură' : '')}
   ${stat('Rază atac', q.attackR || '—', q.ranged ? 'scuipă de la ' + q.ranged.range : '')}
   ${stat('Armură', q.armor || '—')}
   ${stat('Monede', coins, 'la moarte')}
   ${stat('Greutate', q.mass, q.heavy ? 'jucătorii nu îl pot împinge' : '')}
  </dl>
  <p class="tg"><b>Ce atacă:</b> ${esc(TARGET(z))}</p><p class="sp">${esc(SPECIAL[z])}</p></div></article>`;
}
const ztable = ['normal', 'runner', 'tank', 'spitter', 'exploder', 'shielded', 'screamer', 'brute', 'summoner', 'ghoul', 'stalker'].sort((a, b) => D.waves[a].first - D.waves[b].first).map(z => {
  const q = d[z], w = D.waves[z];
  return `<tr><th scope="row"><span class="mini">${img(D.zimg[z], '')}</span>${NAMES[z]}</th><td>${w.first}</td><td>${q.hp}</td><td>${q.chaseSpd}</td><td>${q.dmg || '—'}</td><td>${q.baseDmg || '—'}</td><td>${q.armor || '—'}</td><td>${q.coinsMin}–${q.coinsMax}</td></tr>`;
}).join('');

// ---------------- turrets ----------------
const K = D.turret.kinds, KEYS = { mg: 2, tesla: 3, heal: 4, bomb: 5, flame: 6, support: 7 };
const KORDER = ['mg', 'tesla', 'bomb', 'flame', 'heal', 'support'];
const KDESC = {
  mg: 'Trage în cel mai apropiat zombi din rază (doar zombi, niciodată jucători), cu linie liberă printre copaci, pietre și bază. Lovitura ajunge când vezi glonțul lovind. Muniție infinită. Scutul unui Shielded oprește loviturile ei din față.',
  tesla: `Fulgerul sare în lanț: de la zombiul lovit la cel mai apropiat neatins aflat la cel mult ${K.tesla.chain.reach}, de până la ${K.tesla.chain.jumps} ori (trei fulgere pe lovitură). Fiecare lovește cu toate daunele. Trece peste scutul Shielded-ului.`,
  bomb: 'Aruncă o bombă în cel mai apropiat zombi, peste copaci, pietre și bază (nu are nevoie de linie liberă). La aterizare lovește toți zombii din raza splash. Nu rănește jucători, construcții sau bază. Trece peste scut.',
  flame: 'Rază scurtă, foc continuu: la fiecare 0,25 s arde pe loc toți zombii din con. Conul arde și prin copaci. Nu rănește jucători, construcții sau bază. Trece peste scut; zombii arși se înroșesc.',
  heal: 'Vindecă toți jucătorii vii din rază, în fiecare tick. Raza se vede mereu, pentru toți. Nu trage.',
  support: `Nu trage. O dronă (${K.support.drone.speed} u/s) zboară la cea mai avariată baricadă sau turetă din rază (niciodată turnul însuși) și o repară încet, fără cost; fără nimic avariat se întoarce și așteaptă.`,
};
const kmax = k => { const q = K[k]; return `max ${q.maxPerRoom}${q.perExtraPlayer ? ' (+' + q.perExtraPlayer + ' pentru fiecare jucător în plus)' : ''}`; };
function sprite(k, i) {
  const t = D.timg[k][i];
  if (k === 'support') return `<div class="pair">${img(t.base, 'baza turnului')}${img(t.head, 'drona', 'drone')}</div>`;
  return `<div class="pair">${img(t.base, K[k].name)}${t.head ? img(t.head, 'capul', 'head') : ''}</div>`;
}
function rowsFor(k) {
  const T = K[k].tiers, r = [];
  const row = (label, fn, unit = '') => r.push(`<tr><th scope="row">${label}</th>${T.map((t, i) => `<td>${fn(t, i)}${unit}</td>`).join('')}</tr>`);
  row('Viață', t => t.hp);
  row('Preț total', t => t.total);
  row('Upgrade în nivel', (t, i) => i ? `${t.up} monede · ${f(t.ms / 1000)} s` : '—');
  if (k === 'heal') { row('Rază (din centru)', t => t.range); row('Vindecă', t => t.rate, ' viață/s'); }
  else if (k === 'support') { row('Rază (din centru)', t => t.range); row('Reparare', t => t.rate, ' viață/s'); }
  else {
    row('Rază (din centru)', t => t.range);
    row('Cadență', t => `${f(t.cd, 2)} s <small>(${f(1 / t.cd)}/s)</small>`);
    row(k === 'tesla' ? 'Damage per fulger' : k === 'flame' ? 'Damage per lovitură, fiecărui zombi din con' : 'Damage', t => t.dmg);
    row(k === 'bomb' ? 'DPS pe zombi (în splash)' : k === 'tesla' ? 'DPS pe țintă' : k === 'flame' ? 'DPS pe zombi din con' : 'DPS', t => f(t.dmg / t.cd, 0));
    if (k === 'bomb') row('Rază splash', t => t.splash);
    if (k === 'flame') row('Con (semi-unghi)', t => `${Math.round(t.cone * 180 / Math.PI)}°`);
  }
  return r.join('');
}
function tblock(k) {
  const q = K[k];
  const T = q.tiers;
  return `<section class="tb" id="t-${k}"><header><div><h3>${q.name}</h3><p>${esc(KDESC[k])}</p></div><div class="chips"><span class="chip">tasta ${KEYS[k]}</span><span class="chip">${kmax(k)}</span></div></header>
  <div class="lv">${T.map((t, i) => `<figure><div class="tile">${sprite(k, i)}</div><figcaption><b>${t.name}</b><span>${t.total} monede</span></figcaption></figure>`).join('')}</div>
  <div class="scroll"><table><thead><tr><th></th>${T.map(t => `<th scope="col">${t.name}</th>`).join('')}</tr></thead><tbody>${rowsFor(k)}</tbody></table></div></section>`;
}
const B = D.barricade;
const bblock = `<section class="tb" id="t-barricade"><header><div><h3>Baricadă</h3><p>Zid ${B.long}×${B.short} (culcat sau în picioare). Oprește jucătorii și zombii; gloanțele trec. Zombii o sparg când nu au un jucător la sub 320, apoi merg la bază. Reparare 1 s pentru jumătate din prețul nivelului, proporțional cu ce lipsește; upgrade pe loc.</p></div><div class="chips"><span class="chip">tasta 1</span><span class="chip">max ${B.maxPerRoom}</span></div></header>
  <div class="lv four">${B.tiers.map((t, i) => `<figure><div class="tile bt">${img(D.bimg[i], t.name)}</div><figcaption><b>${t.name}</b><span>${t.total} monede</span></figcaption></figure>`).join('')}</div>
  <div class="scroll"><table><thead><tr><th></th>${B.tiers.map(t => `<th scope="col">${t.name}</th>`).join('')}</tr></thead><tbody>
  <tr><th scope="row">Viață</th>${B.tiers.map(t => `<td>${t.hp}</td>`).join('')}</tr>
  <tr><th scope="row">Preț total</th>${B.tiers.map(t => `<td>${t.total}</td>`).join('')}</tr>
  <tr><th scope="row">Upgrade în nivel</th>${B.tiers.map((t, i) => `<td>${i ? t.up + ' monede · ' + f(t.ms / 1000) + ' s' : '—'}</td>`).join('')}</tr></tbody></table></div></section>`;
const mgLimit = [1, 2, 3, 4].map(n => `${n} ${n === 1 ? 'jucător' : 'jucători'}: ${K.mg.maxPerRoom + K.mg.perExtraPlayer * (n - 1)}`).join(' · ');

// ---------------- ideas ----------------
const IT = D.idea.towers, IZ = D.idea.zombies;
const prop = rows => `<div class="prop"><span class="pp">Propunere de valori · nu e în joc</span><dl class="stats">${rows.map(([a, b, c]) => stat(a, b, c || '')).join('')}</dl></div>`;
function itower(name, key, desc, rows) {
  const cards = IT[name];
  return `<section class="tb idea" id="i-${key}"><header><div><h3>${name}</h3><p>${esc(desc)}</p></div><div class="chips"><span class="chip warn">idee</span></div></header>
  <div class="lv">${cards.map((c, i) => `<figure><div class="tile"><div class="pair">${c.map((u, j) => img(u, name + ' nivel ' + (i + 1), j ? 'head' : '')).join('')}</div></div><figcaption><b>Nivel ${i + 1}</b></figcaption></figure>`).join('')}</div>${prop(rows)}</section>`;
}
function izombie(name, key, desc, rows) {
  return `<article class="zc idea" id="i-${key}"><div class="zt">${img(IZ[name], name + ', vedere de sus')}</div><div class="zb"><header><h3>${name}</h3><span class="pill warn">idee</span></header><p class="sp">${esc(desc)}</p>${prop(rows)}</div></article>`;
}
const ideasT = [
  itower('Frost Tower', 'frost', 'Încetinește zombii din rază. Merge bine cu Bomb Tower și Tesla: zombii încetiniți stau mai mult grupați.', [
    ['Viață', '280 / 450 / 700'], ['Preț total', '35 / 80 / 150'], ['Rază', '260 / 290 / 320'], ['Încetinire', '30% / 40% / 50%', 'cât timp stau în rază + 1,5 s'], ['Damage', '0 / 4 / 8', 'la fiecare puls de 1,2 s'], ['De gândit', 'tank și brută încetinite doar pe jumătate']]),
  itower('Mină', 'mina', 'Se pune pe jos și explodează la atingere, o singură folosință. Cele trei mărimi sunt trei niveluri de putere.', [
    ['Damage', '90 / 150 / 240', 'tuturor zombilor din rază'], ['Rază explozie', '60 / 75 / 90'], ['Rază de declanșare', '24'], ['Preț', '8 / 15 / 25', 'cumpărată pe bucată'], ['Viață', 'nu are', 'zombii o declanșează, nu o sparg'], ['Limită', '10 pe hartă']]),
  itower('Poison Tower', 'poison', 'Lasă pe jos o zonă de otravă care rănește ce intră în ea câteva secunde.', [
    ['Viață', '300 / 480 / 720'], ['Preț total', '40 / 90 / 160'], ['Rază de aruncare', '300 / 320 / 340'], ['Zonă de otravă', 'rază 70 / 85 / 100', 'durează 4 / 5 / 6 s'], ['Damage', '12 / 20 / 30 pe secundă', 'fiecărui zombi din zonă'], ['Cadență', '3,5 / 3,2 / 3,0 s', 'între zone']]),
].join('');
const ideasZ = [
  izombie('Medic', 'medic', 'Vindecă zombii din jur. Primul pe care trebuie să-l omori.', [['Viață', '220'], ['Viteză', '70', 'merge după grup'], ['Vindecare', '12 viață/s', 'zombilor din 160'], ['Daună', '—', 'nu atacă'], ['De la valul', '8'], ['Monede', '8–12']]),
  izombie('Bloater', 'bloater', 'Umflat și lent. La moarte lasă un nor toxic care rănește jucători și construcții.', [['Viață', '700'], ['Viteză', '30'], ['Daună jucător', '30'], ['La moarte', 'nor toxic, rază 110, 5 s', '14/s jucători, 20/s construcții'], ['De la valul', '11'], ['Monede', '10–15']]),
  izombie('Splitter', 'splitter', 'La moarte se desparte în 2–3 zombi mai mici.', [['Viață', '260'], ['Viteză', '70'], ['Daună jucător', '25'], ['La moarte', '2–3 mici', 'viață 70, viteză 100, daună 10; nu se mai despart'], ['De la valul', '9'], ['Monede', '4–6']]),
  izombie('Burrower', 'burrower', 'Intră în pământ, nu poate fi lovit, și iese lângă turete sau bază.', [['Viață', '240'], ['Viteză', '90', 'sub pământ 150'], ['Daună jucător', '30'], ['Sub pământ', '2,5 s, nu poate fi lovit', 'când e la sub 400 de o turetă sau bază'], ['Iese', 'la sub 90 de ținta aleasă'], ['De la valul', '12']]),
  izombie('Stalker', 'stalker', 'Semi-transparent, ocolește turetele și merge direct la jucător. Atenție: în joc există deja un „stalker" (runner-ul întunecat de la valul 13); ideea asta ar avea nevoie de alt nume.', [['Viață', '180'], ['Viteză', '118'], ['Daună jucător', '28'], ['Turetele', 'îl văd doar la jumătate din rază'], ['De la valul', '14'], ['Monede', '7–10']]),
].join('');


// second round of tower ideas
const STYLES = ['Trăgător', 'Acțiune', 'Constructor', 'Tactician', 'Apărător', 'Explorator', 'Economist', 'Echipă', 'Apărare apropiată', 'Trăgător de elită'];
function itower2(t) {
  const hdr = `<th></th>` + [1, 2, 3].map(n => `<th scope="col">Nivel ${n}</th>`).join('');
  const body = t.rows.map(r => r.length === 2 ? `<tr><th scope="row">${esc(r[0])}</th><td colspan="3">${esc(r[1])}</td></tr>` : `<tr><th scope="row">${esc(r[0])}</th>${r.slice(1).map(v => `<td>${esc(v)}</td>`).join('')}</tr>`).join('');
  return `<section class="tb idea" id="i-${t.key}"><header><div><h3>${t.name}</h3><p>${esc(t.desc)}</p></div><div class="chips"><span class="chip warn">idee</span><span class="chip">${esc(t.style)}</span><span class="chip">${t.limit}</span></div></header>
  <div class="lv">${[1, 2, 3].map(n => `<figure><div class="tile"><div class="pair">${img(svgUri(SPR[t.key](n)), t.name + ' nivel ' + n)}</div></div><figcaption><b>Nivel ${n}</b></figcaption></figure>`).join('')}</div>
  <div class="prop"><span class="pp">Propunere de valori · nu e în joc</span><div class="scroll"><table><thead><tr>${hdr}</tr></thead><tbody>${body}</tbody></table></div></div>
  <ul class="why"><li>${esc(t.who)}</li><li><b>Merge bine cu:</b> ${esc(t.pairs)}</li><li><b>Slăbiciune:</b> ${esc(t.weak)}</li></ul></section>`;
}
const MATRIX = [
  ['Trăgător', 'Mitralieră', 'War Banner, Railgun'],
  ['Acțiune', '—', 'Heavy Mount'],
  ['Constructor', 'Support Tower, baricade', 'Overclock Core, Pylon Fence, Shield Dome'],
  ['Tactician', 'Tesla, Bomb Tower', 'Gravity Well, Thumper, Warp Gate'],
  ['Apărare apropiată', 'Flamethrower', 'Saw Ring'],
  ['Economist', '—', 'Mint'],
  ['Echipă', 'Health Station', 'Revival Altar'],
];
const matrix = `<div class="scroll"><table><thead><tr><th>Stil de joc</th><th>Ce există acum</th><th>Idei noi</th></tr></thead><tbody>${MATRIX.map(r => `<tr><th scope="row">${r[0]}</th><td>${r[1]}</td><td>${r[2]}</td></tr>`).join('')}</tbody></table></div>`;
const ideasT2 = IDEAS2.map(itower2).join('');


// third list: new zombies
function izombie3(z) {
  const stats = z.rows.map(r => stat(r[0], r[1], r[2] || '')).join('');
  return `<article class="zc idea${z.boss ? ' boss' : ''}" id="i-${z.key}"><div class="zt">${img(svgUri(ZSPR[z.key]()), z.name + ', vedere de sus')}</div><div class="zb"><header><h3>${z.name}</h3><span class="pill ${z.role}">${z.tag}</span></header>
  <p class="sp">${esc(z.desc)}</p><p class="tg"><b>Ce testează:</b> ${esc(z.tests)}</p>
  <div class="prop"><span class="pp">Propunere de valori · nu e în joc</span><dl class="stats">${stats}</dl></div>
  <p class="sp"><b class="gold">Cum răspunzi:</b> ${esc(z.counter)}</p></div></article>`;
}
const ZT = [
  ['Turnurile', 'Jammer, Leech, Leaper, Gargoyle, Ram', 'Support Tower, Shield Dome, jucători lângă turnuri, Mitralieră și Tesla contra celor din aer'],
  ['Jucătorii', 'Grappler, Slime, Berserker', 'Acoperire față de cârlig, Flamethrower pe dâră, Railgun înainte de furie'],
  ['Economia', 'Looter, Mimic', 'Cheltuiește monedele; trage de departe în grămezile suspecte'],
  ['Hoarda însăși', 'Necromancer, Herald', 'Țintește-i primii (Railgun); flăcări și bombe pe cadavre'],
  ['Surprize', 'Mimic, Looter, Leaper, Gargoyle', 'Atenție constantă; nu poți apăra doar un lucru'],
  ['Boss', 'Brood Mother (val 15), Colossus (val 20)', 'Coordonare: o parte a echipei pe ouă, restul pe regină'],
];
const zmatrix = `<div class="scroll"><table><thead><tr><th>Ce provoacă</th><th>Zombi</th><th>Cum răspunzi</th></tr></thead><tbody>${ZT.map(r => `<tr><th scope="row">${r[0]}</th><td>${r[1]}</td><td style="white-space:normal;min-width:22em">${r[2]}</td></tr>`).join('')}</tbody></table></div>`;
const ROUTE = [
  ['6', 'Looter', 'Primul zombi care îți fură banii: înveți să cheltuiești.'],
  ['7', 'Mimic, Slime', 'Prima „ladă" capcană și prima dâră lipicioasă.'],
  ['8', 'Ram, Leaper', 'Zidurile nu mai sunt de ajuns: unul le sparge, unul sare peste ele.'],
  ['9', 'Leech, Gargoyle', 'Turnurile sunt atacate din interior și din aer.'],
  ['10', 'Grappler', 'Cineva e tras din poziție: coechipierii trebuie să reacționeze.'],
  ['11', 'Jammer', 'Turnurile încetinesc: jucătorii ies în față.'],
  ['12', 'Berserker, Herald', 'Un zombi care se înfurie și unul care face hoarda mai periculoasă.'],
  ['14', 'Necromancer', 'Omori mai mult, vine mai mult: prioritizezi.'],
  ['15', 'Brood Mother (boss)', 'Primul boss: ouăle sunt un obiectiv nou.'],
  ['20', 'Colossus (boss final)', 'Strivește tot ce ai construit: valul final cere altă strategie.'],
];
const zroute = `<div class="scroll"><table><thead><tr><th>Valul</th><th>Intră</th><th>Ce se întâmplă</th></tr></thead><tbody>${ROUTE.map(r => `<tr><th scope="row">${r[0]}</th><td>${r[1]}</td><td style="white-space:normal;min-width:24em">${r[2]}</td></tr>`).join('')}</tbody></table></div>`;
const ideasZ3 = IDEAS3.map(izombie3).join('');

// ---------------- page ----------------
const html = `<title>Blastridge PvE Catalog</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Sen:wght@400..800&display=swap">
<style>
/* Layout: one dark sheet, three parts (zombies, towers, ideas); each thing is a block with its sprite on a grass swatch and its numbers beside or under it. The game's own toy-block look: ink outlines, flat colour, a lip under each block. */
:root { color-scheme: dark; --bg:#0D1317; --tray:#16212A; --panel:#1E2B35; --well:#111A21; --ink:#0A1013; --text:#EAF0F3; --muted:#A3B3BD; --rule:#2B3B47; --orange:#FF7A1F; --green:#46D46A; --sky:#38A7F2; --gold:#FFC72E; --red:#FF4B5C; --grass:#4E8F43; --grass2:#468439; --font:"Sen","Helvetica Neue",Arial,sans-serif; }
* { box-sizing:border-box; }
body { background:var(--bg); color:var(--text); font-family:var(--font); font-size:15px; line-height:1.5; padding-block:0 64px; padding-left:max(16px,env(safe-area-inset-left,0px)); padding-right:max(16px,env(safe-area-inset-right,0px)); }
main { max-width:1180px; margin:0 auto; display:flex; flex-direction:column; gap:56px; }
h1,h2,h3 { margin:0; font-weight:800; text-wrap:balance; }
a { color:var(--sky); }
img { display:block; }
.top { padding-top:36px; display:flex; flex-direction:column; gap:14px; }
h1 { font-size:clamp(2rem,5vw,3rem); line-height:1.05; }
.lede { margin:0; color:var(--muted); max-width:70ch; }
.meta { display:flex; flex-wrap:wrap; gap:8px; }
.chip { display:inline-block; padding:3px 11px 4px; border:2px solid var(--ink); border-radius:999px; background:var(--panel); color:var(--text); font-size:.8rem; font-weight:700; letter-spacing:.02em; white-space:nowrap; }
.chip.warn, .pill.warn { background:var(--gold); color:#1A1205; }
nav { position:sticky; top:env(safe-area-inset-top,0px); z-index:5; display:flex; flex-wrap:wrap; gap:8px; padding:10px 0; background:linear-gradient(var(--bg) 78%, transparent); }
nav a { padding:7px 16px 9px; border:2px solid var(--ink); border-radius:12px; background:var(--panel); color:var(--text); text-decoration:none; font-weight:800; letter-spacing:.04em; box-shadow:inset 0 -4px 0 rgba(0,0,0,.3), 0 3px 0 rgba(0,0,0,.45); }
nav a:hover { background:#2A3B48; } nav a:focus-visible, a:focus-visible { outline:3px solid var(--gold); outline-offset:2px; }
h2 { font-size:clamp(1.5rem,3.4vw,2rem); }
.sec { display:flex; flex-direction:column; gap:20px; scroll-margin-top:70px; }
.sec > header { display:flex; flex-direction:column; gap:8px; }
.sec > header p { margin:0; color:var(--muted); max-width:78ch; }
.rules { display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:12px; }
.rules > div { padding:12px 14px; border:2px solid var(--ink); border-radius:14px; background:var(--tray); box-shadow:0 3px 0 rgba(0,0,0,.4); }
.rules b { display:block; margin-bottom:2px; color:var(--gold); font-size:.82rem; letter-spacing:.08em; text-transform:uppercase; }
.rules span { color:var(--muted); font-size:.92rem; }
/* zombies */
.zgrid { display:grid; grid-template-columns:repeat(auto-fill,minmax(min(100%,340px),1fr)); gap:16px; }
.zc { display:flex; flex-direction:column; min-width:0; overflow:hidden; border:2px solid var(--ink); border-radius:16px; background:var(--tray); box-shadow:inset 0 -5px 0 rgba(0,0,0,.28), 0 4px 0 rgba(0,0,0,.45); scroll-margin-top:70px; }
.zt { flex:none; aspect-ratio:16/9; display:grid; place-items:center; border-bottom:2px solid var(--ink); background:repeating-linear-gradient(90deg,var(--grass) 0 48px,var(--grass2) 48px 96px); }
.zt img { height:86%; width:auto; max-width:90%; object-fit:contain; filter:drop-shadow(0 3px 0 rgba(0,0,0,.35)); }
.zb { padding:14px 16px 16px; display:flex; flex-direction:column; gap:10px; min-width:0; }
.zb header, .tb header { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; }
.zb h3 { font-size:1.3rem; }
.pill { flex:none; padding:2px 10px 3px; border-radius:8px; border:2px solid var(--ink); font-size:.74rem; font-weight:800; letter-spacing:.06em; text-transform:uppercase; color:#06210F; }
.pill.go { background:var(--green); } .pill.build { background:var(--orange); color:#1A0A00; } .pill.sky { background:var(--sky); color:#04182B; } .pill.bad { background:var(--red); color:#25030A; }
.when { margin:-4px 0 0; color:var(--muted); font-size:.88rem; }
.stats { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:6px; margin:0; }
.stats > div { padding:6px 10px 7px; border-radius:10px; background:var(--well); min-width:0; }
.stats dt { color:var(--muted); font-size:.7rem; font-weight:700; letter-spacing:.08em; text-transform:uppercase; }
.stats dd { margin:0; font-size:1.15rem; font-weight:800; font-variant-numeric:tabular-nums; }
.stats small { display:block; color:var(--muted); font-size:.74rem; font-weight:600; line-height:1.25; }
.tg, .sp { margin:0; font-size:.9rem; } .tg b { color:var(--gold); } .sp { color:var(--muted); }
.scroll { overflow-x:auto; border:2px solid var(--ink); border-radius:14px; background:var(--tray); }
table { width:100%; border-collapse:collapse; font-variant-numeric:tabular-nums; }
th, td { padding:8px 12px; text-align:left; border-bottom:1px solid var(--rule); font-size:.92rem; white-space:nowrap; }
tbody tr:last-child > * { border-bottom:0; }
thead th { color:var(--muted); font-size:.74rem; letter-spacing:.08em; text-transform:uppercase; background:var(--well); }
tbody th { font-weight:700; color:var(--muted); white-space:normal; min-width:11em; }
td small { color:var(--muted); }
.ztbl th[scope=row] { display:flex; align-items:center; gap:10px; color:var(--text); font-weight:800; }
.mini { width:30px; height:30px; flex:none; display:grid; place-items:center; border-radius:8px; background:var(--grass); border:2px solid var(--ink); } .mini img { width:80%; height:80%; object-fit:contain; }
/* towers */
.tb { display:flex; flex-direction:column; gap:14px; padding:16px; border:2px solid var(--ink); border-radius:18px; background:var(--panel); box-shadow:inset 0 -5px 0 rgba(0,0,0,.25), 0 4px 0 rgba(0,0,0,.45); scroll-margin-top:70px; }
.tb h3 { font-size:1.35rem; margin-bottom:4px; } .tb header p { margin:0; color:var(--muted); max-width:80ch; font-size:.93rem; }
.chips { display:flex; flex-wrap:wrap; gap:6px; justify-content:flex-end; }
.lv { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; } .lv.four { grid-template-columns:repeat(4,minmax(0,1fr)); }
.lv figure { margin:0; min-width:0; } .tile { aspect-ratio:1.5; display:grid; place-items:center; border:2px solid var(--ink); border-radius:12px; background:repeating-linear-gradient(90deg,var(--grass) 0 48px,var(--grass2) 48px 96px); overflow:hidden; }
.pair { position:relative; height:86%; aspect-ratio:1; } .pair img { position:absolute; inset:0; width:100%; height:100%; } .pair img.drone { inset:auto; right:-18%; top:-8%; width:46%; height:46%; }
.tile.bt img { width:70%; height:auto; }
.lv figcaption { display:flex; justify-content:space-between; gap:8px; margin-top:6px; font-size:.85rem; } .lv figcaption b { font-weight:800; } .lv figcaption span { color:var(--muted); }
.idea { border-style:dashed; } .idea.zc { border-style:dashed; }
.prop { padding:10px 12px 12px; border:2px dashed var(--gold); border-radius:12px; display:flex; flex-direction:column; gap:8px; } .pp { color:var(--gold); font-size:.72rem; font-weight:800; letter-spacing:.1em; text-transform:uppercase; }
.idea2 { display:flex; flex-direction:column; gap:16px; }
.why { margin:0; padding:0 0 0 1.1em; display:flex; flex-direction:column; gap:4px; color:var(--muted); font-size:.92rem; } .why b { color:var(--gold); }
.boss { border-color:var(--gold); border-width:3px; } .gold { color:var(--gold); }
.note { padding:12px 16px; border:2px solid var(--ink); border-radius:14px; background:var(--tray); color:var(--muted); font-size:.92rem; } .note b { color:var(--text); }
.twocol { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,520px),1fr)); gap:16px; align-items:start; }
@media (max-width:640px) { .lv.four { grid-template-columns:repeat(2,minmax(0,1fr)); } .lv { gap:8px; } .lv figcaption { flex-direction:column; gap:0; } .tb { padding:12px; } .tb header { flex-direction:column; } .chips { justify-content:flex-start; } }
@media (prefers-reduced-motion: reduce) { html { scroll-behavior:auto; } }
</style>
<main>
<header class="top">
  <h1>Catalog PvE</h1>
  <p class="lede">Zombii și turnurile din Survival PvE, cu sprite-urile lor și toate cifrele din cod, plus ideile care nu sunt încă în joc. Cifrele sunt citite direct din <code>server.js</code> și <code>structures.js</code> (commit cb5add2, 2026-10-28), nu scrise de mână. Valorile din joc sunt provizorii și se reglează după jocuri reale.</p>
  <div class="meta"><span class="chip">12 tipuri de zombi în joc</span><span class="chip">6 feluri de turnuri + baricada</span><span class="chip warn">15 turnuri și 19 zombi doar ca idei</span></div>
</header>
<nav aria-label="Secțiuni"><a href="#zombi">Zombi</a><a href="#turnuri">Turnuri</a><a href="#idei">Idei</a></nav>

<section class="sec" id="zombi">
  <header><h2>Zombi în joc</h2><p>Unitățile sunt cele ale hărții (arena are ${AW}×${AH}, un jucător are diametrul ${PLAYER}). Viteza e în unități pe secundă. Sprite-urile sunt cele din joc, văzute de sus.</p></header>
  <div class="rules">
    <div><b>Viața crește cu valul</b><span>×1 până la valul 6, apoi +6% pe val: ×1,24 la valul 10, ×1,84 la valul 20. Minionii nu cresc.</span></div>
    <div><b>Mai mulți jucători, mai mulți zombi</b><span>+40% pentru fiecare jucător după primul (×1 / 1,4 / 1,8 / 2,2), cel mult 4 jucători.</span></div>
    <div><b>De la valul 13</b><span>Ghoul și Stalker (versiunile întunecate) înlocuiesc complet Normalul și Runner-ul.</span></div>
    <div><b>Baza</b><span>${D.baseHp} viață, nu se mai reface între valuri. Dacă cade, meciul e pierdut.</span></div>
  </div>
  <div class="zgrid">${ORDER.map(zcard).join('')}</div>
  <h3>Comparație</h3>
  <div class="scroll"><table class="ztbl"><thead><tr><th>Zombi</th><th>De la val</th><th>Viață</th><th>Viteză</th><th>Daună jucător</th><th>Daună bază / baricade</th><th>Armură</th><th>Monede</th></tr></thead><tbody>${ztable}</tbody></table></div>
</section>

<section class="sec" id="turnuri">
  <header><h2>Turnuri și baricade în joc</h2><p>Toate turnurile sunt discuri solide pentru jucători și zombi; gloanțele trec prin ele. Au viață pe nivel, zombii le sparg, iar E lipit de ele le repară (1 s nemișcat, jumătate din prețul nivelului, proporțional cu ce lipsește) sau le urcă de nivel. Un Screamer poate amorți orice turn 2 s. Distanțele sunt în unități ale hărții.</p></header>
  <div class="rules">
    <div><b>Turetă: limită pe jucători</b><span>${mgLimit}</span></div>
    <div><b>Celelalte turnuri</b><span>Tesla, Bomb, Flamethrower și Support: 2 + 1 pentru fiecare jucător în plus. Health Station: 1 + 1.</span></div>
    <div><b>Plasare</b><span>Fantoma urmează mouse-ul, până la 110 de jucător (baricada 120). Serverul primește până la 170 (180).</span></div>
  </div>
  ${KORDER.map(tblock).join('')}
  ${bblock}
</section>

<section class="sec" id="idei">
  <header><h2>Idei care nu sunt în joc</h2><p>Din artefactul „Turnuri și zombi noi”, cu sprite-urile lui. Valorile de mai jos sunt <b>propuneri</b> făcute ca punct de plecare, la scara celor din joc: nu sunt implementate și nu sunt decise.</p><div class="meta"><span class="chip warn">Nimic din asta nu e în joc</span></div></header>
  <div class="note"><b>Din lista inițială sunt deja în joc:</b> Dronă de reparații (ca Support Tower, tasta 7), Flamethrower (tasta 6), Shielded și Screamer. Rămân de făcut: 3 turnuri din prima listă, 12 turnuri noi, 5 zombi din prima listă și 14 zombi noi (2 boss). Din designul HUD-ului PvE mai lipsesc ridicarea unui coechipier căzut („E Ridică”), scutul și boss-ul; nu au încă cifre.</div>
  <h3>Prima listă: turnuri și capcane</h3>
  <div class="twocol">${ideasT}</div>
  <h3>Idei noi de turnuri, pe stiluri de joc</h3>
  <div class="note"><b>Scopul:</b> fiecare jucător are alt stil, deci fiecare turn nou face ceva ce nu face niciun turn din joc sau din prima listă: nu e încă o armă mai puternică. Mai jos, ce stil ar servi fiecare. Toate valorile sunt propuneri.</div>
  ${matrix}
  <div class="idea2">${ideasT2}</div>
  <h3>Prima listă: zombi</h3>
  <div class="zgrid">${ideasZ}</div>
  <h3>Idei noi de zombi, pe ce provoacă</h3>
  <div class="note"><b>Scopul:</b> un PvE cu adevărat provocator, în care fiecare val te obligă să schimbi ceva: unii zombi lovesc turnurile, alții jucătorii, alții banii, alții îți arată că un zid nu e de ajuns. Doi sunt boss. Toate valorile sunt propuneri.</div>
  ${zmatrix}
  <h3>Propunere de apariție pe valuri</h3>
  <div class="note"><b>Regulă:</b> cel mult doi zombi noi pe val, ca să se învețe pe rând. Trebuie combinat cu cei din prima listă (Medic, Bloater, Splitter, Burrower, Stalker), care nu apar aici.</div>
  ${zroute}
  <div class="zgrid">${ideasZ3}</div>
</section>
</main>
`;
fs.writeFileSync(require('path').join(__dirname, 'catalog.html'), html);
console.log((html.length / 1024).toFixed(0) + ' KB');
