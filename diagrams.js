// SVG teaching diagrams for exercises. Authored (no external images).
// Themed for the dark site; strokes/text use light colors.
(function () {
  const INK = "#dbe2ff", MUT = "#9aa6da", ACC = "#8fb0ff", ACC2 = "#b79aff",
        GRN = "#9fd3a3", RED = "#ff8a8a", W = "1.6";
  const svg = (inner, vb = "0 0 220 120") =>
    '<svg viewBox="' + vb + '" xmlns="http://www.w3.org/2000/svg" class="exdiagram" role="img">' + inner + '</svg>';
  const esc = (v) => String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const t = (x, y, s, o = {}) =>
    '<text x="' + x + '" y="' + y + '" fill="' + (o.fill || MUT) + '" font-size="' +
    (o.size || 9) + '" text-anchor="' + (o.anchor || "middle") + '" font-family="system-ui,sans-serif"' +
    (o.weight ? ' font-weight="' + o.weight + '"' : '') + '>' + esc(s) + '</text>';
  const note = (x, y, fill = INK) =>
    '<ellipse cx="' + x + '" cy="' + y + '" rx="5.2" ry="4" fill="' + fill + '" transform="rotate(-20 ' + x + ' ' + y + ')"/>';
  const line = (x1, y1, x2, y2, col = MUT, w = W) =>
    '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="' + col + '" stroke-width="' + w + '"/>';

  const D = {};

  // ---- Overtone / harmonic series on low Bb ----
  (function () {
    const names = ["B♭1", "B♭2", "F3", "B♭3", "D4", "F4", "A♭4", "B♭5"];
    const ys = [96, 84, 74, 66, 58, 52, 47, 42];
    let s = t(110, 13, "Overtone series (one fingering → many pitches)", { fill: INK, size: 9.5, weight: 600 });
    for (let i = 0; i < 5; i++) s += line(18, 44 + i * 12, 208, 44 + i * 12, "#3a4372", 1);
    let arc = '<path d="M28 ' + (ys[0] - 8);
    ys.forEach((y, i) => { const x = 28 + i * 24; arc += ' Q' + (x + 6) + ' ' + (y - 16) + ' ' + (x + 12) + ' ' + (y - 8); });
    for (let i = 0; i < ys.length; i++) {
      const x = 28 + i * 24, y = ys[i];
      if (y > 92 || y < 44) s += line(x - 8, Math.round(y / 12) * 12 - (y > 92 ? 0 : 0), x + 8, Math.round(y / 12) * 12, "#3a4372", 1);
      s += note(x, y);
      s += t(x, y - 9, String(i + 1), { fill: ACC, size: 8, weight: 600 });
      s += t(x, 114, names[i], { size: 7.5 });
    }
    D.overtone = svg(s);
  })();

  // ---- Vowel / tongue positions (ah / ee / oo) ----
  (function () {
    function mouth(cx, label, tongue) {
      // palate arc (top), jaw (bottom), tongue hump path
      let g = '<path d="M' + (cx - 26) + ' 40 Q' + cx + ' 26 ' + (cx + 26) + ' 40" fill="none" stroke="' + MUT + '" stroke-width="1.4"/>';
      g += '<path d="M' + (cx - 26) + ' 78 Q' + cx + ' 90 ' + (cx + 26) + ' 78" fill="none" stroke="' + MUT + '" stroke-width="1.4"/>';
      g += '<path d="' + tongue + '" fill="' + ACC2 + '" opacity="0.55" stroke="' + ACC2 + '" stroke-width="1"/>';
      g += t(cx, 104, label, { fill: INK, size: 10, weight: 600 });
      return g;
    }
    let s = t(110, 13, "Voicing: tongue shapes the vowel", { fill: INK, size: 9.5, weight: 600 });
    // ah: tongue low & flat
    s += mouth(45, '“ah” (low)', "M22 74 Q45 66 68 74 L68 80 Q45 82 22 80 Z");
    // ee: tongue high & front
    s += mouth(110, '“ee” (high)', "M88 74 Q100 48 118 56 Q130 60 132 74 Q110 78 88 80 Z");
    // oo: tongue back, rounded
    s += mouth(175, '“oo” (back)', "M152 74 Q170 74 186 52 Q194 60 190 74 Q175 80 152 80 Z");
    D.vowels = svg(s);
  })();

  // ---- Metronome subdivisions ----
  (function () {
    let s = t(110, 13, "Subdivide the beat", { fill: INK, size: 9.5, weight: 600 });
    const x0 = 22, x1 = 200, rows = [["quarter", 4, ACC], ["eighth", 8, INK], ["triplet", 6, GRN], ["16th", 16, ACC2]];
    // note: triplet row uses 6 (2 beats of triplets) to stay readable
    rows.forEach((r, ri) => {
      const y = 34 + ri * 22, n = r[1];
      s += t(16, y + 3, r[0], { anchor: "end", size: 8 });
      s += line(x0, y, x1, y, "#3a4372", 1);
      for (let i = 0; i <= n; i++) {
        const x = x0 + (x1 - x0) * i / n, big = (ri === 0);
        s += line(x, y - (big ? 7 : 4), x, y + (big ? 7 : 4), r[2], big ? 2 : 1.3);
      }
    });
    D.subdivision = svg(s, "0 0 220 126");
  })();

  // ---- Dynamics: messa di voce hairpin ----
  (function () {
    let s = t(110, 14, "Messa di voce (swell)", { fill: INK, size: 9.5, weight: 600 });
    s += '<path d="M20 60 L110 34 L200 60" fill="none" stroke="' + ACC + '" stroke-width="2"/>';
    s += '<path d="M20 60 L110 86 L200 60" fill="none" stroke="' + ACC + '" stroke-width="2"/>';
    s += t(24, 104, "pp", { fill: GRN, size: 11, weight: 600, anchor: "start" });
    s += t(110, 104, "f", { fill: RED, size: 12, weight: 600 });
    s += t(196, 104, "pp", { fill: GRN, size: 11, weight: 600, anchor: "end" });
    s += t(110, 116, "grow smoothly, then ease back — pitch steady", { size: 7.5 });
    D.dynamics = svg(s);
  })();

  // ---- Vibrato: even pulses ----
  (function () {
    let s = t(110, 14, "Vibrato: even, measured pulses", { fill: INK, size: 9.5, weight: 600 });
    s += line(16, 60, 70, 60, INK, 2);          // straight tone
    let p = '<path d="M70 60';
    for (let i = 0; i < 26; i++) { const x = 70 + i * 5, y = 60 + 14 * Math.sin(i / 2); p += ' L' + x + ' ' + y.toFixed(1); }
    p += '" fill="none" stroke="' + ACC2 + '" stroke-width="2"/>';
    s += p;
    s += t(43, 50, "straight", { size: 7.5 });
    s += t(150, 92, "even width & speed", { size: 7.5 });
    D.vibrato = svg(s);
  })();

  // ---- Breathing: low / diaphragmatic ----
  (function () {
    let s = t(110, 14, "Breathe low (belly expands)", { fill: INK, size: 9.5, weight: 600 });
    // torso
    s += '<path d="M96 26 Q110 22 124 26 L128 92 Q110 100 92 92 Z" fill="none" stroke="' + MUT + '" stroke-width="1.4"/>';
    // chest (small, still)
    s += '<circle cx="110" cy="46" r="8" fill="none" stroke="' + MUT + '" stroke-width="1.2"/>';
    s += t(150, 46, "chest still", { anchor: "start", size: 8 });
    // belly (expands)
    s += '<circle cx="110" cy="74" r="15" fill="' + GRN + '" opacity="0.35" stroke="' + GRN + '" stroke-width="1.4"/>';
    s += '<path d="M132 74 h18 M150 74 l-5 -4 M150 74 l-5 4" stroke="' + GRN + '" stroke-width="1.4" fill="none"/>';
    s += t(150, 78, "belly out", { anchor: "start", size: 8, fill: GRN });
    s += '<path d="M88 74 h-18 M70 74 l5 -4 M70 74 l5 4" stroke="' + GRN + '" stroke-width="1.4" fill="none"/>';
    D.breathing = svg(s);
  })();

  // ---- Scales / evenness ----
  (function () {
    let s = t(110, 13, "Even notes: same length & volume", { fill: INK, size: 9.5, weight: 600 });
    for (let i = 0; i < 5; i++) s += line(18, 40 + i * 11, 208, 40 + i * 11, "#3a4372", 1);
    const ys = [84, 78, 72, 66, 60, 54, 48, 42];
    ys.forEach((y, i) => { const x = 30 + i * 24; s += note(x, y); s += line(x, y, x, 100, "#3a4372", 1); });
    // even tick ruler
    for (let i = 0; i <= 8; i++) { const x = 30 + (i - 0.5) * 24; if (i > 0) s += line(x, 104, x, 110, GRN, 1.4); }
    D.scale = svg(s, "0 0 220 118");
  })();

  // ---- Drone / tuning: beats vs locked ----
  (function () {
    let s = t(110, 14, "Tune to a drone: kill the “beats”", { fill: INK, size: 9.5, weight: 600 });
    s += line(16, 46, 204, 46, MUT, 1.6); s += t(12, 49, "", {});
    s += t(16, 40, "drone", { anchor: "start", size: 8 });
    // out of tune: beating wave (amplitude wobble) on left half
    let p = '<path d="M16 74';
    for (let i = 0; i < 20; i++) { const x = 16 + i * 4.6, a = 10 * Math.abs(Math.sin(i / 6)); const y = 74 + a * Math.sin(i); p += ' L' + x + ' ' + y.toFixed(1); }
    p += '" fill="none" stroke="' + RED + '" stroke-width="1.6"/>';
    s += p;
    // in tune: flat line on right
    s += line(110, 74, 204, 74, GRN, 2);
    s += t(60, 96, "beating (off)", { size: 7.5, fill: RED });
    s += t(158, 96, "locked ✓", { size: 7.5, fill: GRN });
    D.drone = svg(s);
  })();

  // ---- Long tones ----
  (function () {
    let s = t(110, 14, "Long tones: hold steady 8+ beats", { fill: INK, size: 9.5, weight: 600 });
    s += '<rect x="20" y="52" width="180" height="16" rx="8" fill="' + ACC + '" opacity="0.30" stroke="' + ACC + '" stroke-width="1.4"/>';
    s += line(20, 60, 200, 60, ACC, 1.4);
    s += t(110, 84, "same pitch • same volume • same tone", { size: 8 });
    s += t(110, 98, "|———— breath ————|", { size: 8, fill: MUT });
    D.longtone = svg(s);
  })();

  // ---- Bowing (strings) ----
  (function () {
    let s = t(110, 14, "Bowing: even down & up strokes", { fill: INK, size: 9.5, weight: 600 });
    s += line(20, 62, 200, 62, MUT, 2);         // string
    s += '<rect x="60" y="44" width="100" height="6" rx="3" fill="' + ACC2 + '" transform="rotate(-4 110 47)"/>';
    s += '<path d="M40 78 h60 M96 78 l-6 -4 M96 78 l-6 4" stroke="' + GRN + '" stroke-width="1.6" fill="none"/>';
    s += t(70, 92, "down-bow", { size: 8, fill: GRN });
    s += '<path d="M180 92 h-60 M124 92 l6 -4 M124 92 l6 4" stroke="' + ACC + '" stroke-width="1.6" fill="none"/>';
    s += t(150, 106, "up-bow", { size: 8, fill: ACC });
    D.bowing = svg(s, "0 0 220 114");
  })();

  // ---- mapping exercise -> diagram ----
  function diagramFor(name, category) {
    const s = ((name || "") + " " + (category || "")).toLowerCase();
    const has = (...w) => w.some((k) => s.includes(k));
    if (has("overtone", "harmonic", "lip slur", "lip flex", "partial", "flute harmonic")) return D.overtone;
    if (has("vowel", "voicing", "tongue-position", "twang", "nay", "gee")) return D.vowels;
    if (has("vibrato")) return D.vibrato;
    if (has("messa di voce", "crescendo", "decrescendo", "dynamic", "terracing")) return D.dynamics;
    if (has("drone", "tuner", "tuning", "intonation", "fifths")) return D.drone;
    if (has("metronome", "rudiment", "subdivision", "clapping", "tapping", "stroke roll", "paradiddle", "rhythm")) return D.subdivision;
    if (has("breath", "diaphrag", "straw", "sizzle", "air", "circular", "bag", "rmt")) return D.breathing;
    if (has("scale", "arpeggio", "hanon", "czerny", "thirds", "five-finger", "schradieck", "caged", "finger")) return D.scale;
    if (has("bow", "détaché", "detache", "spiccato", "martelé", "martele", "contact point", "shifting")) return D.bowing;
    if (has("long tone", "buzz", "pedal", "humming", "siren", "straw phonation", "sovt", "yawn", "sustain", "tone")) return D.longtone;
    return null;
  }

  window.DIAGRAMS = D;
  window.diagramFor = diagramFor;
})();
