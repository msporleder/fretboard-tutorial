'use strict';

// ---------- functional core: note, interval & chord math ----------

const INK = '#1a1a1a';
const ACCENT = '#b0413e';
const MUTED = '#8a867c';
const PAPER = '#faf8f2';
// one color per octave of a selected pitch class, lowest first
const OCTAVE_COLORS = ['#b0413e', '#4a6fa5', '#2e7d32', '#a8742c'];

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];

// preferred spelling of each pitch class: [letter index, accidental]
const PC_SPELL = [
  [0, 0], [1, -1], [1, 0], [2, -1], [2, 0], [3, 0],
  [3, 1], [4, 0], [5, -1], [5, 0], [6, -1], [6, 0],
];

const mod12 = (n) => ((n % 12) + 12) % 12;

function accStr(acc) {
  if (acc === 0) return '';
  if (acc === 2) return '𝄪';
  if (acc === -2) return '𝄫';
  return acc > 0 ? '♯'.repeat(acc) : '♭'.repeat(-acc);
}

// a spelled note is { letter: 0-6 (C..B), acc: -2..2, octave }
function spelledName(n) { return LETTERS[n.letter] + accStr(n.acc); }
function sciName(n) { return spelledName(n) + n.octave; }
function spelledToMidi(n) { return 12 * (n.octave + 1) + LETTER_PC[n.letter] + n.acc; }
function pcName(pc) { const [l, a] = PC_SPELL[mod12(pc)]; return LETTERS[l] + accStr(a); }

function midiToSpelled(midi) {
  const [letter, acc] = PC_SPELL[mod12(midi)];
  return { letter, acc, octave: Math.floor((midi - LETTER_PC[letter] - acc) / 12) - 1 };
}

// re-octave a spelling so it sounds at the given midi
function spellAtMidi(midi, spell) {
  return { letter: spell.letter, acc: spell.acc, octave: Math.floor((midi - LETTER_PC[spell.letter] - spell.acc) / 12) - 1 };
}

// ---------- intervals: degree 1..8, quality d/m/M/P/A ----------

const DEGREE_SEMIS = [0, 2, 4, 5, 7, 9, 11, 12]; // major / perfect sizes
const PERFECT_DEGREES = [1, 4, 5, 8];
const QUALITY_NAMES = { d: 'diminished', m: 'minor', M: 'major', P: 'perfect', A: 'augmented' };
const DEGREE_NAMES = [null, 'unison', '2nd', '3rd', '4th', '5th', '6th', '7th', 'octave'];

function intervalSemitones(degree, quality) {
  const adj = { P: 0, M: 0, m: -1, A: 1, d: PERFECT_DEGREES.includes(degree) ? -1 : -2 }[quality];
  return DEGREE_SEMIS[degree - 1] + adj;
}

function intervalName(degree, quality) {
  return `${QUALITY_NAMES[quality]} ${DEGREE_NAMES[degree]}`;
}

// transpose a spelled note by an interval; dir is +1 (up) or -1 (down).
// letter moves by the degree, accidental absorbs the difference — this is
// what makes an augmented 3rd come out as B𝄪 instead of C♯.
function applyInterval(root, degree, quality, dir) {
  const targetMidi = spelledToMidi(root) + intervalSemitones(degree, quality) * dir;
  const letterAbs = root.octave * 7 + root.letter + (degree - 1) * dir;
  const octave = Math.floor(letterAbs / 7);
  const letter = ((letterAbs % 7) + 7) % 7;
  return { letter, octave, acc: targetMidi - (12 * (octave + 1) + LETTER_PC[letter]) };
}

// generic name for a distance in half steps (chord-builder spacing readout)
const SEMITONE_NAMES = [
  'unison', 'minor 2nd', 'major 2nd', 'minor 3rd', 'major 3rd', 'perfect 4th',
  'tritone', 'perfect 5th', 'minor 6th', 'major 6th', 'minor 7th', 'major 7th', 'octave',
];
function semitoneName(d) {
  if (d <= 12) return SEMITONE_NAMES[d];
  if (d <= 24) return `${SEMITONE_NAMES[d - 12]} + octave`;
  return `${d} half steps`;
}

// ---------- scales & keys ----------

function scaleFrom(root, steps) {
  const notes = [root];
  let midi = spelledToMidi(root);
  for (const step of steps) {
    const prev = notes[notes.length - 1];
    midi += step;
    let letter = prev.letter + 1, octave = prev.octave;
    if (letter === 7) { letter = 0; octave++; }
    notes.push({ letter, octave, acc: midi - (12 * (octave + 1) + LETTER_PC[letter]) });
  }
  return notes; // 8 notes, octave included
}

const MAJOR_STEPS = [2, 2, 1, 2, 2, 2, 1];
const MINOR_STEPS = [2, 1, 2, 2, 1, 2, 2]; // natural minor

function majorScale(root) { return scaleFrom(root, MAJOR_STEPS); }

const CIRCLE_MAJORS = ['C', 'G', 'D', 'A', 'E', 'B', 'F♯', 'D♭', 'A♭', 'E♭', 'B♭', 'F'];
const CIRCLE_MINORS = ['a', 'e', 'b', 'f♯', 'c♯', 'g♯', 'e♭', 'b♭', 'f', 'c', 'g', 'd'];
const KEY_ROOTS = { // spelled root [letter, acc] per circle key
  'C': [0, 0], 'G': [4, 0], 'D': [1, 0], 'A': [5, 0], 'E': [2, 0], 'B': [6, 0],
  'F♯': [3, 1], 'D♭': [1, -1], 'A♭': [5, -1], 'E♭': [2, -1], 'B♭': [6, -1], 'F': [3, 0],
};

function keyRoot(keyIdx, octave) {
  const [letter, acc] = KEY_ROOTS[CIRCLE_MAJORS[keyIdx]];
  return { letter, acc, octave };
}

// ---------- chords ----------

// ints: [semitones above root, scale degree used to spell it]
const CHORD_FORMULAS = [
  { sym: '', label: 'major', ints: [[0, 1], [4, 3], [7, 5]] },
  { sym: 'm', label: 'minor', ints: [[0, 1], [3, 3], [7, 5]] },
  { sym: 'dim', label: 'diminished', ints: [[0, 1], [3, 3], [6, 5]] },
  { sym: 'aug', label: 'augmented', ints: [[0, 1], [4, 3], [8, 5]] },
  { sym: 'sus2', label: 'sus2', ints: [[0, 1], [2, 2], [7, 5]] },
  { sym: 'sus4', label: 'sus4', ints: [[0, 1], [5, 4], [7, 5]] },
  { sym: '5', label: 'power chord (5)', ints: [[0, 1], [7, 5]] },
  { sym: '6', label: 'major 6th', ints: [[0, 1], [4, 3], [7, 5], [9, 6]] },
  { sym: 'm6', label: 'minor 6th', ints: [[0, 1], [3, 3], [7, 5], [9, 6]] },
  { sym: 'maj7', label: 'major 7th', ints: [[0, 1], [4, 3], [7, 5], [11, 7]] },
  { sym: '7', label: 'dominant 7th', ints: [[0, 1], [4, 3], [7, 5], [10, 7]] },
  { sym: 'm7', label: 'minor 7th', ints: [[0, 1], [3, 3], [7, 5], [10, 7]] },
  { sym: 'm7♭5', label: 'half-diminished (m7♭5)', ints: [[0, 1], [3, 3], [6, 5], [10, 7]] },
  { sym: 'dim7', label: 'diminished 7th', ints: [[0, 1], [3, 3], [6, 5], [9, 7]] },
  { sym: 'mMaj7', label: 'minor-major 7th', ints: [[0, 1], [3, 3], [7, 5], [11, 7]] },
  { sym: '7sus4', label: '7sus4', ints: [[0, 1], [5, 4], [7, 5], [10, 7]] },
  { sym: 'add9', label: 'add9', ints: [[0, 1], [2, 2], [4, 3], [7, 5]] },
  { sym: 'madd9', label: 'minor add9', ints: [[0, 1], [2, 2], [3, 3], [7, 5]] },
];

// spell every tone of a formula from a root pitch class -> Map pc -> {letter, acc}
function chordSpelling(rootPc, formula) {
  const [rl] = PC_SPELL[rootPc];
  const map = new Map();
  for (const [semis, deg] of formula.ints) {
    const letter = (rl + deg - 1) % 7;
    let acc = mod12(rootPc + semis) - LETTER_PC[letter];
    if (acc > 2) acc -= 12;
    if (acc < -2) acc += 12;
    map.set(mod12(rootPc + semis), { letter, acc });
  }
  return map;
}

function identifyChords(midis) {
  const pcs = [...new Set(midis.map(mod12))];
  if (pcs.length < 2) return [];
  const bass = mod12(Math.min(...midis));
  const out = [];
  for (const root of pcs) {
    const rel = new Set(pcs.map((p) => mod12(p - root)));
    for (const f of CHORD_FORMULAS) {
      if (f.ints.length === rel.size && f.ints.every(([s]) => rel.has(s))) {
        out.push({ root, formula: f, bass: bass !== root ? bass : null });
      }
    }
  }
  // root-position readings first
  return out.sort((a, b) => (a.bass ? 1 : 0) - (b.bass ? 1 : 0));
}

function chordName(match) {
  return pcName(match.root) + match.formula.sym + (match.bass != null ? '/' + pcName(match.bass) : '');
}

// ---------- voicing search ----------
// enumerate playable fingerings for a chord: every string muted or on a chord
// tone, fretted notes within a 4-fret span, mutes only at the edges, every
// chord tone present. Returns fret arrays (index 0 = high e, null = muted),
// ranked: root in the bass first, then open/low positions, then fuller shapes.
function voicings(rootPc, formula) {
  const pcSet = new Set(formula.ints.map(([s]) => mod12(rootPc + s)));
  const minStrings = Math.max(3, pcSet.size);
  const cands = STRING_MIDI.map((open) => {
    const c = [null];
    for (let f = 0; f <= NUM_FRETS; f++) if (pcSet.has(mod12(open + f))) c.push(f);
    return c;
  });

  const out = [];
  const cur = new Array(6).fill(null);
  const finish = () => {
    const sounded = [];
    for (let s = 0; s < 6; s++) if (cur[s] != null) sounded.push(s);
    if (sounded.length < minStrings) return;
    if (sounded[sounded.length - 1] - sounded[0] !== sounded.length - 1) return; // interior mute
    const midis = sounded.map((s) => fretMidi(s, cur[s]));
    if (new Set(midis.map(mod12)).size !== pcSet.size) return; // missing a tone
    const fretted = cur.filter((f) => f != null && f > 0);
    const minFret = fretted.length ? Math.min(...fretted) : 0;
    const span = fretted.length ? Math.max(...fretted) - minFret : 0;
    const bassIsRoot = mod12(midis[midis.length - 1]) === rootPc;
    out.push({
      frets: [...cur],
      score: (bassIsRoot ? 0 : 1000) + minFret * 10 + (6 - sounded.length) * 3 + span,
    });
  };
  const walk = (s, lo, hi) => {
    if (s === 6) { finish(); return; }
    for (const f of cands[s]) {
      let nlo = lo, nhi = hi;
      if (f != null && f > 0) {
        nlo = Math.min(lo, f);
        nhi = Math.max(hi, f);
        if (nhi - nlo > 3) continue;
      }
      cur[s] = f;
      walk(s + 1, nlo, nhi);
    }
    cur[s] = null;
  };
  walk(0, Infinity, -Infinity);
  return out.sort((a, b) => a.score - b.score);
}

// ---------- degree ruler ("musical slide rule") ----------
// fixed chromatic strip, one octave up from the root; major-scale degree
// positions shaded, current tones marked. Root mark in accent.

const DEGREE_LABELS = ['R', '♭2', '2', '♭3', '3', '4', '♭5', '5', '♭6', '6', '♭7', '7', 'R'];
const DIATONIC_SEMIS = new Set([0, 2, 4, 5, 7, 9, 11, 12]);

// marks: [{semis: 0..12, label}]; opts.onClick(semis) makes the slots clickable
function drawDegreeRuler(svg, marks, opts = {}) {
  svg.innerHTML = '';
  const x0 = 14, cw = (360 - 28) / 13, y0 = 20, h = 24;
  for (let i = 0; i <= 12; i++) {
    const x = x0 + i * cw;
    const dia = DIATONIC_SEMIS.has(i);
    svg.appendChild(el('rect', { x, y: y0, width: cw, height: h, fill: dia ? '#eee9dd' : 'none', stroke: '#c9c4b6', 'stroke-width': 0.8 }));
    svg.appendChild(txt({
      x: x + cw / 2, y: y0 - 6, 'font-size': dia ? 11 : 8.5,
      fill: dia ? INK : MUTED, 'text-anchor': 'middle',
    }, DEGREE_LABELS[i]));
  }
  for (const m of marks) {
    const x = x0 + m.semis * cw + cw / 2;
    const color = m.semis % 12 === 0 ? ACCENT : INK;
    if (m.hollow) {
      svg.appendChild(el('circle', { cx: x, cy: y0 + h / 2, r: 6.5, fill: PAPER, stroke: color, 'stroke-width': 1.8 }));
    } else {
      svg.appendChild(el('circle', { cx: x, cy: y0 + h / 2, r: 7, fill: color }));
    }
    if (m.label) {
      svg.appendChild(txt({ x, y: y0 + h + 15, 'font-size': 11, fill: color, 'text-anchor': 'middle' }, m.label));
    }
  }
  if (opts.onClick) {
    for (let i = 0; i <= 12; i++) {
      svg.appendChild(el('rect', {
        x: x0 + i * cw, y: y0 - 16, width: cw, height: h + 32,
        fill: 'transparent', class: 'cell', 'data-i': i,
      }));
    }
    svg.onclick = (ev) => {
      const c = ev.target.closest('.cell');
      if (c) opts.onClick(+c.dataset.i);
    };
  }
}

// ---------- mini chord/scale-box diagram (vertical, low E on the left) ----------
// frets: array[6] high-e-first; each entry is null (muted), a fret number, or
// an array of fret numbers (scale boxes). opts.rootPc colors root dots by
// octave; opts.label draws a caption underneath (use a taller viewBox)
function drawChordDiagram(svg, frets, opts = {}) {
  svg.innerHTML = '';
  const x0 = 30, dx = 11, y0 = 20, dy = 14;
  const perString = frets.map((f) => (f == null ? null : Array.isArray(f) ? f : [f]));
  const fretted = perString.flatMap((fs) => fs ?? []).filter((f) => f > 0);
  const start = fretted.length && Math.max(...fretted) > 4 ? Math.min(...fretted) : 1;
  const rows = Math.max(4, (fretted.length ? Math.max(...fretted) : 0) - start + 1);
  const rootColor = opts.rootPc != null ? octaveColorFor(opts.rootPc) : () => null;

  if (opts.label) {
    svg.appendChild(txt({
      x: x0 + 2.5 * dx, y: y0 + rows * dy + 14, 'font-size': 9.5, fill: MUTED,
      'font-style': 'italic', 'text-anchor': 'middle',
    }, opts.label));
  }

  for (let s = 0; s < 6; s++) {
    const x = x0 + (5 - s) * dx;
    svg.appendChild(el('line', { x1: x, y1: y0, x2: x, y2: y0 + rows * dy, stroke: INK, 'stroke-width': 0.8 }));
  }
  for (let r = 0; r <= rows; r++) {
    const w = r === 0 && start === 1 ? 3 : 0.8;
    svg.appendChild(el('line', { x1: x0, y1: y0 + r * dy, x2: x0 + 5 * dx, y2: y0 + r * dy, stroke: INK, 'stroke-width': w }));
  }
  if (start > 1) {
    svg.appendChild(txt({ x: x0 - 5, y: y0 + dy * 0.5 + 3, 'font-size': 9, fill: MUTED, 'text-anchor': 'end' }, start + 'fr'));
  }

  for (let s = 0; s < 6; s++) {
    const x = x0 + (5 - s) * dx;
    const fs = perString[s];
    if (fs == null) {
      svg.appendChild(txt({ x, y: y0 - 5, 'font-size': 9, fill: MUTED, 'text-anchor': 'middle' }, '×'));
      continue;
    }
    for (const f of fs) {
      const color = rootColor(fretMidi(s, f)) ?? INK;
      if (f === 0) {
        svg.appendChild(el('circle', { cx: x, cy: y0 - 8, r: 3, fill: 'none', stroke: color, 'stroke-width': 1.2 }));
      } else {
        svg.appendChild(el('circle', { cx: x, cy: y0 + (f - start + 0.5) * dy, r: 4.2, fill: color }));
      }
    }
  }
}

// ---------- SVG helpers ----------

const SVG_NS = 'http://www.w3.org/2000/svg';
function el(name, attrs) {
  const e = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}
function txt(attrs, s) { const t = el('text', attrs); t.textContent = s; return t; }

// ---------- fretboard rendering ----------

const STRING_MIDI = [64, 59, 55, 50, 45, 40]; // diagram top (high e) to bottom (low E)
const STRING_LABELS = ['e', 'B', 'G', 'D', 'A', 'E'];
const NUM_FRETS = 12;
const FB = { nutX: 56, top: 30, gap: 26, scale: 1560 };

function fretX(f) { return FB.nutX + FB.scale * (1 - 2 ** (-f / 12)); }
function noteX(f) { return f === 0 ? FB.nutX - 24 : (fretX(f - 1) + fretX(f)) / 2; }
function stringY(s) { return FB.top + s * FB.gap; }
function fretMidi(s, f) { return STRING_MIDI[s] + f; }

// opts: { names, markers: [{s, f, label, fill, hollow}], onClick(s, f) }
function drawFretboard(svg, opts = {}) {
  svg.innerHTML = '';
  const endX = fretX(NUM_FRETS);
  const yTop = stringY(0), yBot = stringY(5);

  // nut + frets
  svg.appendChild(el('rect', { x: FB.nutX - 4, y: yTop - 2, width: 5, height: yBot - yTop + 4, fill: INK }));
  for (let f = 1; f <= NUM_FRETS; f++) {
    svg.appendChild(el('line', { x1: fretX(f), y1: yTop, x2: fretX(f), y2: yBot, stroke: '#9a9488', 'stroke-width': 1.6 }));
  }

  // inlay dots
  const midY = (yTop + yBot) / 2;
  for (const f of [3, 5, 7, 9]) {
    svg.appendChild(el('circle', { cx: noteX(f), cy: midY, r: 5, fill: '#ddd8cc' }));
  }
  for (const y of [stringY(1) + FB.gap / 2, stringY(3) + FB.gap / 2]) {
    svg.appendChild(el('circle', { cx: noteX(12), cy: y, r: 5, fill: '#ddd8cc' }));
  }

  // strings + tuning labels
  for (let s = 0; s < 6; s++) {
    const y = stringY(s);
    svg.appendChild(el('line', { x1: FB.nutX - 4, y1: y, x2: endX, y2: y, stroke: INK, 'stroke-width': 0.7 + s * 0.25 }));
    svg.appendChild(txt({ x: 12, y: y + 4, 'font-size': 12, fill: MUTED, 'font-style': 'italic' }, STRING_LABELS[s]));
  }

  // fret numbers
  for (const f of [3, 5, 7, 9, 12]) {
    svg.appendChild(txt({ x: noteX(f), y: yBot + 26, 'font-size': 11, fill: MUTED, 'text-anchor': 'middle' }, String(f)));
  }

  // every note name, small (sharp-side default spelling)
  if (opts.names) {
    for (let s = 0; s < 6; s++) {
      for (let f = 0; f <= NUM_FRETS; f++) {
        const pc = mod12(fretMidi(s, f));
        const natural = PC_SPELL[pc][1] === 0;
        // sharp-side names for the small labels (F♯ not G♭)
        const name = natural ? LETTERS[PC_SPELL[pc][0]] : LETTERS[PC_SPELL[mod12(pc - 1)][0]] + '♯';
        svg.appendChild(txt({
          x: noteX(f), y: stringY(s) + 3.5, 'font-size': natural ? 10 : 8.5,
          fill: natural ? '#5a564c' : '#a8a396', 'text-anchor': 'middle',
        }, name));
      }
    }
  }

  // markers
  for (const m of opts.markers ?? []) {
    const x = noteX(m.f), y = stringY(m.s);
    const fill = m.fill ?? INK;
    const size = (m.label ?? '').length > 2 ? 7.5 : 9.5;
    if (m.hollow) {
      svg.appendChild(el('circle', { cx: x, cy: y, r: 10, fill: PAPER, stroke: fill, 'stroke-width': 2 }));
      if (m.label) svg.appendChild(txt({ x, y: y + 3, 'font-size': size, fill, 'text-anchor': 'middle', 'font-weight': 'bold' }, m.label));
    } else {
      svg.appendChild(el('circle', { cx: x, cy: y, r: 10.5, fill }));
      if (m.label) svg.appendChild(txt({ x, y: y + 3, 'font-size': size, fill: PAPER, 'text-anchor': 'middle', 'font-weight': 'bold' }, m.label));
    }
  }

  // click cells last so they sit on top
  if (opts.onClick) {
    for (let s = 0; s < 6; s++) {
      for (let f = 0; f <= NUM_FRETS; f++) {
        const x0 = f === 0 ? 26 : fretX(f - 1);
        const r = el('rect', {
          x: x0, y: stringY(s) - FB.gap / 2, width: (f === 0 ? FB.nutX - 4 : fretX(f)) - x0, height: FB.gap,
          fill: 'transparent', class: 'cell', 'data-s': s, 'data-f': f,
        });
        svg.appendChild(r);
      }
    }
    svg.onclick = (ev) => {
      const c = ev.target.closest('.cell');
      if (c) opts.onClick(+c.dataset.s, +c.dataset.f, ev);
    };
  }
}

// color the occurrences of one pitch class by octave: the lowest place it
// lives on the neck gets the first color, each octave up the next
function octaveColorFor(pc) {
  const loOct = Math.floor((40 + mod12(pc - 4)) / 12) - 1;
  return (midi) => (mod12(midi) === pc ? OCTAVE_COLORS[Math.floor(midi / 12) - 1 - loOct] : null);
}

// markers for every fretboard position of a set of pitch classes.
// spellByPc: Map pc -> {letter, acc}; rootPc colored by octave
function markersForPcs(spellByPc, rootPc) {
  const rootColor = octaveColorFor(rootPc);
  const out = [];
  for (let s = 0; s < 6; s++) {
    for (let f = 0; f <= NUM_FRETS; f++) {
      const midi = fretMidi(s, f);
      const spell = spellByPc.get(mod12(midi));
      if (spell) out.push({ s, f, label: sciName(spellAtMidi(midi, spell)), fill: rootColor(midi) ?? INK });
    }
  }
  return out;
}

// ---------- circle of 5ths / 4ths rendering ----------

// opts: { fourths, selected: keyIdx|null, minorSelected: keyIdx|null,
//         onClick(keyIdx, isMinor) } — inner ring is the relative minors
function drawCircle(svg, opts = {}) {
  svg.innerHTML = '';
  const cx = 160, cy = 160, rMaj = 118, rMin = 74;
  svg.appendChild(el('circle', { cx, cy, r: rMaj, fill: 'none', stroke: '#ddd8cc', 'stroke-width': 1 }));
  svg.appendChild(el('circle', { cx, cy, r: rMin, fill: 'none', stroke: '#eee9dd', 'stroke-width': 1 }));

  for (let k = 0; k < 12; k++) {
    const slot = opts.fourths ? (12 - k) % 12 : k;
    const a = (-90 + slot * 30) * Math.PI / 180;
    const x = cx + rMaj * Math.cos(a), y = cy + rMaj * Math.sin(a);
    const sel = opts.selected === k;
    const g = el('g', { 'data-k': k, class: opts.onClick ? 'key' : '' });
    g.appendChild(el('circle', { cx: x, cy: y, r: 20, fill: sel ? ACCENT : PAPER, stroke: sel ? ACCENT : INK, 'stroke-width': 1.3 }));
    g.appendChild(txt({ x, y: y + 5, 'font-size': 15, fill: sel ? PAPER : INK, 'text-anchor': 'middle' }, CIRCLE_MAJORS[k]));
    svg.appendChild(g);

    const mx = cx + rMin * Math.cos(a), my = cy + rMin * Math.sin(a);
    const msel = opts.minorSelected === k;
    const mg = el('g', { 'data-k': k, 'data-minor': '1', class: opts.onClick ? 'key' : '' });
    mg.appendChild(el('circle', { cx: mx, cy: my, r: 13.5, fill: msel ? ACCENT : 'transparent' }));
    mg.appendChild(txt({
      x: mx, y: my + 4, 'font-size': 11, fill: msel ? PAPER : MUTED,
      'text-anchor': 'middle', 'font-style': 'italic',
    }, CIRCLE_MINORS[k]));
    svg.appendChild(mg);
  }

  svg.appendChild(txt({ x: cx, y: cy - 4, 'font-size': 12, fill: MUTED, 'text-anchor': 'middle' }, 'clockwise ↻'));
  svg.appendChild(txt({ x: cx, y: cy + 14, 'font-size': 12, fill: MUTED, 'text-anchor': 'middle' }, opts.fourths ? 'in 4ths' : 'in 5ths'));

  if (opts.onClick) {
    svg.onclick = (ev) => {
      const g = ev.target.closest('.key');
      if (g) opts.onClick(+g.dataset.k, g.dataset.minor === '1');
    };
  }
}

// ---------- staff rendering ----------
// guitar convention: written an octave above sounding (treble clef with an 8
// below). Callers pass sounding midi; spelling stays the same, octave shifts.

const STAFF = { x: 30, w: 300, lineGap: 12, topY: 70 };
const STAFF_STEP = STAFF.lineGap / 2;
const STAFF_BOT_Y = STAFF.topY + 4 * STAFF.lineGap;
const STAFF_BOT_DIA = 30; // bottom line = E4, diatonic step 4*7+2

function diatonicToY(dia) { return STAFF_BOT_Y - (dia - STAFF_BOT_DIA) * STAFF_STEP; }

function drawStaffBase(svg) {
  svg.innerHTML = '';
  for (let i = 0; i < 5; i++) {
    const y = STAFF.topY + i * STAFF.lineGap;
    svg.appendChild(el('line', { x1: STAFF.x, y1: y, x2: STAFF.x + STAFF.w, y2: y, stroke: INK, 'stroke-width': 1 }));
  }
  const clef = txt({ x: STAFF.x + 4, y: STAFF_BOT_Y + STAFF.lineGap, 'font-size': 84, 'font-family': 'serif' }, '\u{1D11E}');
  svg.appendChild(clef);
  svg.appendChild(txt({ x: STAFF.x + 17, y: STAFF_BOT_Y + 34, 'font-size': 13, 'font-family': 'serif', 'font-style': 'italic', 'text-anchor': 'middle' }, '8'));
  // letter cheat sheet for lines and spaces, like the string labels;
  // sounding octaves (the 8-below clef already shifts written pitch up)
  // letter hints on the staff lines (sounding octaves)
  for (let dia = STAFF_BOT_DIA; dia <= STAFF_BOT_DIA + 8; dia += 2) {
    svg.appendChild(txt({
      x: 16, y: diatonicToY(dia) + 2.5, 'font-size': 8, fill: MUTED,
      'font-style': 'italic', 'text-anchor': 'middle',
    }, LETTERS[dia % 7] + (Math.floor(dia / 7) - 1)));
  }
}

function staffGlyph(svg, note, x, color, opts = {}) {
  const dia = note.octave * 7 + note.letter;
  const y = diatonicToY(dia);
  const headX = x + (opts.shift ? 14 : 0);

  const ledger = (d) => {
    svg.appendChild(el('line', { x1: headX - 13, y1: diatonicToY(d), x2: headX + 13, y2: diatonicToY(d), stroke: color, 'stroke-width': 1 }));
    svg.appendChild(txt({
      x: headX + 17, y: diatonicToY(d) + 2.5, 'font-size': 7, fill: MUTED, 'font-style': 'italic',
    }, LETTERS[d % 7] + (Math.floor(d / 7) - 1)));
  };
  for (let d = STAFF_BOT_DIA - 2; d >= dia; d -= 2) ledger(d);
  for (let d = STAFF_BOT_DIA + 10; d <= dia; d += 2) ledger(d);

  svg.appendChild(el('ellipse', { cx: headX, cy: y, rx: 8, ry: 6, fill: color, transform: `rotate(-15 ${headX} ${y})` }));

  if (!opts.noStem) {
    const stemLen = 3.2 * STAFF.lineGap;
    if (dia < STAFF_BOT_DIA + 4) {
      svg.appendChild(el('line', { x1: headX + 7.4, y1: y - 2, x2: headX + 7.4, y2: y - stemLen, stroke: color, 'stroke-width': 1.4 }));
    } else {
      svg.appendChild(el('line', { x1: headX - 7.4, y1: y + 2, x2: headX - 7.4, y2: y + stemLen, stroke: color, 'stroke-width': 1.4 }));
    }
  }

  if (note.acc !== 0) {
    const ax = x - 19 - (opts.accStagger ?? 0) * 11;
    svg.appendChild(txt({ x: ax, y: y + 5, 'font-size': 15, 'font-family': 'serif', fill: color }, accStr(note.acc)));
  }
  return y;
}

// notes: spelled notes at sounding octave; shifted to written pitch here.
// opts: { chord: stack at one x, labels: note names underneath, colors: [] }
function drawStaffNotes(svg, notes, opts = {}) {
  drawStaffBase(svg);
  const written = notes.map((n) => ({ ...n, octave: n.octave + 1 }));

  if (opts.chord) {
    const x = STAFF.x + STAFF.w * 0.6;
    const sorted = [...written].sort((a, b) => (a.octave * 7 + a.letter) - (b.octave * 7 + b.letter));
    let prevDia = null, prevShift = false, accCount = 0;
    sorted.forEach((n) => {
      const dia = n.octave * 7 + n.letter;
      const shift = prevDia !== null && dia - prevDia === 1 && !prevShift;
      staffGlyph(svg, n, x, n.color ?? INK, { noStem: true, shift, accStagger: n.acc !== 0 ? accCount++ : 0 });
      prevDia = dia; prevShift = shift;
    });
  } else {
    const n = written.length;
    const x0 = STAFF.x + 70, x1 = STAFF.x + STAFF.w - 16;
    const dx = n > 1 ? Math.min(44, (x1 - x0) / (n - 1)) : 0;
    written.forEach((note, i) => {
      const x = x0 + dx * i;
      const color = opts.colors?.[i] ?? INK;
      staffGlyph(svg, note, x, color);
      if (opts.labels) {
        // label with the sounding octave, not the written one
        svg.appendChild(txt({ x, y: 235, 'font-size': 13, fill: color, 'text-anchor': 'middle' }, sciName(notes[i])));
      }
    });
  }

  // clickable rows, one per line/space, written E3..E6 (sounding E2..E5)
  if (opts.onClick) {
    for (let dia = 23; dia <= 44; dia++) {
      svg.appendChild(el('rect', {
        x: STAFF.x + 40, y: diatonicToY(dia) - 3, width: STAFF.w - 40, height: 6,
        fill: 'transparent', class: 'cell', 'data-dia': dia,
      }));
    }
    svg.onclick = (ev) => {
      const c = ev.target.closest('.cell');
      if (c) opts.onClick(+c.dataset.dia, ev);
    };
  }
}

// ---------- pitch chart (method-book style) ----------
// every pitch E2..E5 as a column: name on top, notehead on a staff run in the
// middle, and per string the fret where that pitch lives (blank if unreachable)

function drawPitchChart(svg, opts = {}) {
  svg.innerHTML = '';
  const LO = 40, HI = 76; // E2..E5
  const x0 = 42, cw = (860 - x0 - 4) / (HI - LO + 1);
  const colX = (midi) => x0 + (midi - LO) * cw;

  const stepPx = 4; // staff geometry, written pitch (sounding + octave)
  const yOfDia = (dia) => 132 - (dia - 23) * stepPx; // written E3 at the bottom
  const rowY = (s) => 158 + s * 14;

  // column separators + highlight tint (colorFor(midi) -> color or null)
  for (let midi = LO; midi <= HI; midi++) {
    const x = colX(midi);
    const hl = opts.colorFor?.(midi);
    if (hl) {
      svg.appendChild(el('rect', { x, y: 2, width: cw, height: rowY(5) + 8, fill: hl, opacity: 0.12 }));
    }
    svg.appendChild(el('line', { x1: x, y1: 16, x2: x, y2: rowY(5) + 6, stroke: '#e4dfd2', 'stroke-width': midi % 12 === 0 ? 1.6 : 0.7 }));
  }

  // staff lines (written E4..F5) across the chart
  for (let dia = 30; dia <= 38; dia += 2) {
    svg.appendChild(el('line', { x1: x0 - 14, y1: yOfDia(dia), x2: colX(HI) + cw, y2: yOfDia(dia), stroke: INK, 'stroke-width': 0.8 }));
  }
  const clef = txt({ x: x0 - 40, y: yOfDia(30) + 12, 'font-size': 46, 'font-family': 'serif' }, '\u{1D11E}');
  svg.appendChild(clef);

  for (let midi = LO; midi <= HI; midi++) {
    const hl = opts.colorFor?.(midi);
    const color = hl ?? INK;
    const xm = colX(midi) + cw / 2;
    const sp = midiToSpelled(midi);
    const natural = sp.acc === 0;

    // header name; octave digit shown on naturals to keep columns narrow
    svg.appendChild(txt({
      x: xm, y: 12, 'font-size': natural ? 9 : 7.5,
      fill: hl ?? (natural ? '#5a564c' : '#a8a396'), 'text-anchor': 'middle',
    }, natural ? spelledName(sp) + sp.octave : spelledName(sp)));

    // notehead (written pitch), short ledgers, tiny sharp
    const dia = (sp.octave + 1) * 7 + sp.letter;
    const y = yOfDia(dia);
    for (let d = 28; d >= dia; d -= 2) {
      svg.appendChild(el('line', { x1: xm - 6, y1: yOfDia(d), x2: xm + 6, y2: yOfDia(d), stroke: color, 'stroke-width': 0.7 }));
    }
    for (let d = 40; d <= dia; d += 2) {
      svg.appendChild(el('line', { x1: xm - 6, y1: yOfDia(d), x2: xm + 6, y2: yOfDia(d), stroke: color, 'stroke-width': 0.7 }));
    }
    svg.appendChild(el('ellipse', { cx: xm + (natural ? 0 : 3), cy: y, rx: 4, ry: 3, fill: color, transform: `rotate(-15 ${xm} ${y})` }));
    if (!natural) {
      svg.appendChild(txt({ x: xm - 6.5, y: y + 3, 'font-size': 8, 'font-family': 'serif', fill: color, 'text-anchor': 'middle' }, accStr(sp.acc)));
    }

    // fret number per string
    for (let s = 0; s < 6; s++) {
      const f = midi - STRING_MIDI[s];
      if (f < 0 || f > NUM_FRETS) continue;
      svg.appendChild(txt({ x: xm, y: rowY(s) + 4, 'font-size': 9, fill: color, 'text-anchor': 'middle' }, String(f)));
    }
  }

  // string row labels
  for (let s = 0; s < 6; s++) {
    svg.appendChild(txt({ x: x0 - 10, y: rowY(s) + 4, 'font-size': 10, fill: MUTED, 'font-style': 'italic', 'text-anchor': 'end' }, STRING_LABELS[s]));
    svg.appendChild(el('line', { x1: x0 - 4, y1: rowY(s) - 7, x2: colX(HI) + cw, y2: rowY(s) - 7, stroke: '#eee9dd', 'stroke-width': 0.7 }));
  }

  if (opts.onClick) {
    for (let midi = LO; midi <= HI; midi++) {
      svg.appendChild(el('rect', {
        x: colX(midi), y: 2, width: cw, height: rowY(5) + 8,
        fill: 'transparent', class: 'cell', 'data-midi': midi,
      }));
    }
    svg.onclick = (ev) => {
      const c = ev.target.closest('.cell');
      if (c) opts.onClick(+c.dataset.midi);
    };
  }
}

// ---------- CAGED ----------
// the five open major shapes; any major chord tiles the neck with all five
const CAGED_SHAPES = [
  { name: 'C', rootPc: 0, frets: [0, 1, 0, 2, 3, null] },
  { name: 'A', rootPc: 9, frets: [0, 2, 2, 2, 0, null] },
  { name: 'G', rootPc: 7, frets: [3, 0, 0, 0, 2, 3] },
  { name: 'E', rootPc: 4, frets: [0, 0, 1, 2, 2, 0] },
  { name: 'D', rootPc: 2, frets: [2, 3, 2, 0, null, null] },
];

// minor variant: the same five shapes with the 3rd flattened. Em/Am/Dm stay
// easy grips; Cm and Gm are the famously awkward ones.
const CAGED_MINOR_SHAPES = [
  { name: 'Cm', rootPc: 0, frets: [null, 1, 0, 1, 3, null] },
  { name: 'Am', rootPc: 9, frets: [0, 1, 2, 2, 0, null] },
  { name: 'Gm', rootPc: 7, frets: [3, 3, 3, 0, 1, 3] },
  { name: 'Em', rootPc: 4, frets: [0, 0, 0, 2, 2, 0] },
  { name: 'Dm', rootPc: 2, frets: [1, 3, 2, 0, null, null] },
];

// the five CAGED positions of a chord, ordered up the neck
function cagedShapes(rootPc, shapes = CAGED_SHAPES) {
  return shapes.map((sh) => ({
    name: sh.name + ' shape',
    frets: sh.frets.map((f) => (f == null ? null : f + mod12(rootPc - sh.rootPc))),
  })).sort((a, b) =>
    Math.min(...a.frets.filter((f) => f != null)) - Math.min(...b.frets.filter((f) => f != null)));
}

// fingering boxes for a set of pitch classes (a scale or arpeggio), one per
// CAGED anchor shape: every matching note in a five-fret window at the shape
function positionBoxes(rootPc, pcs, shapes = CAGED_SHAPES) {
  return cagedShapes(rootPc, shapes).map((sh) => {
    const lo = Math.min(...sh.frets.filter((f) => f != null));
    const wLo = Math.max(0, lo - 1), wHi = wLo + 4;
    const frets = STRING_MIDI.map((open) => {
      const list = [];
      for (let f = wLo; f <= wHi; f++) if (pcs.has(mod12(open + f))) list.push(f);
      return list;
    });
    return { name: sh.name, wLo, wHi, frets };
  });
}

// dim7 is symmetric (stacked minor 3rds): one grip, D-string bass, and the
// same shape three frets up is the next inversion of the same chord
const DIM7_SHAPE = [3, 2, 3, 2, null, null]; // as written: E G B♭ D♭ = Edim7
function dim7Positions(rootPc) {
  const base = mod12(rootPc - 4) % 3;
  return [0, 3, 6, 9].map((k) => ({
    name: pcName(mod12(52 + base + k)) + ' bass',
    frets: DIM7_SHAPE.map((f) => (f == null ? null : f + base + k)),
  }));
}
