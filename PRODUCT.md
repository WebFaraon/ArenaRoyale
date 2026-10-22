# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Players of a browser battle royale, on phone and iPad (touch, landscape, fullscreen/PWA) and on desktop (mouse + keyboard), with equal weight on both. Sessions are short: log in, check loadout, pick a mode, create or join a room, play ~10 minutes, return to the lobby. Romanian-language UI; the developer also tests on iPad and PC.

## Product Purpose
Arena Royale is a top-down, multiplayer battle royale that runs in the browser (Node.js, Socket.IO, Canvas). Up to 20 players per round; last survivor wins. A second mode, Survival PvE, is cooperative against waves of enemies. Around the match sits a progression layer: accounts, levels and XP, coins and crystals, daily missions, chests, a character shop, weapon selection, a 10-point stat loadout (HP / DMG / SPD), friends and room invites, and a leaderboard. Success is a player who reads the lobby in a glance, starts a match fast, and feels the game's weight in every interaction.

## Positioning
A competitive, instantly-joinable arena shooter with a roster of 30 distinct character sprites and matching projectiles, playable in one tap from a link on any device.

## Capabilities and Constraints
- Screens: fullscreen prompt, auth (login/register), lobby (profile, stats, loadout, game modes, room create/join by 5-letter code, chest slots, missions, mini leaderboard, live event), waiting room, in-game HUD (kill feed, zone/joystick areas, PvE wave HUD and upgrade panel, spectator HUD, leave confirm, kill notification, countdown, game over), and overlays (friends, character shop, weapon select, invite popup, leaderboard, rotate-device).
- Standalone pages: leaderboard.html and admin.html.
- Game logic, networking, and the canvas renderer are out of scope for this work: this is a design-only redesign. Behavior, IDs, and JS hooks must keep working.
- Existing assets: 30 character sprites in /images/characters, 29 projectile sprites in /assets/bullets.
- Fonts and icons load from CDNs today (Google Fonts); local self-hosting is acceptable.

## Brand Commitments
- The name "Arena Royale" and the existing character sprites and projectile art stay.
- No emoji anywhere in the UI; use professional vector icons.
- Tone: competitive, sharp, sporty. It must not read as "made with AI": no oversized corner radii, no default AI palettes, no generic animation.

## Evidence on Hand
Real game data (stats, ranks, missions) comes from the live server. No testimonials, press, or invented claims exist and none should be created.

## Product Principles
- Readable at a glance on a 6-inch phone in landscape and on a 27-inch monitor.
- The match is the hero; menus get the player into it with the fewest decisions.
- Every interaction gives feedback: press, confirm, reward, error.
- Touch targets and safe areas are first-class, not a desktop afterthought.

## Accessibility & Inclusion
Respect prefers-reduced-motion for decorative motion; keep text contrast legible on dark in-game surfaces; touch targets at least 44px.
