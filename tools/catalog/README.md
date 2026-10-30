# Catalog PvE (generator)

Generates the page of the artifact **Catalog PvE Arena Royale** (https://claude.ai/artifact/JgZwrbupw8zeE8TvJUX8kA): the zombies and turrets that are in the game (numbers read
from `server.js` and `public/structures.js`, sprites from `public/images/`), plus the ideas that are not in the game yet. It is a memory aid, not part of the game: nothing here is
loaded by the server or the client.

- `ideas-towers.js`: 12 new tower ideas (Gravity Well, Thumper, Warp Gate, Railgun, Pylon Fence, Overclock Core, War Banner, Shield Dome, Mint, Revival Altar, Heavy Mount, Saw Ring) with
  the proposed numbers per level. Proposals, not decisions.
- `ideas-zombies.js`: 14 new zombie ideas (Jammer, Looter, Leech, Grappler, Mimic, Berserker, Necromancer, Herald, Ram, Leaper, Gargoyle, Slime, and the bosses Brood Mother and Colossus),
  what each one tests and how to answer it. Proposals, not decisions.
- `sprites-towers.js`, `sprites-zombies.js`: parametric SVG generators for those ideas, in the style of the game's sprites (see CLAUDE.md, "Idei pregatite si stilul artei"). Run a file
  with `node` to write a contact sheet (`sheet.html`, `zsheet.html`, git-ignored).
- `extract.js`: reads the game's files and the first idea list (the artifact "Turnuri si zombi noi", https://claude.ai/artifact/CtoJtznvb55Xkq1svVnuf3: Frost Tower, Mina, Poison Tower,
  Medic, Bloater, Splitter, Burrower, Stalker) into `data.json`. That artifact's html is not in the repo: read it with the Artifact tool (action `read`), keep the saved file and pass its
  path in `ARTIFACT_HTML`.
- `gen.js`: writes `catalog.html` from `data.json` and the ideas files. Publish it with the Artifact tool (same file path = same URL).

```
ARTIFACT_HTML=/path/to/saved-ideas-artifact.html node tools/catalog/extract.js
node tools/catalog/gen.js          # -> tools/catalog/catalog.html (git-ignored)
```

When a tower or a zombie from the lists goes into the game, take it out of `ideas-*.js` (the page then shows it among the real ones, with numbers read from the code).
