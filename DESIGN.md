---
name: Arena Royale
description: Toy-block arena. Chunky outlined blocks with a lip and a ground shadow, laid over the live match pitch; press them and they squash.
colors:
  ink-line: "#0A1013"
  toy-orange: "#FF7A1F"
  toy-orange-lip: "#B94E0C"
  toy-orange-hover: "#FF9447"
  toy-green: "#46D46A"
  toy-green-lip: "#24903C"
  toy-green-hover: "#66E287"
  toy-sky: "#38A7F2"
  toy-sky-lip: "#1D6DAE"
  toy-sky-hover: "#5DBAF6"
  toy-gold: "#FFC72E"
  toy-gold-lip: "#C68A07"
  toy-gold-hover: "#FFD55E"
  toy-red: "#FF4B5C"
  toy-red-lip: "#B11F2E"
  toy-red-hover: "#FF6B79"
  slate: "#2A3A45"
  slate-lip: "#18232A"
  slate-hover: "#354957"
  glass: "rgba(5, 8, 10, .56)"
  tray: "rgba(14, 20, 25, .74)"
  modal-body: "#131C22"
  ground: "#0B1417"
  chalk: "#FFFFFF"
  chalk-secondary: "#DCE4E8"
  chalk-tertiary: "#B7C4CB"
  badge-lip: "#C4CCD1"
typography:
  display:
    fontFamily: "Sen, Helvetica Neue, Arial, sans-serif"
    fontSize: "clamp(1.35rem, 2.5vw, 2rem)"
    fontWeight: 800
    lineHeight: 0.9
    letterSpacing: "0.03em"
  headline:
    fontFamily: "Sen, Helvetica Neue, Arial, sans-serif"
    fontSize: "clamp(1.5rem, min(3.4vw, 6.4vh), 2.4rem)"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "0.01em"
  title:
    fontFamily: "Sen, Helvetica Neue, Arial, sans-serif"
    fontSize: "1.05rem"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "0.03em"
  body:
    fontFamily: "Sen, Helvetica Neue, Arial, sans-serif"
    fontSize: "0.9rem"
    fontWeight: 600
    lineHeight: 1.3
  label:
    fontFamily: "Sen, Helvetica Neue, Arial, sans-serif"
    fontSize: "0.8rem"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "0.1em"
rounded:
  chip: "8px"
  sm: "10px"
  block: "12px"
  mode: "14px"
  tray: "16px"
  plate: "18px"
  modal: "20px"
  pill: "999px"
spacing:
  outline: "3px"
  outline-phone: "2.5px"
  tray-gap: "10px"
  tray-pad: "14px"
  gutter: "clamp(10px, 2.2vw, 28px)"
components:
  button-primary:
    backgroundColor: "{colors.toy-orange}"
    textColor: "{colors.chalk}"
    rounded: "{rounded.block}"
    height: "48px"
    padding: "0 22px 3px"
    typography: "{typography.label}"
  button-primary-hover:
    backgroundColor: "{colors.toy-orange-hover}"
  button-primary-disabled:
    backgroundColor: "#34424B"
    textColor: "rgba(255, 255, 255, .5)"
  button-play:
    backgroundColor: "{colors.toy-orange}"
    textColor: "{colors.chalk}"
    rounded: "{rounded.tray}"
    height: "66px"
  button-neutral:
    backgroundColor: "{colors.slate}"
    textColor: "{colors.chalk}"
    rounded: "{rounded.block}"
    height: "40px"
  button-neutral-hover:
    backgroundColor: "{colors.slate-hover}"
  button-social:
    backgroundColor: "{colors.toy-sky}"
    textColor: "{colors.chalk}"
    rounded: "{rounded.block}"
    height: "44px"
  button-rank:
    backgroundColor: "{colors.toy-gold}"
    textColor: "{colors.chalk}"
    rounded: "{rounded.block}"
    height: "44px"
  button-success:
    backgroundColor: "{colors.toy-green}"
    textColor: "{colors.chalk}"
    rounded: "{rounded.block}"
  button-danger:
    backgroundColor: "{colors.toy-red}"
    textColor: "{colors.chalk}"
    rounded: "{rounded.block}"
  tray:
    backgroundColor: "{colors.tray}"
    textColor: "{colors.chalk}"
    rounded: "{rounded.tray}"
    padding: "14px"
  side-panel:
    backgroundColor: "{colors.glass}"
    textColor: "{colors.chalk}"
  mode-block-battle:
    backgroundColor: "{colors.toy-orange}"
    textColor: "{colors.chalk}"
    rounded: "{rounded.mode}"
    height: "70px"
  mode-block-coop:
    backgroundColor: "{colors.toy-green}"
    textColor: "{colors.chalk}"
    rounded: "{rounded.mode}"
    height: "70px"
  loadout-plate:
    backgroundColor: "{colors.slate}"
    rounded: "{rounded.plate}"
    width: "clamp(80px, 7vw, 104px)"
  badge:
    backgroundColor: "{colors.chalk}"
    textColor: "{colors.ink-line}"
    rounded: "{rounded.sm}"
    padding: "6px 12px 8px"
  input-field:
    backgroundColor: "rgba(0, 0, 0, .5)"
    textColor: "{colors.chalk}"
    rounded: "{rounded.block}"
    height: "48px"
  modal-panel:
    backgroundColor: "{colors.modal-body}"
    textColor: "{colors.chalk}"
    rounded: "{rounded.modal}"
  switch-on:
    backgroundColor: "{colors.toy-green}"
    textColor: "{colors.chalk}"
    rounded: "{rounded.pill}"
    width: "90px"
    height: "44px"
---

# Design System: Arena Royale

## Overview

**Creative North Star: "The Toy-Block Arena"**

Every control is a chunky physical toy block resting on the live match pitch. A block has four parts, always together: a thick ink outline, a darker lip inside its bottom edge (its thickness), a light bevel along its top edge, and a soft shadow where it meets the ground. Pressed, a block squashes down onto the pitch; released, it bounces back. This replaces the earlier flat start-list board (hairline rules, square corners, no shadows), which the user rejected for having no volume.

The lobby, waiting room and auth screens sit directly on the animated pitch. The top bar is open sky: no fill, just the outlined logo and three colored blocks. The two side columns are black glass, see-through with no blur, so the field reads sharply behind them. Every section, in the side columns and the center alike, is a tray: a translucent dark block with the same outline, lip and shadow grammar. Type is white Sen 800 with a dark stroke, like a cartoon game's lettering.

The family is the cartoon battle-royale lobby (Zombs Royale, Brawl Stars): saturated colors, heavy outlines, depth on everything, quick bouncy motion. The match canvas stays the hero; the blocks share its toy palette.

**Key Characteristics:**
- A 3px ink outline (2.5px on short landscape) around every block, tray, plate, chip and modal.
- An inner bottom lip in the block's darker shade, a top bevel at 30% white and a soft offset ground shadow.
- Five toy colors with a meaning each, plus slate for neutral blocks.
- Black-glass side panels and translucent trays over a fully visible field.
- White lettering with an ink stroke-shadow on every colored surface.
- Squash-and-bounce press, a hover lift, a periodic light sweep across PLAY.

## Colors

Saturated toy colors, each with its own lip shade and hover face, over black glass and slate.

### Primary
- **Toy Orange** (`toy-orange`, lip `toy-orange-lip`, hover `toy-orange-hover`): play and battle. PLAY, START GAME, primary submits (auth, rematch, select), the battle royale mode block, the join arrow, the active tab key, the selection ring on catalog tiles.

### Secondary
- **Toy Green** (`toy-green`): co-op and success. The PvE mode block, the plus stat key, accept buttons, the ON switch, completed missions, XP fill, HP stat, the online dot.
- **Toy Sky** (`toy-sky`): social and information. Friends block, search, invite, mission progress fill, gems, speed stat.
- **Toy Gold** (`toy-gold`): rewards and rank. Leaderboard block, claim and unlock buttons, rank 1 chip, coin icons, the level badge on waiting cards, rank text.

### Tertiary
- **Toy Red** (`toy-red`): danger and exit. Logout and leave blocks, exit confirmation, notification badges, the live-event pulse, close buttons as they are pressed.

### Neutral
- **Ink Line** (`ink-line`): outlines, stroke-shadows on type, icon drop shadows, segment dividers in bars.
- **Slate** (`slate`, lip `slate-lip`, hover `slate-hover`): neutral blocks (settings, change, minus key, secondary actions), loadout plates, coin boxes, modal headers, catalog tiles.
- **Black Glass** (`glass`): the side columns, so the pitch shows through.
- **Tray** (`tray`): every section block; sits over glass or the field.
- **Modal Body** (`modal-body`): the solid inside of modals.
- **Chalk** (`chalk`, white) with `chalk-secondary` and `chalk-tertiary` for quieter text on dark surfaces; `badge-lip` is the grey lip under white badges.

### Named Rules
**The Toy Color Rule.** A color means one thing: orange plays, green co-ops and succeeds, sky is social and info, gold rewards and ranks, red exits and warns, slate is neutral. A new block picks its color by meaning, never by taste.

**The Lip Rule.** Every color ships with its lip shade. A block never takes a face color without its matching lip, or it reads flat.

**The White-On-Color Rule.** Text on a colored block is white with the ink stroke-shadow, never ink-on-color.

## Typography

**Display Font:** Sen (with Helvetica Neue, Arial, sans-serif)
**Body Font:** Sen

**Character:** one friendly, open sans in a heavy cut. The cartoon character comes from the ink stroke-shadow drawn around white 800 letters, not from a novelty face. Sen stays because the user chose it.

### Hierarchy
- **Display** (800, `clamp(1.35rem, 2.5vw, 2rem)`, line-height 0.9): the ARENA ROYALE logo, white plus orange, drawn with the large stroke and tilted by 2 degrees.
- **Headline** (800, `clamp(1.5rem, min(3.4vw, 6.4vh), 2.4rem)`): screen titles such as the waiting room, with the large stroke.
- **Title** (800, about 1.05rem): mode names, the athlete name, character and weapon names, modal titles; medium stroke.
- **Body** (600, 0.78rem to 0.95rem): descriptions, hints, mission names; small stroke when they sit on color.
- **Label** (800, 0.75rem to 0.85rem, letter-spacing 0.06em to 0.12em, uppercase): section titles, buttons, stat names, tabs; small stroke.
- **Numerals** (800, tabular): coins, stats, timers, counts; they flap when they change.

### Named Rules
**The Stroke Rule.** Lettering on a block carries an ink stroke-shadow sized to the text: small (1px plus a 2px drop) for labels, medium (2px plus a 3px drop) for buttons and titles, large (3px plus a 5px drop and a soft shadow) for the logo and screen titles.

## Layout

A fixed-viewport app with no page scroll; columns scroll internally. The top bar is `bar-h + 10px` tall (56px base, 44px on short landscape) and fully transparent: no strip, border or shade; the logo and blocks float on the field. The lobby and waiting room dim the field with a flat `rgba(3,6,5,.58)` layer so trays and buttons lead. The field itself is still: turf, a faint chalk circle and halfway line (no chalk frame round the screen edge), the trees and rocks of the match (the sprites of `public/images/map/`, laid out from a fixed seed and kept off the middle band), painted once per start or resize, with no moving player dots.
- **Wide (>= 900px wide and > 600px tall):** three columns of trays straight on the field (`minmax(230px,.82fr) | minmax(0,2fr) | minmax(270px,1fr)`, 16px gaps, max 1640px). Left: profile, record (2x2), chests. Center: the character stage (fills the height) and the loadout. Right: gamemode + PLAY + room code, the daily missions card, the tournament pinned to the bottom. Each column scrolls on its own; between 900 and 1180px the record becomes four label/number rows, mode descriptions hide, and under 820px tall the missions card shows two rows.
- **Phones and short screens (< 900px wide or <= 600px tall):** the same blocks regroup behind three tabs in the top bar (Profil, Joc, Misiuni); `.lobby-body[data-tab]` picks the layout and the columns become `display: contents`. Joc: character | loadout | mode + PLAY. Misiuni: missions beside the season pill and the tournament. Profil: profile | record | chests. Under 720px wide the panes drop to two columns, under 560px to one.
- The lobby is always ready to play: Battle Royale is selected on login, the last mode stays selected after a match, PLAY is never disabled.
- **Trays** stack with 10px gaps and 14px inner padding (10 to 12px on short landscape).
- **Short landscape (<= 520px tall):** the same blocks, tighter: 2.5px outlines, 54px mode blocks, a 54px PLAY, 36px stat keys.
- Safe areas apply on every fixed edge.

## Elevation & Depth

Depth is the system. Every block is lifted off the pitch, and the lift is drawn the same way everywhere, in four shadow layers: an inset lip at the bottom, an inset top bevel, a hard ground offset and a soft blurred drop. There are three states: rest, lifted (hover) and pressed. Trays use a quieter version of the same layers. Modals float highest, on a 72% black scrim with no blur.

### Shadow Vocabulary
- **Block rest** (`inset 0 -5px 0 <lip>, inset 0 3px 0 rgba(255,255,255,.3), 0 4px 0 rgba(0,0,0,.45), 0 10px 18px -6px rgba(0,0,0,.55)`): every button and colored block at rest.
- **Block lifted** (`inset 0 -5px 0 <lip>, inset 0 3px 0 rgba(255,255,255,.36), 0 6px 0 rgba(0,0,0,.45), 0 16px 24px -8px rgba(0,0,0,.6)` with `translateY(-2px)`): hover on pointer devices, and the selected mode block.
- **Block pressed** (`inset 0 -2px 0 <lip>, inset 0 2px 0 rgba(255,255,255,.18), 0 1px 0 rgba(0,0,0,.45), 0 3px 6px -2px rgba(0,0,0,.5)` with `translateY(3px) scale(.985)`): the instant the block is touched.
- **Tray** (`inset 0 2px 0 rgba(255,255,255,.07), inset 0 -4px 0 rgba(0,0,0,.28), 0 6px 0 rgba(0,0,0,.32), 0 14px 24px -12px rgba(0,0,0,.6)`): every section.
- **Modal** (`inset 0 3px 0 rgba(255,255,255,.06), 0 8px 0 rgba(0,0,0,.5), 0 26px 40px -12px rgba(0,0,0,.7)`).
- **Sunk track** (`inset 0 3px 0 rgba(0,0,0,.45)` or `.4`): bars, the input field, the switch track: things set into a block rather than standing on it.

### Named Rules
**The Four-Layer Rule.** A block is lip plus bevel plus ground offset plus soft drop. Dropping a layer flattens it; a new surface reuses the vocabulary above rather than inventing a shadow.

**The Squash Rule.** The press is immediate (0ms): the block moves 3px down, the lip shrinks and the ground shadow nearly disappears. The release springs back over 280ms with a slight overshoot.

## Shapes

Softly rounded toy forms: 8px chips, 10px badges and small keys, 12px buttons and inputs, 14px mode blocks and tiles, 16px trays and PLAY, 18px loadout plates, 20px modals, full pills for the switch, bars, the online dot and notification badges. Corners scale with the block's size. The level and points badges are white blocks tilted by 3 degrees; the room code is a larger white block tilted by 1.5 degrees. Empty chest slots are dashed 2px outlines. Icons are Lucide (2.25px stroke, square caps) with a 2px ink drop shadow wherever they sit on a block. The core lobby icons are the colour art of the Obiecte Arena pack (`public/images/ui/<id>.svg`, `<img class="pic">`, or `pic(id)` and `ico('coins')` / `ico('gem')` in JS): friends, leaderboard, settings, characters, the two modes, missions, sound, full screen, log out, the four statistics (wins, eliminations, matches, win rate) and the two currencies. Their outline and lip are in the art, so they take no stroke or drop-shadow filter; the muted speaker is the same art greyed out (`pic-off`). Everything else (in-match HUD, chips, back arrows) is still Lucide.

## Components

### Buttons
- **Shape:** 12px radius with a 3px ink outline; labels sit 3px high because the lip takes the bottom.
- **Primary:** toy orange, white label with the medium stroke, 48px minimum. Variants by meaning: green accept, gold claim and unlock, sky search and invite, red exit.
- **PLAY:** the one big key, gold (`toy-gold`) so it never reads as the orange Battle Royale block above it; 84px tall and 2rem on wide screens (70px under 820px tall, 62px on phones), 16px radius, a deeper 7px lip. Every 3.8s a soft light band sweeps across it (only while it is enabled, off under reduced motion). It also carries a glow in its own color (`0 0 32px 2px` at rest, wider on hover, weaker when pressed, none when disabled): the one block with a fifth shadow layer, because PLAY is the key to press. It pops in with a small spring when a mode is chosen.
- **Neutral:** slate blocks with white labels, for secondary actions, change, settings, minus and the modal closes (which flash red while pressed).
- **Hover (pointer only):** lift 2px to the lifted shadow and the hover face; icons give a small wiggle.
- **Disabled:** a grey-slate face (`#34424B`), half-white label, a shallow lip and no lift.
- **Focus:** a 3px white outline at a 3px offset.

### Top bar
Transparent, a three-part grid: the outlined ARENA ROYALE logo (straight, not tilted) on the left, the season pill in the middle, and on the right a sky Friends block, a gold Leaderboard block and a slate Settings block (logout lives inside Settings, shown only in the lobby). On phones the middle holds the tab control instead: a black-glass pill with a 3px outline, where the active tab is a raised orange key. There is no online-players counter.

### Auth screen
Login and sign-up sit on the pitch like the lobby, in two columns (stacked under 700px). Left, the logo lockup in the Display type, tilted -2 degrees with the large stroke: the toy mark (an orange block with a folded corner, ink outline, lip, bevel and ground shadow, tilted -6 degrees, a white "A" with an ink stroke), the stacked wordmark ARENA / ROYALE, and two small mode chips (orange Battle Royale, green Survival PvE). No rules or lines behind the logo. Right, one tray holding the tabs, the fields and the key: the tabs are the black-glass segmented pill of the phone top bar with the active tab a raised orange key; the fields are the sunk inputs with an orange focus ring; an error is a small red block with a triangle icon and white stroked text; the submit is the orange `auth-btn` key. The settings block floats top right (fixed, by id, so the shared button grammar cannot make it `relative`). Text keeps its Romanian diacritics.

### Trays (cards / containers)
- **Corner Style:** 16px.
- **Background:** `tray` over glass or the field.
- **Border:** a 3px ink border at 62% opacity.
- **Shadow:** the tray layers.
- **Internal Padding:** 14px.

### Mode blocks
Battle royale is orange and co-op is green, both always in color. The unselected block is muted (`saturate(.72) brightness(.8)`) and sits lower. The selected block is full color, lifted, pops (scale .96 to 1.035 to 1 over 450ms), and shows a white check badge that spins in. Each holds a 2.6rem icon tile, a stroked title and a description.

### Loadout plates
A slate plate with an 18px radius and a radial highlight. Its bottom lip is the character's rarity color or the weapon's color. A white swap icon sits top right. On hover it lifts and tilts 1.5 degrees while the portrait springs to 1.14x; on press it squashes.

### Readouts
Bars are rounded tracks sunk into the tray (2px ink border, inner shadow). Fills carry a top bevel and spring to their width. Cells are drawn over the bar as ink dividers: 10 for XP and stats, the mission target for missions. Stat keys: slate for minus, green for plus.

### Inputs / Fields
Black at 50%, a 3px ink border, 12px radius, sunk inner shadow. Focus turns the border orange with a faint 3px orange ring.

### Modals
A solid `modal-body` panel with a 20px radius, 3px outline and the modal shadow, popping in from 18px below at 0.94 scale. The header is a slate strip with a lip, a stroked title, an orange icon and a 42px close block. Catalogs (weapons, characters) are gapped toy tiles. The selected tile gets a 3px orange ring and a white check badge; a character's rarity colors the lip of its portrait.

### Settings switch
A pill track sunk in black. On, it fills green with its lip. The knob is a white block with a grey lip that springs across 44px.

### Season pill
A slate pill with a gold ring, a bobbing white ball block, a gold "SEZONUL 1" kicker and the stroked name "Stadium Showdown". It sits centered in the top bar on wide screens and at the top of the Misiuni tab on phones.

### Character stage
The center tray: a "PERSONAJ" kicker and the stroked character name, the portrait idling on a dark floor ellipse ringed in the rarity color, round slate arrows at both sides that walk through all characters (they play the ordinary button click; the Select sound belongs only to SELECTEAZA in the character catalog), the characters chip bottom left ("SKIN n / 30" over "PERSONAJE", opens the character catalog; icon only on phones) and the weapon chip bottom right (opens the weapon catalog), blocks of the same build without swap icons: characters in purple (`#9A5BF5`, lip `#6431C2`), weapon in teal (`#17B4A3`, lip `#0B7A6E`). The stage itself is not clickable. A locked character shows greyed with a gold price badge.

### Missions card
Three compact rows (claimable first, then nearest to done), each two lines: the title (ellipsis) with the reward on the right (gold coins and sky gems, each with its icon) or a gold Revendica key; below, a thin bar with the progress ("2.2k / 2.5k") on the right. A slate "Toate 6" key opens the missions modal (680px): one tray block per mission with a 56px kind tile (orange BR, green PvE, teal weapon, sky general; green check when done), the title with the reward on the right, small tag chips (BR, PvE, the weapon, GREU), a 14px bar with "x / y" on the right, and a full-width gold Revendica key or a green REVENDICAT mark.

### Leaderboard
Rows are separated tray blocks (3px ink edges, 14px corners, 8px apart) under sticky stroked column labels. Ranks are small toy badges: gold, silver (`#C9D3D9`), bronze (`#D68A4C`), slate for the rest; the top three rows carry a faint tint of their medal and the player's own row an orange tint and orange edge.

### Character catalog
Coins and gems sit in slate blocks in the header, like the lobby profile. The selected character's key is a green block with the same stroked lettering as SELECTEAZA. The rarity tabs scroll sideways without a visible scrollbar.

### Season banner (retired from the lobby)
A full-width tray at the top of the center column: a floodlit pitch (mown stripes, a chalk centre circle and halfway line), a white ball block that bobs, the season name "Stadium Showdown" in large stroked capitals skewed 8 degrees, a one-line subtitle and a tilted gold "SEZON 1" chip. A slow floodlight sweep crosses it every 6 seconds. On short landscape it slims down to one line.

### Match HUD
The canvas mirrors the DOM blocks through `_drawBlock` and the `TOY` face/lip pairs in game.js.
- **HP bar:** an ink frame around a sunk dark track; the fill is a small block (green, then gold, then red as HP drops) with a lip and a bevel. The HP number and the name use the ink stroke.
- **Ammo:** one ink frame with the rounds as gold blocks inside it; a reloading round fills in pale gold.
- **Weapon badge** (next to the bar): a slate block with a white pictogram.
- **Bottom squares:** the bullet sprite in a slate block and the weapon in an orange block. On laptops they are `min(86px, 5.6vw, 9.5vh)`.
- **Zone banner:** a slate block while the zone waits, red while it shrinks, with white stroked text.
- **Damage popups:** they slam in at 1.5x, tilted, then settle, float up and fade over 820ms. Heavy hits (60 and above) are bigger and gold, normal hits pink-red, both with a thick ink stroke.
- **PvE base:** a stone hexagon fort in the style of the trees and guns (`ARArena.drawBase`): ink outline, a darker lip under every part, a bevel on the top-left edges, a ground shadow. The stone never changes; the core, the tower lights and the floor trim show the state: green over half, gold to a quarter, red under it, with a ring that pulses round the core (faster when red). Its bar is the player's bar made bigger (150 x 20, "BAZĂ" above it, the number on it), drawn with the names above the tree crowns.
- **Zombie bars:** the player's bar made small (ink frame, sunk track, a toy block for the fill), only on a zombie that is hurt; at full health there is none.
- **Medkit:** see Pickups and death effects below (`ARArena.drawKit`, cached as a sprite).
- **DOM HUD:** the players/kills panel, kill-feed chips, the kill notification (an orange block that stamps in), the PvE wave/base/coins blocks, the upgrade sheet tiles and the toasts all use the same block recipe.

### Pickups and death effects (in the match)
- **Medkit:** the Obiecte Arena suitcase (`public/images/pickups/medkit.svg`, the pack's picture without its baked ground shadow and pickup ring, which are drawn apart so the case can hover). Red pickup ring and shadow on the ground, 32 units wide.
- **PvE coin:** not the lobby coin. A small flat coin seen from above (`public/images/pickups/moneda_pve.svg`: reeded gold rim, lighter field, orange lightning bolt, ink outline), ~18 units across next to a 40-unit player; it is also the coin icon of the PvE HUD (badge and upgrade panel). A drop hops out of the zombie and lands (380 ms), lies on the ground with a one-fill shadow, blinks for the last 8 s of its 40 s, and hops up and fades when taken. Lobby, shop and Arsenal keep the star coins.
- **Death shards (zombie and player):** chunky toy pieces, not thin triangles: a rounded polygon with a thick ink outline round the whole piece, a darker lip under it, the lit face and a short white bevel on the top-left edge. Zombie pieces use the zombie art's greens and one bit of flesh pink; player pieces the toy gold and orange. They fly out, turn, shrink and fade; the flash and the rings stay as they were.

### Countdown
One block per second (orange, green on GO), about 120 to 176px, with a 5px outline and a numeral in the large stroke. It pops in with a spring (scale .35 to 1.08 to 1, rotate -14 to 0 degrees) on its own layer. The first pop waits 0.3s, so the heavy first frame of the match renders before anything moves. Never bring back a full-width band with a giant scaled numeral: it cost a ~180ms GPU raster on every match start.

### Motion
- **Arrival (`trayDrop`, 620ms):** trays drop 22px and settle with a 3px overshoot, staggered by 60ms, once per screen change.
- **Press and release:** see the Squash Rule.
- **Arsenal (a screen over the lobby):** it arrives and leaves as a crossfade (0.38s in, 0.28s out): the screen rises 22px and fades in while the lobby fades out under it, and leaving plays it backwards while the lobby fades back in; `closeArsenal` hides the screen only when the animation ends (and at once under reduced motion). Skin clicks change only what the skin changes and pop the gun in quickly (0.2s), never from empty: its picture is already decoded.
- **Selection pop:** mode blocks, check badges and notification badges spring in.
- **Live cues:** the online dot pings, the event icon pulses, the "choose a mode" flag waves.
- **Reduced motion:** the sweep and the live cues stop; press and state feedback stay.
- **Eases:** `--spring` `cubic-bezier(.34, 1.56, .64, 1)` for releases and pops, `--settle` `cubic-bezier(.22, 1, .36, 1)` for arrivals.

## Do's and Don'ts

### Do:
- **Do** give every new control the full block: 3px ink outline, matching lip, top bevel, ground shadow, and its three states.
- **Do** pick a block's color by the Toy Color Rule and pair it with its lip.
- **Do** put white type with the ink stroke-shadow on every colored surface.
- **Do** keep side columns black glass (`rgba(5,8,10,.56)`) with no blur, so the field stays sharp.
- **Do** press at 0ms and release with the spring.

### Don't:
- **Don't** ship a flat colored rectangle or a hairline-ruled row; that is the rejected start-list look.
- **Don't** add `backdrop-filter` blur over the animated field; it costs frames on phones and hides the pitch.
- **Don't** use ink text on color fills, or a colored glow in place of the ink outline.
- **Don't** animate on mount beyond the one arrival drop, and keep looping motion to the PLAY sweep and the small live cues.
