web toy for exploring the guitar fretboard

also does bass: `index.html?inst=bass` (or the instrument select in the header) — notes, circle, and intervals on four strings with a bass clef; chord modes are guitar-only

open `index.html` — no build, no dependencies

test: `mkdir -p tmp && cat core.js tests.js > tmp/run.js && node tmp/run.js`

embed the diagrams in your own pages with plain HTML — see [EMBED.md](EMBED.md) and `embed-demo.html`
