'use strict';

// static tutorial diagrams, built with the same renderers as the toy

const $ = (id) => document.getElementById(id);

// 1. every note name
drawFretboard($('fb-notes'), { names: true });

// 2. circle with G selected, G major on the neck
drawCircle($('circ'), { selected: 1 });
{
  const scale = majorScale(keyRoot(1, 3));
  const spellByPc = new Map(scale.slice(0, 7).map((n) => [mod12(spelledToMidi(n)), n]));
  drawFretboard($('fb-gmajor'), { markers: markersForPcs(spellByPc, mod12(spelledToMidi(scale[0]))) });
}

// 3. major 3rd up from G (6th string, 3rd fret)
{
  const rootPos = { s: 5, f: 3 };
  const root = midiToSpelled(fretMidi(rootPos.s, rootPos.f));
  const target = applyInterval(root, 3, 'M', 1);
  const targetPc = mod12(spelledToMidi(target));
  const markers = [];
  for (let s = 0; s < 6; s++) {
    for (let f = 0; f <= NUM_FRETS; f++) {
      if (mod12(fretMidi(s, f)) === targetPc) {
        markers.push({ s, f, label: sciName(spellAtMidi(fretMidi(s, f), target)), fill: ACCENT, hollow: true });
      }
    }
  }
  markers.push({ s: rootPos.s, f: rootPos.f, label: sciName(root), fill: ACCENT });
  drawFretboard($('fb-interval'), { markers });
  drawStaffNotes($('staff-interval'), [root, target], { labels: true, colors: [INK, ACCENT] });
}

// 4b. degree ruler with C major marks
drawDegreeRuler($('t-ruler'), [
  { semis: 0, label: 'C' }, { semis: 4, label: 'E' }, { semis: 7, label: 'G' },
]);

// 6. CAGED: the five C major shapes up the neck
{
  const box = $('caged-row');
  for (const sh of cagedShapes(0)) {
    const svg = el('svg', { viewBox: '0 0 94 96', class: 'diagram' });
    drawChordDiagram(svg, sh.frets, { rootPc: 0, label: sh.name });
    box.appendChild(svg);
  }
}

// 5. chord finder: top C major fingerings
{
  const box = $('c-voicings');
  for (const v of voicings(0, CHORD_FORMULAS[0]).slice(0, 4)) {
    const svg = el('svg', { viewBox: '0 0 94 82', class: 'diagram' });
    drawChordDiagram(svg, v.frets, { rootPc: 0 });
    box.appendChild(svg);
  }
}

// 4. open C major, analyzed with the real chord machinery
{
  const frets = [0, 1, 0, 2, 3, null]; // high e to low E
  const sounding = [];
  for (let s = 5; s >= 0; s--) {
    if (frets[s] != null) sounding.push({ s, f: frets[s], midi: fretMidi(s, frets[s]) });
  }
  const best = identifyChords(sounding.map((n) => n.midi))[0];
  const spellByPc = chordSpelling(best.root, best.formula);
  const name = (midi) => sciName(spellAtMidi(midi, spellByPc.get(mod12(midi))));
  drawFretboard($('fb-chord'), {
    markers: sounding.map((n) => ({
      s: n.s, f: n.f, label: name(n.midi),
      fill: mod12(n.midi) === best.root ? ACCENT : INK,
    })),
  });
  const gaps = [];
  for (let i = 1; i < sounding.length; i++) {
    const d = sounding[i].midi - sounding[i - 1].midi;
    gaps.push(`${semitoneName(d)} (${d})`);
  }
  $('chord-analysis').innerHTML =
    `Low string to high: <b>${sounding.map((n) => name(n.midi)).join(' – ')}</b>.`
    + ` The spacing between neighbors: ${gaps.join(', ')}.`
    + ` The builder reads this as <b>${chordName(best)}</b>.`;
  drawStaffNotes($('staff-chord'), sounding.map((n) => ({
    ...spellAtMidi(n.midi, spellByPc.get(mod12(n.midi))),
    color: mod12(n.midi) === best.root ? ACCENT : INK,
  })), { chord: true });
}
