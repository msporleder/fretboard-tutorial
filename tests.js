const assert = (cond, msg) => { if (!cond) { console.error("FAIL:", msg); process.exitCode = 1; } };

// spelling round trips
assert(spelledName(midiToSpelled(64)) === "E", "E4 name");
assert(spelledToMidi(midiToSpelled(61)) === 61, "midi round trip");
assert(pcName(1) === "D♭" && pcName(6) === "F♯", "pc names");

// intervals
assert(intervalSemitones(3, "M") === 4 && intervalSemitones(3, "m") === 3 && intervalSemitones(3, "A") === 5, "3rd sizes");
assert(intervalSemitones(5, "d") === 6 && intervalSemitones(5, "P") === 7, "5th sizes");
let t = applyInterval(midiToSpelled(55), 3, "M", 1); // G3 up M3
assert(spelledName(t) === "B" && spelledToMidi(t) === 59, "G+M3=B: " + spelledName(t));
t = applyInterval({letter:2, acc:0, octave:4}, 3, "A", 1); // E4 up A3 -> G double sharp
assert(spelledName(t) === "G𝄪" && spelledToMidi(t) === 69, "E+A3=Gx: " + spelledName(t));
t = applyInterval({letter:1, acc:-1, octave:4}, 5, "d", -1); // Db4 down d5 -> G3
assert(spelledName(t) === "G" && t.octave === 3, "Db-d5=G: " + spelledName(t) + t.octave);
t = applyInterval(midiToSpelled(60), 8, "P", -1);
assert(spelledName(t) === "C" && spelledToMidi(t) === 48, "octave down");

// scales
const g = majorScale(keyRoot(1, 3)).map(spelledName);
assert(g.join(" ") === "G A B C D E F♯ G", "G major: " + g.join(" "));
const eb = majorScale(keyRoot(9, 3)).map(spelledName);
assert(eb.join(" ") === "E♭ F G A♭ B♭ C D E♭", "Eb major: " + eb.join(" "));
const fsh = majorScale(keyRoot(6, 3)).map(spelledName);
assert(fsh.join(" ") === "F♯ G♯ A♯ B C♯ D♯ E♯ F♯", "F# major: " + fsh.join(" "));

// chords: open C major = C3 E3 G3 C4 E4
let m = identifyChords([48, 52, 55, 60, 64]);
assert(chordName(m[0]) === "C", "open C: " + chordName(m[0]));
// C6 / Am7 ambiguity
m = identifyChords([45, 48, 52, 55]);
const names = m.map(chordName);
assert(names.includes("Am7") && names.includes("C6/A"), "ambiguity: " + names.join(","));
assert(names[0] === "Am7", "root-position first: " + names[0]);
// slash chord: C/E
m = identifyChords([52, 55, 60]);
assert(chordName(m[0]) === "C/E", "slash: " + chordName(m[0]));
// power chord
m = identifyChords([40, 47]);
assert(chordName(m[0]) === "E5", "power: " + chordName(m[0]));
// spelling of Eb major chord tones
const sp = chordSpelling(3, CHORD_FORMULAS[0]);
const tones = [...sp.values()].map(n => LETTERS[n.letter] + accStr(n.acc));
assert(tones.join(" ") === "E♭ G B♭", "Eb triad: " + tones.join(" "));

// fretboard math
assert(fretMidi(5, 0) === 40 && fretMidi(0, 12) === 76, "fret midi");
assert(Math.abs(fretX(12) - (FB.nutX + FB.scale / 2)) < 1e-9, "12th fret at half scale");

// staff geometry: E4 (bottom line) written E5 -> above middle
assert(diatonicToY(30) === STAFF_BOT_Y, "bottom line y");

// semitone names
assert(semitoneName(4) === "major 3rd" && semitoneName(16) === "major 3rd + octave", "semitone names");

// scientific notation
assert(sciName(midiToSpelled(40)) === "E2" && sciName(midiToSpelled(64)) === "E4", "sci names");
assert(sciName(spellAtMidi(46, { letter: 6, acc: -1 })) === "B♭2", "sci with flat");
// voicing search
const maj = CHORD_FORMULAS.findIndex((f) => f.sym === '');
const m7i = CHORD_FORMULAS.findIndex((f) => f.sym === 'm7');
const has = (vs, shape) => vs.some((v) => v.frets.every((f, i) => f === shape[i]));
const vC = voicings(0, CHORD_FORMULAS[maj]);
assert(has(vC, [0, 1, 0, 2, 3, null]), "open C shape found");
const vE = voicings(4, CHORD_FORMULAS[maj]);
assert(has(vE, [0, 0, 1, 2, 2, 0]), "open E shape found");
const vAm7 = voicings(9, CHORD_FORMULAS[m7i]);
assert(has(vAm7, [0, 1, 0, 2, 0, null]), "open Am7 shape found");
// every result is valid
for (const v of vC.concat(vAm7)) {
  const sounded = [];
  v.frets.forEach((f, s) => { if (f != null) sounded.push(s); });
  assert(sounded[sounded.length - 1] - sounded[0] === sounded.length - 1, "contiguous: " + v.frets);
  const fretted = v.frets.filter((f) => f > 0);
  if (fretted.length) assert(Math.max(...fretted) - Math.min(...fretted) <= 3, "span: " + v.frets);
}
// all tones present in every C major voicing
for (const v of vC) {
  const pcs = new Set(v.frets.map((f, s) => f == null ? null : mod12(fretMidi(s, f))).filter((p) => p != null));
  assert(pcs.has(0) && pcs.has(4) && pcs.has(7) && pcs.size === 3, "tones: " + v.frets);
}
// top-ranked C voicing has C in the bass
{
  const f = vC[0].frets;
  let bass = null;
  for (let s = 5; s >= 0; s--) if (f[s] != null) { bass = mod12(fretMidi(s, f[s])); break; }
  assert(bass === 0, "top C voicing bass: " + bass);
}
// CAGED: every shape of every root is that major chord, root in the bass
for (let pc = 0; pc < 12; pc++) {
  for (const sh of cagedShapes(pc)) {
    const midis = [];
    sh.frets.forEach((f, s) => { if (f != null) midis.push(fretMidi(s, f)); });
    const pcs = new Set(midis.map(mod12));
    assert(pcs.has(pc) && pcs.has(mod12(pc + 4)) && pcs.has(mod12(pc + 7)) && pcs.size === 3,
      `caged tones pc=${pc} ${sh.name}: ${sh.frets}`);
    assert(mod12(Math.min(...midis)) === pc, `caged bass pc=${pc} ${sh.name}`);
  }
  assert(cagedShapes(pc).length === 5, "five shapes");
}
// C major CAGED order up the neck: C A G E D shapes
assert(cagedShapes(0).map((s) => s.name[0]).join('') === 'CAGED', "C caged order: " + cagedShapes(0).map((s) => s.name).join(','));
// minor CAGED: every shape of every root is that minor chord, root in the bass
for (let pc = 0; pc < 12; pc++) {
  for (const sh of cagedShapes(pc, CAGED_MINOR_SHAPES)) {
    const midis = [];
    sh.frets.forEach((f, s) => { if (f != null) midis.push(fretMidi(s, f)); });
    const pcs = new Set(midis.map(mod12));
    assert(pcs.has(pc) && pcs.has(mod12(pc + 3)) && pcs.has(mod12(pc + 7)) && pcs.size === 3,
      `caged-m tones pc=${pc} ${sh.name}: ${sh.frets}`);
    assert(mod12(Math.min(...midis)) === pc, `caged-m bass pc=${pc} ${sh.name}`);
  }
}
assert(cagedShapes(0, CAGED_MINOR_SHAPES).map((s) => s.name[0]).join('') === 'CAGED', "Cm caged order");
// dim7: four positions, 3 frets apart, each the full dim7 pc set
for (let pc = 0; pc < 12; pc++) {
  const want = new Set([pc, (pc + 3) % 12, (pc + 6) % 12, (pc + 9) % 12]);
  const pos = dim7Positions(pc);
  assert(pos.length === 4, "dim7 count");
  pos.forEach((p, k) => {
    const midis = [];
    p.frets.forEach((f, s) => { if (f != null) midis.push(fretMidi(s, f)); });
    const pcs = new Set(midis.map(mod12));
    assert(pcs.size === 4 && [...pcs].every((x) => want.has(x)), `dim7 tones pc=${pc} k=${k}: ${p.frets}`);
    if (k) assert(Math.min(...p.frets.filter((f) => f != null)) - Math.min(...pos[k - 1].frets.filter((f) => f != null)) === 3, "dim7 spacing");
  });
}
// natural minor scales
const am = scaleFrom({ letter: 5, acc: 0, octave: 2 }, MINOR_STEPS).map(spelledName);
assert(am.join(" ") === "A B C D E F G A", "A minor: " + am.join(" "));
const fsm = scaleFrom({ letter: 3, acc: 1, octave: 3 }, MINOR_STEPS).map(spelledName);
assert(fsm.join(" ") === "F♯ G♯ A B C♯ D E F♯", "F# minor: " + fsm.join(" "));
// relative minor derivation: 6th of G major is E
assert(spelledName(majorScale(keyRoot(1, 3))[5]) === "E", "relative minor of G");
// position boxes: C major scale, 5 boxes, all notes in window and in scale
{
  const scale = majorScale(keyRoot(0, 3));
  const pcs = new Set(scale.slice(0, 7).map((n) => mod12(spelledToMidi(n))));
  const boxes = positionBoxes(0, pcs);
  assert(boxes.length === 5, "five boxes");
  for (const b of boxes) {
    assert(b.wHi - b.wLo === 4, "5-fret window");
    b.frets.forEach((fs, s) => {
      assert(fs.length >= 2, `>=2 notes per string ${b.name} s=${s}: ${fs}`);
      for (const f of fs) {
        assert(f >= b.wLo && f <= b.wHi && pcs.has(mod12(fretMidi(s, f))), `box note ${b.name} ${s}/${f}`);
      }
    });
  }
}
// ---------- bass ----------
setInstrument('bass');
assert(nStr() === 4 && fretMidi(3, 0) === 28 && fretMidi(0, 12) === 55, "bass tuning");
// octave colors anchor at E1
assert(octaveColorFor(4)(28) === OCTAVE_COLORS[0] && octaveColorFor(4)(40) === OCTAVE_COLORS[1]
  && octaveColorFor(4)(52) === OCTAVE_COLORS[2], "bass octave anchor");
// position boxes: root-anchored, valid notes, ordered
{
  const scale = majorScale(keyRoot(0, 2));
  const pcs = new Set(scale.slice(0, 7).map((n) => mod12(spelledToMidi(n))));
  const boxes = positionBoxes(0, pcs);
  assert(boxes.length >= 2 && boxes.length <= 3, "bass box count: " + boxes.length);
  assert(boxes.every((b) => b.name.startsWith('root on ')), "bass box names: " + boxes.map((b) => b.name));
  for (const b of boxes) {
    assert(b.frets.length === 4, "bass box rows");
    b.frets.forEach((fs, s) => fs.forEach((f) => {
      assert(f >= b.wLo && f <= b.wHi && pcs.has(mod12(fretMidi(s, f))), `bass box note ${b.name} ${s}/${f}`);
    }));
  }
  for (let i = 1; i < boxes.length; i++) assert(boxes[i].wLo > boxes[i - 1].wLo, "bass boxes ordered");
}
// voicing search still sound on 4 strings
{
  const vE5 = voicings(4, CHORD_FORMULAS.find((f) => f.sym === '5'));
  assert(vE5.some((v) => v.frets.every((f, i) => f === [null, 2, 2, 0][i])), "bass E5 shape");
}
setInstrument('guitar');
// spread triads: three strings, exactly one interior skip, all tones, span<=4
{
  const spreads = spreadTriads(0, CHORD_FORMULAS[0]);
  assert(spreads.length > 0, "spreads exist");
  for (const v of spreads) {
    const sounded = [];
    v.frets.forEach((f, s) => { if (f != null) sounded.push(s); });
    assert(sounded.length === 3 && sounded[2] - sounded[0] === 3, "one skip: " + v.frets);
    const pcs = new Set(sounded.map((s) => mod12(fretMidi(s, v.frets[s]))));
    assert(pcs.has(0) && pcs.has(4) && pcs.has(7), "spread tones: " + v.frets);
    const fr = sounded.map((s) => v.frets[s]).filter((f) => f > 0);
    if (fr.length) assert(Math.max(...fr) - Math.min(...fr) <= 4, "spread span: " + v.frets);
  }
  const names = new Set(spreads.map((v) => v.name));
  assert([...names].every((x) => x === "root position" || x === "3rd in bass" || x === "5th in bass"), "spread names: " + [...names]);
  // 4-note chords get none
  assert(spreadTriads(0, CHORD_FORMULAS.find((f) => f.sym === '7')).length === 0, "no spreads for 7ths");
}

console.log(process.exitCode ? "TESTS FAILED" : "all tests passed");
// closed triads: three adjacent strings, all tones
{
  const closed = closedTriads(0, CHORD_FORMULAS[0]);
  assert(closed.length > 0, "closed triads exist");
  for (const v of closed) {
    const sounded = [];
    v.frets.forEach((f, s) => { if (f != null) sounded.push(s); });
    assert(sounded.length === 3 && sounded[2] - sounded[0] === 2, "adjacent: " + v.frets);
    const pcs = new Set(sounded.map((s) => mod12(fretMidi(s, v.frets[s]))));
    assert(pcs.size === 3, "closed tones: " + v.frets);
  }
  // the classic G-B-e set C major root position: C4 E4 G4 = frets 3,5,5
  assert(closed.some((v) => v.frets.every((f, i) => f === [3, 5, 5, null, null, null][i])), "classic close C found");
}
// sharp/flat spelling preference
assert(spelledName(pcSpelling(6, 'sharp')) === "F♯" && spelledName(pcSpelling(6, 'flat')) === "G♭", "pc6 pref");
assert(spelledName(pcSpelling(1, 'sharp')) === "C♯" && spelledName(pcSpelling(1, 'flat')) === "D♭", "pc1 pref");
assert(spelledName(pcSpelling(10)) === "A♯", "default is sharp");
for (let pc = 0; pc < 12; pc++) {
  for (const pref of ['sharp', 'flat']) {
    const sp = pcSpelling(pc, pref);
    assert(mod12(LETTER_PC[sp.letter] + sp.acc) === pc, `round trip ${pc} ${pref}`);
  }
}
// interval shapes: every model sounds the interval it claims
for (const semis of [1, 4, 5, 7, 12]) {
  const shapes = intervalShapes(semis);
  assert(shapes.length > 0, "shapes exist for " + semis);
  for (const sh of shapes) {
    assert(fretMidi(sh.target.s, sh.target.f) - fretMidi(sh.root.s, sh.root.f) === semis,
      `shape interval ${semis}: ${sh.name}`);
  }
}
// P4 on guitar: general adjacent model is same-fret (offset 0), G–B is +1
{
  const shapes = intervalShapes(5);
  const adj = shapes.find((s) => s.name === 'adjacent');
  assert(adj && adj.target.f - adj.root.f === 0, "P4 adjacent offset");
  const gb = shapes.find((s) => s.name === 'G–B');
  assert(gb && gb.target.f - gb.root.f === 1, "P4 G–B offset");
}
// bass has uniform pairs: no G–B special
setInstrument('bass');
assert(intervalShapes(5).every((s) => !s.name.includes('–') || s.name === 'one string'), "bass shapes uniform: " + intervalShapes(5).map((s) => s.name));
setInstrument('guitar');
