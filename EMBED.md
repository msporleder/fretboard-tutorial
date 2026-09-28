# embedding figures

Render any diagram on your own page with plain HTML — no per-figure JavaScript.

```html
<link rel="stylesheet" href="style.css">   <!-- optional, for the paper/ink look -->

<p>A major 2nd is two frets:</p>
<svg data-draw="fretboard" data-interval="G2 M2 up"></svg>

<script src="core.js"></script>
<script src="embed.js"></script>
```

Every element with `data-draw` is rendered on page load. Call `renderEmbeds(node)` to re-render after inserting figures dynamically. See `embed-demo.html` for a working page.

## figure types

### `data-draw="fretboard"`

One of:

| attribute | example | shows |
|---|---|---|
| `data-names` | `data-names` | every note name on the neck |
| `data-note` | `data-note="B"` | one pitch class everywhere, colored by octave |
| `data-scale` | `data-scale="E minor"` | a key's scale, roots colored by octave; add bare `data-degrees` to label by scale degree instead of note name |
| `data-interval` | `data-interval="G2 M3 up"` | a root (solid) and every target (hollow, octave-colored) |
| `data-chord` | `data-chord="x32010"` | a fingering, root markers in accent |

### `data-draw="chart"`

The Aguado pitch chart (staff run + fret table). Optional `data-note="B"` highlights one pitch class by octave.

### `data-draw="staff"`

`data-notes="G2 B2"` — notes left to right with labels. Add bare `data-chord` to stack them instead.

### `data-draw="ruler"`

The chromatic degree ruler. Either explicit marks — `data-marks="0:C 4:E 7:G"` (`halfsteps:label`) — or a chord name: `data-chord="Cm"` / `data-chord="F♯maj7"`.

### `data-draw="circle"`

Circle of 5ths. `data-key="G"` selects a major key; add bare `data-minor` to select the inner-ring relative minor instead.

### `data-draw="diagram"`

Mini chord chart. `data-frets="x32010"` (see fret strings below), optional `data-root="C"` for octave-colored root dots and `data-label="C shape"` for a caption.

## value formats

- **notes**: letter + optional accidental + octave, sounding pitch: `G2`, `F♯3`, `Bb2` (`#`/`♯`, `b`/`♭` both accepted)
- **intervals**: quality + degree: `m2 M2 m3 M3 P4 A4 d5 P5 m6 M6 m7 M7 P8`; direction `up` (default) or `down`
- **fret strings**: low string first, `x` = muted: `x32010`, or comma form for frets past 9: `x,10,12,12,10,x`
- **chord names**: root + type symbol from the finder (`C`, `Am`, `E7`, `Cm7♭5`, `Fmaj7`) or the long label (`C major 6th`)
- **keys**: `G major`, `e minor` (case-insensitive kind)

## instrument

Add `data-inst="bass"` to any single figure to render it as 4-string bass (bass clef, jazz palette). The rest of the page stays guitar.

## sizing

Figures set their own `viewBox`; size them with CSS width (`style.css` provides `.fb` full-width, `.small` ~340px, `.diagram` ~86px).

## static export

For pages that can't run JavaScript (blogs, markdown), open the figure in a browser and call `exportSvg(element, 'name.svg')` from the console to download a standalone SVG, then embed it as an image.
