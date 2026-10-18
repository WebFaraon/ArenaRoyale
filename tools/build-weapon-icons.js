// Builds the weapon icons from the in-hand gun sprites. Run by hand after a sprite changes:
//   node tools/build-weapon-icons.js
// For each gun in public/data/weapons.json: crop public/images/weapons/<id>.png to its visible pixels,
// turn it so the barrel points right (the sprites aim down), add a small transparent margin and scale it
// to ICON_W px wide (2x for 64 css px). Writes public/images/weapon-icons/<id>.png (full colour) and
// <id>-white.png (white silhouette: every opaque pixel white, alpha kept). The output is committed;
// pngjs is a devDependency only, nothing here runs in the game.
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const ROOT = path.join(__dirname, '..');
const ICON_W = 128;
const PAD = 4;          // px of transparent margin around the gun, at the final size
const ALPHA_MIN = 8;    // pixels fainter than this count as empty when cropping

const weapons = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/weapons.json'), 'utf8')).weapons;
const outDir = path.join(ROOT, 'public/images/weapon-icons');
fs.mkdirSync(outDir, { recursive: true });

function bbox(png) {
    const { width: w, height: h, data } = png;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (data[(y * w + x) * 4 + 3] >= ALPHA_MIN) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    return { x0, y0, x1, y1 };
}

// Crop to (x0..x1, y0..y1) and rotate -90 degrees: the sprite's +y (aim, barrel) becomes +x.
// No mirroring, so the gun keeps its handedness. Returns premultiplied float RGBA for resampling.
function cropRotate(png, b) {
    const sw = b.x1 - b.x0 + 1, sh = b.y1 - b.y0 + 1;
    const w = sh, h = sw;
    const px = new Float64Array(w * h * 4);
    for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
        const i = ((b.y0 + y) * png.width + (b.x0 + x)) * 4;
        const a = png.data[i + 3] / 255;
        const nx = y, ny = sw - 1 - x;
        const o = (ny * w + nx) * 4;
        px[o] = png.data[i] * a; px[o + 1] = png.data[i + 1] * a; px[o + 2] = png.data[i + 2] * a; px[o + 3] = a;
    }
    return { w, h, px };
}

// Area-average downscale of premultiplied RGBA (exact box filter: each source pixel's coverage)
function resample(img, tw, th) {
    const { w, h, px } = img;
    const out = new Float64Array(tw * th * 4);
    const sx = w / tw, sy = h / th;
    for (let ty = 0; ty < th; ty++) {
        const fy0 = ty * sy, fy1 = fy0 + sy;
        for (let tx = 0; tx < tw; tx++) {
            const fx0 = tx * sx, fx1 = fx0 + sx;
            let r = 0, g = 0, bl = 0, a = 0, area = 0;
            for (let y = Math.floor(fy0); y < Math.min(h, Math.ceil(fy1)); y++) {
                const cy = Math.min(fy1, y + 1) - Math.max(fy0, y);
                for (let x = Math.floor(fx0); x < Math.min(w, Math.ceil(fx1)); x++) {
                    const c = (Math.min(fx1, x + 1) - Math.max(fx0, x)) * cy;
                    const i = (y * w + x) * 4;
                    r += px[i] * c; g += px[i + 1] * c; bl += px[i + 2] * c; a += px[i + 3] * c; area += c;
                }
            }
            const o = (ty * tw + tx) * 4;
            out[o] = r / area; out[o + 1] = g / area; out[o + 2] = bl / area; out[o + 3] = a / area;
        }
    }
    return { w: tw, h: th, px: out };
}

function writePng(file, img, white) {
    const W = img.w + PAD * 2, H = img.h + PAD * 2;
    const png = new PNG({ width: W, height: H });
    png.data.fill(0);
    for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
        const i = (y * img.w + x) * 4, o = ((y + PAD) * W + (x + PAD)) * 4;
        const a = img.px[i + 3];
        if (a <= 0) continue;
        png.data[o]     = white ? 255 : Math.round(Math.min(255, img.px[i] / a));
        png.data[o + 1] = white ? 255 : Math.round(Math.min(255, img.px[i + 1] / a));
        png.data[o + 2] = white ? 255 : Math.round(Math.min(255, img.px[i + 2] / a));
        png.data[o + 3] = Math.round(Math.min(1, a) * 255);
    }
    fs.writeFileSync(file, PNG.sync.write(png));
    return { W, H };
}

for (const [id, w] of Object.entries(weapons)) {
    const src = PNG.sync.read(fs.readFileSync(path.join(ROOT, 'public', w.sprite)));
    const b = bbox(src);
    const rot = cropRotate(src, b);
    const tw = ICON_W - PAD * 2;
    const th = Math.max(1, Math.round(rot.h * tw / rot.w));
    const small = resample(rot, tw, th);
    const size = writePng(path.join(outDir, id + '.png'), small, false);
    writePng(path.join(outDir, id + '-white.png'), small, true);
    console.log(id.padEnd(8), 'crop', (b.x1 - b.x0 + 1) + 'x' + (b.y1 - b.y0 + 1), '-> icon', size.W + 'x' + size.H);
}
