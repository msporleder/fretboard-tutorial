'use strict';

// declarative figure embedding: any element with data-draw="..." becomes a
// rendered diagram on page load. Include core.js first, then this.
//
//   <svg data-draw="fretboard" data-names></svg>                 all note names
//   <svg data-draw="fretboard" data-note="B"></svg>              a pitch class, octave-colored
//   <svg data-draw="fretboard" data-scale="E minor"></svg>       a key's scale
//   <svg data-draw="fretboard" data-interval="G2 M3 up"></svg>   root + every target
//   <svg data-draw="fretboard" data-chord="x32010"></svg>        a fingering (low string first)
//   <svg data-draw="chart" data-note="B"></svg>                  the pitch chart
//   <svg data-draw="staff" data-notes="G2 B2"></svg>             notes on the staff
//   <svg data-draw="staff" data-notes="C3 E3 G3" data-chord></svg>  stacked
//   <svg data-draw="ruler" data-marks="0:C 4:E 7:G"></svg>       degree ruler, explicit marks
//   <svg data-draw="ruler" data-chord="Cm"></svg>                degree ruler from a chord name
//   <svg data-draw="circle" data-key="G"></svg>                  circle of 5ths (data-minor selects inner ring)
//   <svg data-draw="diagram" data-frets="x32010" data-root="C" data-label="C shape"></svg>
//
// add data-inst="bass" to any figure to render it for bass.

// "F♯3" / "Bb2" -> spelled note
function parseSci(s) {
  const m = /^([A-Ga-g])([#♯b♭𝄪𝄫]*)(-?\d)$/u.exec(s.trim());
  if (!m) throw new Error('bad note: ' + s);
  const letter = LETTERS.indexOf(m[1].toUpperCase());
  let acc = 0;
  for (const ch of m[2]) acc += (ch === '#' || ch === '♯') ? 1 : (ch === '𝄪') ? 2 : (ch === '𝄫') ? -2 : -1;
  return { letter, acc, octave: parseInt(m[3], 10) };
}

// "M3" / "P5" / "d5" / "A4" / "P8" -> [degree, quality]
function parseIntervalName(s) {
  const m = /^([dmMPA])(\d)$/.exec(s.trim());
  if (!m) throw new Error('bad interval: ' + s);
  return [parseInt(m[2], 10), m[1]];
}

// "x32010" or "x,3,2,0,1,0" (low string first) -> frets array, high-first
function parseFrets(s) {
  const parts = s.includes(',') ? s.split(',').map((p) => p.trim()) : [...s];
  return parts.map((p) => (p === 'x' || p === 'X' ? null : parseInt(p, 10))).reverse();
}

// "C" / "F♯m" / "Bbmaj7" -> { rootPc, formula }
function parseChordName(s) {
  const m = /^([A-G][#♯b♭]?)(.*)$/u.exec(s.trim());
  if (!m) throw new Error('bad chord: ' + s);
  const root = parseSci(m[1] + '0');
  const rootPc = mod12(LETTER_PC[root.letter] + root.acc);
  const sym = m[2];
  const formula = CHORD_FORMULAS.find((f) => f.sym === sym)
    ?? CHORD_FORMULAS.find((f) => f.label === sym);
  if (!formula) throw new Error('unknown chord type: ' + sym);
  return { rootPc, formula };
}

// "G major" / "e minor" -> { root (spelled, low register), steps }
function parseKey(s) {
  const [name, kind] = s.trim().split(/\s+/);
  const sp = parseSci(name + '0');
  const octave = INSTRUMENT.scaleOctave - (kind === 'minor' ? 1 : 0);
  let root = { letter: sp.letter, acc: sp.acc, octave };
  while (spelledToMidi(root) < STRING_MIDI[nStr() - 1]) root = { ...root, octave: root.octave + 1 };
  while (spelledToMidi(root) > INSTRUMENT.rootMax) root = { ...root, octave: root.octave - 1 };
  return { root, steps: kind === 'minor' ? MINOR_STEPS : MAJOR_STEPS };
}

function pcOf(noteName) {
  const sp = parseSci(noteName + '0');
  return mod12(LETTER_PC[sp.letter] + sp.acc);
}

const EMBED_DRAWERS = {
  fretboard(svg, d) {
    const opts = { names: 'names' in d };
    if (d.interval != null) {
      const [rootName, ivl, dir] = d.interval.split(/\s+/);
      const root = parseSci(rootName);
      const [deg, q] = parseIntervalName(ivl);
      const target = applyInterval(root, deg, q, dir === 'down' ? -1 : 1);
      const targetPc = mod12(spelledToMidi(target));
      const color = octaveColorFor(targetPc);
      const markers = [];
      for (let s = 0; s < nStr(); s++) {
        for (let f = 0; f <= NUM_FRETS; f++) {
          if (mod12(fretMidi(s, f)) === targetPc) {
            markers.push({ s, f, label: sciName(spellAtMidi(fretMidi(s, f), target)), fill: color(fretMidi(s, f)), hollow: true });
          }
        }
      }
      const rootMidi = spelledToMidi(root);
      for (let s = nStr() - 1; s >= 0; s--) {
        const f = rootMidi - STRING_MIDI[s];
        if (f >= 0 && f <= NUM_FRETS) { markers.push({ s, f, label: sciName(root), fill: ACCENT }); break; }
      }
      opts.markers = markers;
    } else if (d.scale != null) {
      const { root, steps } = parseKey(d.scale);
      const scale = scaleFrom(root, steps);
      const spellByPc = new Map(scale.slice(0, 7).map((n) => [mod12(spelledToMidi(n)), n]));
      opts.markers = markersForPcs(spellByPc, mod12(spelledToMidi(root)), 'degrees' in d ? 'degrees' : 'names');
    } else if (d.note != null) {
      const pc = pcOf(d.note);
      const color = octaveColorFor(pc);
      opts.markers = [];
      for (let s = 0; s < nStr(); s++) {
        for (let f = 0; f <= NUM_FRETS; f++) {
          const midi = fretMidi(s, f);
          if (mod12(midi) === pc) opts.markers.push({ s, f, label: sciName(midiToSpelled(midi)), fill: color(midi) });
        }
      }
    } else if (d.chord != null) {
      const frets = parseFrets(d.chord);
      const sounding = [];
      frets.forEach((f, s) => { if (f != null) sounding.push({ s, f, midi: fretMidi(s, f) }); });
      const best = identifyChords(sounding.map((n) => n.midi))[0];
      const spellByPc = best ? chordSpelling(best.root, best.formula) : null;
      opts.markers = sounding.map((n) => ({
        s: n.s, f: n.f,
        label: sciName(spellAtMidi(n.midi, spellByPc?.get(mod12(n.midi)) ?? midiToSpelled(n.midi))),
        fill: best && mod12(n.midi) === best.root ? ACCENT : INK,
      }));
    }
    drawFretboard(svg, opts);
  },

  chart(svg, d) {
    drawPitchChart(svg, { colorFor: d.note != null ? octaveColorFor(pcOf(d.note)) : null });
  },

  staff(svg, d) {
    svg.setAttribute('viewBox', svg.getAttribute('viewBox') ?? '0 -10 360 260');
    const notes = d.notes.split(/\s+/).map(parseSci);
    drawStaffNotes(svg, notes, 'chord' in d ? { chord: true } : { labels: true });
  },

  ruler(svg, d) {
    svg.setAttribute('viewBox', svg.getAttribute('viewBox') ?? '0 0 360 68');
    let marks = [];
    if (d.marks != null) {
      marks = d.marks.split(/\s+/).map((m) => {
        const [semis, label] = m.split(':');
        return { semis: parseInt(semis, 10), label };
      });
    } else if (d.chord != null) {
      const { rootPc, formula } = parseChordName(d.chord);
      const spellByPc = chordSpelling(rootPc, formula);
      marks = formula.ints.map(([s]) => {
        const sp = spellByPc.get(mod12(rootPc + s));
        return { semis: s, label: LETTERS[sp.letter] + accStr(sp.acc) };
      });
    }
    drawDegreeRuler(svg, marks);
  },

  circle(svg, d) {
    svg.setAttribute('viewBox', svg.getAttribute('viewBox') ?? '0 0 320 320');
    const k = d.key != null ? CIRCLE_MAJORS.indexOf(d.key) : -1;
    drawCircle(svg, 'minor' in d ? { minorSelected: k } : { selected: k });
  },

  diagram(svg, d) {
    svg.setAttribute('viewBox', svg.getAttribute('viewBox') ?? (d.label ? '0 0 94 110' : '0 0 94 82'));
    drawChordDiagram(svg, parseFrets(d.frets), {
      rootPc: d.root != null ? pcOf(d.root) : null,
      label: d.label,
    });
  },
};

function renderEmbeds(scope = document) {
  for (const elm of scope.querySelectorAll('[data-draw]')) {
    const d = elm.dataset;
    const before = INSTRUMENT === INSTRUMENTS.bass ? 'bass' : 'guitar';
    try {
      if (d.inst) setInstrument(d.inst);
      EMBED_DRAWERS[d.draw](elm, d);
    } catch (e) {
      console.error('embed failed:', elm, e);
    } finally {
      if (d.inst) setInstrument(before);
    }
  }
}

// save any figure as a standalone .svg (for pages that can't run JS)
function exportSvg(elm, filename = 'figure.svg') {
  const clone = elm.cloneNode(true);
  clone.setAttribute('xmlns', SVG_NS);
  clone.setAttribute('font-family', 'Georgia, serif');
  const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

document.addEventListener('DOMContentLoaded', () => renderEmbeds());
