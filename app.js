'use strict';

// ---------- imperative shell: modes + DOM ----------

const $ = (id) => document.getElementById(id);

setInstrument(new URLSearchParams(location.search).get('inst') ?? 'guitar');

const fbSvg = $('fretboard');
const staffSvg = $('staff');
const circleSvg = $('circle');
const rulerSvg = $('ruler');
const infoEl = $('info');
const hintEl = $('hint');

let mode = 'notes';
const st = {
  showNames: true, selPc: null, accPref: 'sharp', // notes mode
  keyIdx: 0, fourths: false, minor: false,  // circle mode
  circleShow: 'scale', circlePos: null,     // circle mode: scale|arp, selected box
  circleLabels: 'names',                    // circle mode: names|degrees
  root: null, target: null, degree: 3, quality: 'M', dir: 1, // interval mode: root/target = {s, f}
  frets: new Array(nStr()).fill(null),         // chord mode: fret per string, null = muted
  placing: null,                               // chord mode: pc awaiting a position choice
  finderRoot: 0, finderType: 0,                // finder mode: pc + CHORD_FORMULAS index
};

const HINTS = {
  notes: 'click a note to light it up everywhere',
  circle: 'click a key (inner ring: minors) or a position box',
  intervals: 'click a root, then a second note',
  chords: 'select and browse shapes, or click to build chords',
};

// NB: the hidden attribute is HTML-only — it neither hides nor toggles on
// <svg> elements, so visibility goes through style.display for everything
const setShown = (elm, visible) => { elm.style.display = visible ? '' : 'none'; };
function setStaff(visible) { setShown(staffSvg, visible); }
function setCircle(visible) { setShown($('circlewrap'), visible); }
function setVoicings(visible) { setShown($('voicings'), visible); }
function setRuler(visible) { setShown(rulerSvg, visible); }
function setChart(visible) { setShown($('pitchchart'), visible); }

// ---------- notes mode ----------

function renderNotes() {
  const markers = [];
  const octaveColor = st.selPc != null ? octaveColorFor(st.selPc) : null;
  const spellOf = (midi) => spellAtMidi(midi, pcSpelling(midi, st.accPref));
  if (octaveColor) {
    for (let s = 0; s < nStr(); s++) {
      for (let f = 0; f <= NUM_FRETS; f++) {
        const midi = fretMidi(s, f);
        if (mod12(midi) === st.selPc) markers.push({ s, f, label: sciName(spellOf(midi)), fill: octaveColor(midi) });
      }
    }
  }
  drawFretboard(fbSvg, {
    names: st.showNames, spell: st.accPref, markers,
    onClick: (s, f) => {
      const pc = mod12(fretMidi(s, f));
      st.selPc = st.selPc === pc ? null : pc;
      render();
    },
  });
  if (st.selPc == null) {
    infoEl.innerHTML = '';
  } else {
    const legend = [];
    const low = STRING_MIDI[nStr() - 1];
    for (let midi = low + mod12(st.selPc - low); midi <= STRING_MIDI[0] + NUM_FRETS; midi += 12) {
      legend.push(`<b style="color:${octaveColor(midi)}">${sciName(spellOf(midi))}</b>`);
    }
    infoEl.innerHTML = `${legend.join(' · ')} — one color per octave`;
  }

  drawPitchChart($('pitchchart'), {
    colorFor: octaveColor,
    spell: st.accPref,
    onClick: (midi) => {
      const pc = mod12(midi);
      st.selPc = st.selPc === pc ? null : pc;
      render();
    },
  });
  setStaff(false); setCircle(false); setVoicings(false); setRuler(false); setChart(true);
}

// ---------- circle mode ----------

function renderCircle() {
  drawCircle(circleSvg, {
    fourths: st.fourths,
    selected: st.minor ? null : st.keyIdx,
    minorSelected: st.minor ? st.keyIdx : null,
    onClick: (k, isMinor) => { st.keyIdx = k; st.minor = isMinor; st.circlePos = null; render(); },
    onToggle: () => { st.fourths = !st.fourths; render(); },
  });

  // minor key root = 6th degree of the relative major, kept in staff range
  const majRoot = keyRoot(st.keyIdx, INSTRUMENT.scaleOctave);
  let root = st.minor ? majorScale(majRoot)[5] : majRoot;
  if (spelledToMidi(root) > INSTRUMENT.rootMax) root = { ...root, octave: root.octave - 1 };
  const rootPc = mod12(spelledToMidi(root));
  const scale = scaleFrom(root, st.minor ? MINOR_STEPS : MAJOR_STEPS);

  const arp = st.circleShow === 'arp';
  const triad = CHORD_FORMULAS[st.minor ? 1 : 0];
  const spellByPc = arp
    ? chordSpelling(rootPc, triad)
    : new Map(scale.slice(0, 7).map((n) => [mod12(spelledToMidi(n)), n]));
  const pcs = new Set(spellByPc.keys());
  const boxes = positionBoxes(rootPc, pcs, st.minor ? CAGED_MINOR_SHAPES : CAGED_SHAPES);
  if (st.circlePos != null && st.circlePos >= boxes.length) st.circlePos = null;

  // big fretboard: everything, or one numbered position box
  if (st.circlePos == null) {
    drawFretboard(fbSvg, { markers: markersForPcs(spellByPc, rootPc, st.circleLabels) });
  } else {
    const box = boxes[st.circlePos];
    const notes = [];
    for (let s = nStr() - 1; s >= 0; s--) for (const f of box.frets[s]) notes.push({ s, f, midi: fretMidi(s, f) });
    notes.sort((a, b) => a.midi - b.midi);
    const rootColor = octaveColorFor(rootPc);
    drawFretboard(fbSvg, {
      markers: notes.map((n, i) => ({ s: n.s, f: n.f, label: String(i + 1), fill: rootColor(n.midi) ?? INK })),
    });
  }

  const name = `${spelledName(root)} ${st.minor ? 'minor' : 'major'}`;
  const tones = [...spellByPc.keys()].length && arp
    ? triad.ints.map(([s]) => { const sp = spellByPc.get(mod12(rootPc + s)); return LETTERS[sp.letter] + accStr(sp.acc); })
    : scale.slice(0, 7).map(spelledName);
  let html = `<b>${name}</b> — ${tones.join(' ')} <span class="muted">(relative ${st.minor ? 'major' : 'minor'}: `
    + `${st.minor ? CIRCLE_MAJORS[st.keyIdx] : CIRCLE_MINORS[st.keyIdx]})</span>`;
  if (st.circlePos != null) {
    const box = boxes[st.circlePos];
    html += `<br>around the ${box.name}, frets ${box.wLo}–${box.wHi} — numbered low to high`;
  }
  infoEl.innerHTML = html;

  const staffNotes = arp
    ? [...triad.ints.map(([s]) => spellAtMidi(spelledToMidi(root) + s, spellByPc.get(mod12(rootPc + s)))),
       spellAtMidi(spelledToMidi(root) + 12, spellByPc.get(rootPc))]
    : scale;
  drawStaffNotes(staffSvg, staffNotes, { labels: true });

  // position boxes, CAGED-chart style
  const vbox = $('voicings');
  vbox.innerHTML = '';
  const lbl = document.createElement('div');
  lbl.className = 'vlabel';
  lbl.textContent = `${arp ? 'arpeggio' : 'scale'} positions`;
  vbox.appendChild(lbl);
  boxes.forEach((b, i) => {
    const svg = el('svg', { viewBox: '0 0 94 110', class: 'diagram' + (i === st.circlePos ? ' sel' : '') });
    drawChordDiagram(svg, b.frets, { rootPc, label: b.name });
    svg.addEventListener('click', () => {
      st.circlePos = st.circlePos === i ? null : i;
      render();
    });
    vbox.appendChild(svg);
  });

  setStaff(true); setCircle(true); setVoicings(true); setRuler(false); setChart(false);
}

// ---------- interval mode ----------

function qualityChoices(degree) {
  return PERFECT_DEGREES.includes(degree) ? ['d', 'P', 'A'] : ['d', 'm', 'M', 'A'];
}

// default diatonic reading of a half-step count (1..12)
const SEMIS_TO_SIMPLE = {
  1: [2, 'm'], 2: [2, 'M'], 3: [3, 'm'], 4: [3, 'M'], 5: [4, 'P'], 6: [5, 'd'],
  7: [5, 'P'], 8: [6, 'm'], 9: [6, 'M'], 10: [7, 'm'], 11: [7, 'M'], 12: [8, 'P'],
};

function rebuildQualitySelect() {
  const sel = $('quality');
  const choices = qualityChoices(st.degree);
  if (!choices.includes(st.quality)) st.quality = choices.includes('M') ? 'M' : 'P';
  sel.innerHTML = '';
  for (const q of choices) {
    const o = document.createElement('option');
    o.value = q;
    o.textContent = QUALITY_NAMES[q];
    o.selected = q === st.quality;
    sel.appendChild(o);
  }
}

// a clicked second note sets the interval menus to its default diatonic reading
function setTargetFromClick(s, f) {
  const d = fretMidi(s, f) - fretMidi(st.root.s, st.root.f);
  if (d === 0) return;
  const [deg, q] = SEMIS_TO_SIMPLE[((Math.abs(d) - 1) % 12) + 1];
  st.degree = deg;
  st.quality = q;
  st.dir = d > 0 ? 1 : -1;
  st.target = { s, f };
  $('degree').value = String(deg);
  rebuildQualitySelect();
  $('dir').value = String(st.dir);
}

// standard words for a fretboard move: higher/lower strings (pitch-wise),
// frets up/down the neck (up = toward the bridge)
function distanceWords(from, to) {
  const strings = from.s - to.s; // positive: toward the higher strings
  const frets = to.f - from.f;   // positive: up the neck
  const parts = [];
  if (strings === 0) parts.push('same string');
  else parts.push(`${Math.abs(strings)} string${Math.abs(strings) === 1 ? '' : 's'} ${strings > 0 ? 'higher' : 'lower'}`);
  if (frets === 0) parts.push('same fret');
  else parts.push(`${Math.abs(frets)} fret${Math.abs(frets) === 1 ? '' : 's'} ${frets > 0 ? 'up' : 'down'}`);
  return parts.join(', ');
}

function renderInterval() {
  const markers = [];
  let html = '';

  if (st.root) {
    const rootMidi = fretMidi(st.root.s, st.root.f);
    const root = midiToSpelled(rootMidi);
    const target = applyInterval(root, st.degree, st.quality, st.dir);
    const targetPc = mod12(spelledToMidi(target));
    const semis = intervalSemitones(st.degree, st.quality);

    const targetColor = octaveColorFor(targetPc);
    for (let s = 0; s < nStr(); s++) {
      for (let f = 0; f <= NUM_FRETS; f++) {
        if (mod12(fretMidi(s, f)) === targetPc && !(s === st.root.s && f === st.root.f)) {
          const clicked = st.target && s === st.target.s && f === st.target.f;
          if (clicked) {
            markers.push({ s, f, label: sciName(spellAtMidi(fretMidi(s, f), target)), fill: targetColor(fretMidi(s, f)) });
          } else if (st.target) {
            // a pair is demonstrated: other octaves stay quiet context
            markers.push({ s, f, dot: true, fill: targetColor(fretMidi(s, f)) });
          } else {
            markers.push({ s, f, label: sciName(spellAtMidi(fretMidi(s, f), target)), fill: targetColor(fretMidi(s, f)), hollow: true });
          }
        }
      }
    }
    markers.push({ s: st.root.s, f: st.root.f, label: sciName(root), fill: ACCENT });

    html = `<b>${intervalName(st.degree, st.quality)}</b> ${st.dir > 0 ? 'up' : 'down'}`
      + ` — ${semis} half step${semis === 1 ? '' : 's'}<br>`
      + `${sciName(root)} → <b>${sciName(target)}</b>`;
    if (st.target) {
      html += `<br><span class="muted">${distanceWords(st.root, st.target)}</span>`;
      const d = Math.abs(fretMidi(st.target.s, st.target.f) - rootMidi);
      if (d > 12) {
        html += `<br><span class="muted">clicked notes span ${semitoneName(d)} (${d} half steps) — named within the octave</span>`;
      }
    }
    drawStaffNotes(staffSvg, [root, target], {
      labels: true,
      colors: [INK, targetColor(spelledToMidi(target)) ?? ACCENT],
    });

    // ruler: target slot measured upward from the root; a downward interval
    // lands on its inversion (major 3rd down = minor 6th up to the same pc)
    const slot = st.dir > 0 ? semis : (12 - semis) % 12;
    const marks = [{ semis: 0, label: spelledName(root) }];
    if (slot !== 0) marks.push({ semis: slot, label: spelledName(target) });
    drawDegreeRuler(rulerSvg, marks, { onClick: rulerSetInterval });
    if (st.dir < 0 && slot !== 0) {
      html += `<br><span class="muted">on the ruler: ${semitoneName(slot)} up to the same pitch class — the inversion</span>`;
    }
  } else {
    drawStaffNotes(staffSvg, []);
    drawDegreeRuler(rulerSvg, [], { onClick: rulerSetInterval });
  }

  drawFretboard(fbSvg, {
    names: !st.root, markers,
    onClick: (s, f, ev) => {
      if (st.root && s === st.root.s && f === st.root.f) {
        st.root = null; st.target = null;          // click the root again to clear
      } else if (!st.root) {
        st.root = { s, f }; st.target = null;      // first click: root
      } else if (ev.shiftKey || !st.target) {
        setTargetFromClick(s, f);                  // second click (or shift-click): target
      } else {
        st.root = { s, f }; st.target = null;      // pair done: plain click starts over
      }
      render();
    },
  });
  infoEl.innerHTML = html;

  // Aguado's movable shape models for this interval; click one to place it
  const semis = intervalSemitones(st.degree, st.quality);
  const box = $('voicings');
  box.innerHTML = '';
  const lbl = document.createElement('div');
  lbl.className = 'vlabel';
  lbl.textContent = `${intervalName(st.degree, st.quality)} shapes`;
  box.appendChild(lbl);
  for (const sh of intervalShapes(semis)) {
    const all = sh.frets.flatMap((f) => (f == null ? [] : Array.isArray(f) ? f : [f]));
    const fr = all.filter((f) => f > 0);
    const start = fr.length && Math.max(...fr) > 4 && !all.includes(0) ? Math.min(...fr) : 1;
    const rows = Math.max(4, (fr.length ? Math.max(...fr) : 0) - start + 1);
    const svg = el('svg', { viewBox: `0 0 94 ${20 + rows * 14 + 20}`, class: 'diagram' });
    // same scheme as the neck demo: red root, octave-colored target
    const rootMidi = fretMidi(sh.root.s, sh.root.f);
    const shTargetColor = octaveColorFor(mod12(fretMidi(sh.target.s, sh.target.f)));
    drawChordDiagram(svg, sh.frets, {
      label: sh.name,
      colorFor: (m) => (m === rootMidi ? ACCENT : shTargetColor(m)),
      hollowFor: (m) => m !== rootMidi, // targets are rings, like on the neck
    });
    const tip = el('title', {});
    tip.textContent = distanceWords(sh.root, sh.target);
    svg.appendChild(tip);
    svg.addEventListener('click', () => {
      st.root = { ...sh.root };
      st.target = { ...sh.target };
      st.dir = 1;
      $('dir').value = '1';
      render();
    });
    box.appendChild(svg);
  }

  setStaff(true); setCircle(false); setVoicings(true); setRuler(true); setChart(false);
}

// clicking a ruler slot picks that interval (upward, default diatonic reading)
function rulerSetInterval(i) {
  if (i === 0) return;
  const [deg, q] = SEMIS_TO_SIMPLE[i];
  st.degree = deg;
  st.quality = q;
  st.dir = 1;
  st.target = null;
  $('degree').value = String(deg);
  rebuildQualitySelect();
  $('dir').value = '1';
  render();
}

// ---------- chords mode: browse shapes and build, one screen ----------

function renderChords() {
  const formula = CHORD_FORMULAS[st.finderType];
  const browseRoot = st.finderRoot; // null = blank builder, nothing browsed
  const browseSpell = browseRoot == null ? new Map() : chordSpelling(browseRoot, formula);

  const sounding = []; // [{s, f, midi}] low string first
  for (let s = nStr() - 1; s >= 0; s--) {
    if (st.frets[s] != null) sounding.push({ s, f: st.frets[s], midi: fretMidi(s, st.frets[s]) });
  }
  const midis = sounding.map((n) => n.midi);
  const matches = identifyChords(midis);
  const best = matches[0];
  const spellByPc = best ? chordSpelling(best.root, best.formula) : null;
  const spellOf = (midi) => spellByPc?.get(mod12(midi)) ?? browseSpell.get(mod12(midi)) ?? pcSpelling(midi, st.accPref);

  // a stale placing pc (already sounding, or nowhere to go) clears itself
  if (st.placing != null && midis.some((m) => mod12(m) === st.placing)) st.placing = null;

  // faint map of the browsed chord's tones, built notes on top
  const markers = [];
  for (let s = 0; s < nStr(); s++) {
    for (let f = 0; f <= NUM_FRETS; f++) {
      if (browseSpell.has(mod12(fretMidi(s, f))) && st.frets[s] !== f) {
        markers.push({ s, f, dot: true, fill: octaveColorFor(browseRoot ?? -1)(fretMidi(s, f)) ?? INK });
      }
    }
  }
  const builtRootColor = best ? octaveColorFor(best.root) : () => null;
  markers.push(...sounding.map((n) => ({
    s: n.s, f: n.f,
    label: sciName(spellAtMidi(n.midi, spellOf(n.midi))),
    fill: builtRootColor(n.midi) ?? INK,
  })));
  if (st.placing != null) {
    const color = octaveColorFor(st.placing);
    for (const c of candidatesFor((m) => mod12(m) === st.placing)) {
      markers.push({ s: c.s, f: c.f, label: sciName(midiToSpelled(c.midi)), fill: color(c.midi), hollow: true });
    }
  }
  drawFretboard(fbSvg, {
    names: sounding.length === 0 && browseRoot == null, markers,
    onClick: (s, f) => {
      st.frets[s] = st.frets[s] === f ? null : f;
      st.placing = null;
      render();
    },
  });

  const vs = browseRoot == null ? [] : voicings(browseRoot, formula);
  const shown = vs.slice(0, 12);

  let html = '';
  if (sounding.length === 0 && browseRoot != null) {
    const tones = formula.ints.map(([s]) => {
      const sp = browseSpell.get(mod12(browseRoot + s));
      return LETTERS[sp.letter] + accStr(sp.acc);
    });
    html = `<b>${pcName(browseRoot)}${formula.sym}</b> <span class="muted">(${tones.join(' ')})</span>`
      + ` — ${vs.length} fingering${vs.length === 1 ? '' : 's'}${vs.length > shown.length ? `, showing ${shown.length}` : ''}`;
  }
  if (sounding.length > 0) {
    const names = sounding.map((n) => sciName(spellAtMidi(n.midi, spellOf(n.midi))));
    html += `notes: <b>${names.join(' – ')}</b>`;
    const gaps = [];
    for (let i = 1; i < sounding.length; i++) {
      const d = sounding[i].midi - sounding[i - 1].midi;
      gaps.push(`${semitoneName(Math.abs(d))} (${d > 0 ? '' : '−'}${Math.abs(d)})`);
    }
    if (gaps.length) html += `<br>spacing: ${gaps.join(', ')}`;
    if (matches.length) {
      const spelled = best.formula.ints.map(([semis]) => {
        const sp = spellByPc.get(mod12(best.root + semis));
        return LETTERS[sp.letter] + accStr(sp.acc);
      });
      const fromRoot = best.formula.ints.filter(([semis]) => semis !== 0).map(([semis]) => {
        const sp = spellByPc.get(mod12(best.root + semis));
        return `${LETTERS[sp.letter] + accStr(sp.acc)} = ${semitoneName(semis)} (${semis})`;
      });
      html += `<br>from ${pcName(best.root)}: ${fromRoot.join(', ')}`;
      html += `<br>chord: <b>${chordName(best)}</b> <span class="muted">(${spelled.join(' ')})</span>`;
      if (matches.length > 1) {
        html += `<br><span class="muted">also reads as: ${matches.slice(1, 4).map(chordName).join(', ')}</span>`;
      }
    } else if (new Set(midis.map(mod12)).size >= 3) {
      html += `<br><span class="muted">no standard chord name for this one</span>`;
    }
  }
  infoEl.innerHTML = html;

  // toggle every string sounding a matched pitch, or place it on a free string
  const togglePitch = (pred) => {
    st.placing = null;
    const hits = [];
    for (let s = 0; s < nStr(); s++) {
      if (st.frets[s] != null && pred(fretMidi(s, st.frets[s]))) hits.push(s);
    }
    if (hits.length) hits.forEach((s) => { st.frets[s] = null; });
    else placeOnFree(pred);
    render();
  };

  // the staff is a readout; the fretboard and ruler are the editing surfaces
  if (sounding.length) {
    drawStaffNotes(staffSvg, sounding.map((n) => ({
      ...spellAtMidi(n.midi, spellOf(n.midi)),
      color: builtRootColor(n.midi) ?? INK,
    })), { chord: true });
  } else if (browseRoot != null) {
    // browse arpeggio: tones ascending from the root, octave root on top
    const rootMidi = INSTRUMENT.arpBase + browseRoot;
    const arp = formula.ints.map(([s]) => spellAtMidi(rootMidi + s, browseSpell.get(mod12(browseRoot + s))));
    arp.push(spellAtMidi(rootMidi + 12, browseSpell.get(browseRoot)));
    drawStaffNotes(staffSvg, arp, { labels: true });
  } else {
    drawStaffNotes(staffSvg, []); // blank builder
  }

  // ruler anchor: identified root, else the lowest sounding note, else the
  // browsed root — clicking a slot always places or removes that tone
  const anchor = best ? best.root : midis.length ? mod12(Math.min(...midis)) : browseRoot;
  const marks = midis.length
    ? [...new Set(midis.map(mod12))].map((pc) => {
        const sp = spellOf(pc);
        return { semis: mod12(pc - anchor), label: LETTERS[sp.letter] + accStr(sp.acc) };
      })
    : browseRoot == null ? []
    : formula.ints.map(([s]) => {
        const sp = browseSpell.get(mod12(browseRoot + s));
        return { semis: s, label: LETTERS[sp.letter] + accStr(sp.acc), hollow: true };
      });
  if (st.placing != null) {
    const sp = midiToSpelled(st.placing);
    marks.push({ semis: mod12(st.placing - anchor), label: spelledName(sp), hollow: true });
  }
  drawDegreeRuler(rulerSvg, marks, {
    onClick: (i) => {
      if (anchor == null) return; // blank builder: nothing to be relative to yet
      const pc = mod12(anchor + i);
      if (midis.some((m) => mod12(m) === pc)) {
        st.placing = null;
        togglePitch((m) => mod12(m) === pc); // present: remove everywhere
        return;
      }
      if (st.placing === pc) { st.placing = null; render(); return; } // second click cancels
      const cands = candidatesFor((m) => mod12(m) === pc);
      if (cands.length <= 1) {
        if (cands.length) st.frets[cands[0].s] = cands[0].f;
        st.placing = null;
      } else {
        st.placing = pc; // several spots: show them, colored by octave
      }
      render();
    },
  });

  // shape rows + fingerings for the browsed chord; click one to load it
  const box = $('voicings');
  box.innerHTML = '';
  if (browseRoot == null) {
    if (st.placing != null) {
      hintEl.textContent = `pick a spot for ${pcName(st.placing)} — hollow markers are the options, one color per octave`;
    }
    setStaff(true); setCircle(false); setVoicings(false); setRuler(true); setChart(false);
    return;
  }
  const addDiagram = (frets, label) => {
    const svg = el('svg', { viewBox: label ? '0 0 94 110' : '0 0 94 82', class: 'diagram' });
    drawChordDiagram(svg, frets, { rootPc: browseRoot, label });
    if (frets.every((f) => f == null || f <= NUM_FRETS)) {
      svg.addEventListener('click', () => {
        st.frets = [...frets];
        st.placing = null;
        render();
      });
    }
    box.appendChild(svg);
  };
  const shapeRows = [];
  if (formula.sym === '') shapeRows.push({ label: 'CAGED', shapes: cagedShapes(browseRoot) });
  if (formula.sym === 'm') shapeRows.push({ label: 'CAGED minor', shapes: cagedShapes(browseRoot, CAGED_MINOR_SHAPES) });
  if (formula.sym === 'dim7') shapeRows.push({ label: 'dim7 — one shape, every three frets', shapes: dim7Positions(browseRoot) });
  const closed = closedTriads(browseRoot, formula);
  if (closed.length) shapeRows.push({ label: 'closed triads', shapes: closed.slice(0, 8) });
  const spreads = spreadTriads(browseRoot, formula);
  if (spreads.length) shapeRows.push({ label: 'spread triads', shapes: spreads.slice(0, 8) });
  for (const row of shapeRows) {
    const lbl = document.createElement('div');
    lbl.className = 'vlabel';
    lbl.textContent = row.label;
    box.appendChild(lbl);
    for (const sh of row.shapes) addDiagram(sh.frets, sh.name);
  }
  if (shapeRows.length) {
    const lbl2 = document.createElement('div');
    lbl2.className = 'vlabel';
    lbl2.textContent = 'fingerings';
    box.appendChild(lbl2);
  }
  for (const v of shown) addDiagram(v.frets);

  if (st.placing != null) {
    hintEl.textContent = `pick a spot for ${pcName(st.placing)} — hollow markers are the options, one color per octave`;
  }
  setStaff(true); setCircle(false); setVoicings(true); setRuler(true); setChart(false);
}

// every playable spot for a pitch (pred over sounding midi): free strings if
// any fit, else re-fret spots for strings whose tone is doubled elsewhere.
// Fretted span stays within a hand's reach; scored to prefer low positions
// above the current bass.
function candidatesFor(pred) {
  const lowest = Math.min(...st.frets.map((f, s) => (f != null ? fretMidi(s, f) : Infinity)));
  const scan = (strings) => {
    const out = [];
    for (const s of strings) {
      const others = st.frets.filter((f, i) => i !== s && f != null && f > 0);
      for (let f = 0; f <= NUM_FRETS; f++) {
        const m = fretMidi(s, f);
        if (!pred(m)) continue;
        const nf = f > 0 ? [...others, f] : others;
        const span = nf.length ? Math.max(...nf) - Math.min(...nf) : 0;
        if (span > 3) continue;
        out.push({ s, f, midi: m, score: span * 10 + f + (m < lowest ? 500 : 0) });
      }
    }
    return out;
  };

  const all = Array.from({ length: nStr() }, (_, i) => i);
  let list = scan(all.filter((s) => st.frets[s] == null));
  if (!list.length) {
    const counts = {};
    for (const s of all) {
      if (st.frets[s] == null) continue;
      const pc = mod12(fretMidi(s, st.frets[s]));
      counts[pc] = (counts[pc] ?? 0) + 1;
    }
    list = scan(all.filter((s) => st.frets[s] != null && counts[mod12(fretMidi(s, st.frets[s]))] >= 2));
  }
  return list.sort((a, b) => a.score - b.score);
}

function placeOnFree(pred) {
  const spot = candidatesFor(pred)[0];
  if (spot) st.frets[spot.s] = spot.f;
}

// ---------- dispatch + wiring ----------

const RENDERERS = { notes: renderNotes, circle: renderCircle, intervals: renderInterval, chords: renderChords };

function render() {
  for (const btn of document.querySelectorAll('#modes button')) {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  }
  for (const span of document.querySelectorAll('#controls .ctl')) {
    span.hidden = span.id !== 'ctl-' + mode;
  }
  hintEl.textContent = HINTS[mode];
  $('modelabel').textContent = document.querySelector(`#modes button[data-mode="${mode}"]`).textContent.toLowerCase();
  RENDERERS[mode]();
}

for (const btn of document.querySelectorAll('#modes button')) {
  btn.addEventListener('click', () => {
    mode = btn.dataset.mode;
    history.replaceState(null, '', '#' + mode);
    $('modes').classList.remove('open');
    render();
  });
}

$('menubtn').addEventListener('click', () => $('modes').classList.toggle('open'));
document.addEventListener('click', (ev) => {
  if (!ev.target.closest('#topbar')) $('modes').classList.remove('open');
});

$('shownames').addEventListener('change', (e) => { st.showNames = e.target.checked; render(); });
$('accpref').addEventListener('change', (e) => { st.accPref = e.target.value; render(); });

$('circleshow').addEventListener('change', (e) => { st.circleShow = e.target.value; render(); });
$('circlelabels').addEventListener('change', (e) => { st.circleLabels = e.target.value; render(); });

$('degree').addEventListener('change', (e) => {
  st.degree = parseInt(e.target.value, 10);
  st.target = null;
  rebuildQualitySelect();
  render();
});
$('quality').addEventListener('change', (e) => { st.quality = e.target.value; st.target = null; render(); });
$('dir').addEventListener('change', (e) => { st.dir = parseInt(e.target.value, 10); st.target = null; render(); });

$('clearchord').addEventListener('click', () => { st.frets.fill(null); st.placing = null; render(); });

{
  const blank = document.createElement('option');
  blank.value = '';
  blank.textContent = '—';
  $('chordroot').appendChild(blank);
}
for (let pc = 0; pc < 12; pc++) {
  const o = document.createElement('option');
  o.value = String(pc);
  o.textContent = pcName(pc);
  $('chordroot').appendChild(o);
}
$('chordroot').value = '0'; // default browse: C
CHORD_FORMULAS.forEach((f, i) => {
  const o = document.createElement('option');
  o.value = String(i);
  o.textContent = f.label;
  $('chordtype').appendChild(o);
});
// the selects define what the screen shows: changing them starts fresh
$('chordroot').addEventListener('change', (e) => {
  st.finderRoot = e.target.value === '' ? null : parseInt(e.target.value, 10);
  st.frets.fill(null);
  st.placing = null;
  render();
});
$('chordtype').addEventListener('change', (e) => {
  st.finderType = parseInt(e.target.value, 10);
  st.frets.fill(null);
  st.placing = null;
  render();
});

// chord modes are guitar-only; bass is a single-note instrument
if (!INSTRUMENT.chords) {
  for (const m of ['chords']) {
    document.querySelector(`#modes button[data-mode="${m}"]`).style.display = 'none';
    delete RENDERERS[m];
  }
  $('titlebar').textContent += ' — bass';
  document.title += ' — bass';
}

const instSel = $('instrumentsel');
instSel.value = INSTRUMENT === INSTRUMENTS.bass ? 'bass' : 'guitar';
instSel.addEventListener('change', (e) => {
  const u = new URL(location);
  u.searchParams.set('inst', e.target.value);
  location.href = u; // reload with fresh per-instrument state
});

const hash = location.hash.slice(1);
const alias = { chord: 'chords', finder: 'chords' }; // pre-merge bookmarks
if (RENDERERS[alias[hash] ?? hash]) mode = alias[hash] ?? hash;
rebuildQualitySelect();
render();
