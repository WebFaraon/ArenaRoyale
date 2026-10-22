---
version: 1
slug: "public-index-html"
primary_target: "public/index.html"
related_targets: ["public/leaderboard.html"]
---

# Surface brief: Arena Royale (all UI surfaces)

Scope and mode: operate (menus, lobby, overlays, HUD chrome). The match canvas is the hero and stays untouched; this redesign is design-only (HTML/CSS plus presentation scripts, no gameplay, network or renderer changes).

Audience / job: touch players (phone, iPad, landscape, fullscreen) and desktop players, equal weight. Job: read loadout in one glance, pick a mode, start or join a room, play, read the result, go again.

Constraints: no emoji, icons from one real library (Lucide, inlined as an SVG sprite), existing IDs and JS hooks intact, character and projectile sprites kept, name "Arena Royale" kept, Sen font kept (user's choice), responsive from 568px landscape phones to 1920px desktops, safe-area aware, reduced-motion respected.

Chosen direction: TOY-BLOCK ARENA, pinned by the user (2026-10-16): "like Zombs Royale: depth, 3D blocks, stronger outlines, black see-through side panels, transparent top bar, cartoonish 3D buttons, more microinteractions, smooth animation; nothing has shadow or volume today". It replaces the START LIST world (seed c576f6e2). A user-pinned direction beats the roll, so no concept round ran. Build form: code-led (no image generation available).

## Direction contract

THESIS: Every control is a chunky physical block sitting on the live pitch: thick ink outline, a darker lip inside its bottom edge, a light top bevel and a soft ground shadow. You press it and it squashes down, release and it bounces back. It refuses the flat hairline board that came before.

OWN-WORLD: Ink outline #0A1013 at 3px around every block. Saturated toy colors with their own lip shade: orange #FF7A1F/#B94E0C (battle, play), green #46D46A/#24903C (co-op, success), sky #38A7F2/#1D6DAE (social, info), gold #FFC72E/#C68A07 (rewards, rank), red #FF4B5C/#B11F2E (danger). Neutral blocks in slate #22303A with lip #141D23. Side panels are black glass without blur, rgba(5,8,10,.56); the top bar is transparent. White Sen 800 type with a dark stroke-shadow on colored blocks. Corners 10 to 16px.

STORY: The player sees their badge, coins and record on the left, character and weapon as two toy plates, three stat sliders, two big mode blocks and a fat orange PLAY block that shines; they tap, feel it squash, and are in.

FIRST VIEWPORT: 1440x900: transparent top bar with the outlined ARENA ROYALE logo left and sky Friends, gold Leaderboard, slate Settings blocks right; black-glass athlete column left, trays center (plates, loadout, mode blocks, play tray), black-glass missions column right; field visible through all of it. 844x390: tabs as a segmented block control, one pane, PLAY reachable without scrolling.

FORM: Cartoon battle-royale lobby (Zombs Royale, Brawl Stars family), user-pinned, no seed roll; prior seed key c576f6e2 retired. Signature interaction: the squash-and-bounce press plus the periodic light sweep across PLAY.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
