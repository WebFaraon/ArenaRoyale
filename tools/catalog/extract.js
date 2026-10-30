// Pulls the numbers out of the game's own files (nothing typed by hand) and the sprites of the ideas out of the old artifact.
const fs = require('fs'), path = require('path');
const R = require('path').join(__dirname, '..', '..') + '/';
const src = fs.readFileSync(R + 'server.js', 'utf8');
const lit = (name) => { const i = src.indexOf('const ' + name + ' = '); const j = src.indexOf('\n};', i) + 3; return new Function('return ' + src.slice(src.indexOf('{', i), j - 1).replace(/;$/, '') + '\n;')(); };
const defs = lit('PVE_ZOMBIE_DEFS');
const wi = src.indexOf('const PVE_WAVES'), wj = src.indexOf('];', wi);
const rows = [...src.slice(wi, wj).matchAll(/\[([\d, ]+)\]/g)].map(m => m[1].split(',').map(Number));
const TYPES = ['normal', 'runner', 'tank', 'spitter', 'exploder', 'brute', 'summoner', 'shielded', 'screamer', 'ghoul', 'stalker'];
const waves = {};
TYPES.forEach((t, c) => { const col = rows.map(r => r[c]); waves[t] = { first: col.findIndex(n => n > 0) + 1, max: Math.max(...col), per: col }; });
waves.minion = { first: 0, max: 0 };
const num = (n) => +new RegExp('const ' + n + '\\s*=\\s*(\\d+)').exec(src)[1];
const AR = require(R + 'public/structures.js');
const b64 = (f) => 'data:image/svg+xml;base64,' + fs.readFileSync(f).toString('base64');
const zfile = { normal: 'zombi', runner: 'zombi_rapid', tank: 'zombi_tanc', spitter: 'zombi_toxic', exploder: 'zombi_exploder', brute: 'zombi_brute', summoner: 'zombi_summoner', minion: 'zombi_minion', shielded: 'zombi_shielded', screamer: 'zombi_screamer', ghoul: 'zombi_ghoul', stalker: 'zombi_stalker' };
const zimg = {}; for (const [k, f] of Object.entries(zfile)) zimg[k] = b64(R + 'public/images/zombies/' + f + '.svg');
const T = R + 'public/images/pve/turrets/';
const timg = {
  mg: [1, 2, 3].map(i => ({ base: b64(T + 'base' + i + '.svg'), head: b64(T + 'head' + i + '.svg') })),
  tesla: [1, 2, 3].map(i => ({ base: b64(T + 'tesla' + i + '.svg') })),
  bomb: [1, 2, 3].map(i => ({ base: b64(T + 'bomb' + i + '.svg') })),
  flame: [1, 2, 3].map(i => ({ base: b64(T + 'flame_base' + i + '.svg'), head: b64(T + 'flame_head' + i + '.svg') })),
  heal: [1, 2, 3].map(i => ({ base: b64(T + 'station' + i + '.svg') })),
  support: [1, 2, 3].map(i => ({ base: b64(T + 'support_base' + i + '.svg'), head: b64(T + 'support_drone' + i + '.svg') })),
};
const bimg = ['wood', 'stone', 'steel', 'obs'].map(m => b64(R + 'public/images/pve/barricades/' + m + '0h.svg'));
// ideas: the sprites of the old artifact (inline svg -> data uri)
const art = fs.readFileSync(process.env.ARTIFACT_HTML, 'utf8')   /* the html of the ideas artifact, see README.md */;
const uri = (svg) => 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
const idea = { towers: {}, zombies: {} };
for (const a of art.split('<article class="item">').slice(1)) {
  const name = /<h3>(.*?)<\/h3>/.exec(a)[1];
  const cards = [...a.matchAll(/<div class="tile">([\s\S]*?)<\/div><figcaption>/g)].map(m => m[1]);
  idea.towers[name] = cards.map(c => { const svgs = c.match(/<svg[\s\S]*?<\/svg>/g); return svgs.map(uri); });
}
for (const z of art.split('class="zcard"').slice(1)) {
  const name = /<b>(.*?)<\/b>/.exec(z)[1]; const svg = /<div class="ztile">(<svg[\s\S]*?<\/svg>)/.exec(z)[1];
  idea.zombies[name] = uri(svg);
}
const out = { defs, waves, TYPES, hpGrowth: src.includes('(wave - 6) * 0.06'), baseHp: num('PVE_BASE_HP'), turret: AR.TURRET, barricade: AR.BARRICADE, zimg, timg, bimg, idea };
fs.writeFileSync(path.join(__dirname, 'data.json'), JSON.stringify(out));
console.log(Object.keys(idea.towers), Object.keys(idea.zombies), JSON.stringify(Object.fromEntries(Object.entries(idea.towers).map(([k, v]) => [k, v.map(x => x.length)]))), (fs.statSync(path.join(__dirname, 'data.json')).size / 1024).toFixed(0) + ' KB', out.baseHp);
