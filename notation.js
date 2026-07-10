// Engraved music notation for note-chart exercises, via VexFlow (MIT).
// We generate the notation ourselves, so there are no image-licensing issues.
// Renders onto a light "paper" card so the black engraving reads clearly.
(function () {
  // ---- which exercises deserve real notation (vs a schematic SVG) ----
  function notationKind(name, category) {
    const s = ((name || "") + " " + (category || "")).toLowerCase();
    const has = (...w) => w.some((k) => s.includes(k));
    // Concepts that are really about breath / dynamics keep their schematic diagram,
    // even if the exercise name also mentions scales or intervals.
    if (has("breath", "diaphrag", "straw", "terracing", "dynamic terrac")) return null;
    if (has("chromatic")) return "chromatic";
    if (has("thirds", "in thirds", "broken thirds", "interval")) return "thirds";
    if (has("overtone", "lip slur", "lip flex", "lip-flex", "partial", "flute harmonic", "bugle"))
      return "overtone";
    if (s.includes("harmonic") && !s.includes("scale") && !s.includes("minor")) return "overtone";
    if (has("scale", "arpeggio", "hanon", "czerny", "five-finger", "five finger",
            "schradieck", "caged", "major", "minor", "mode", "pentatonic"))
      return "scale";
    return null;
  }

  // ---- notation content per kind: [clef, list-of-key-groups, optional numbers, height] ----
  const CH = {
    overtone: {
      clef: "bass", h: 132,
      keys: [["bb/1"], ["bb/2"], ["f/3"], ["bb/3"], ["d/4"], ["f/4"], ["ab/4"], ["bb/4"]],
      nums: [1, 2, 3, 4, 5, 6, 7, 8],
    },
    scale: {
      clef: "treble", h: 116,
      keys: [["c/4"], ["d/4"], ["e/4"], ["f/4"], ["g/4"], ["a/4"], ["b/4"], ["c/5"]],
    },
    thirds: {
      clef: "treble", h: 116,
      keys: [["c/4", "e/4"], ["d/4", "f/4"], ["e/4", "g/4"], ["f/4", "a/4"],
             ["g/4", "b/4"], ["a/4", "c/5"]],
    },
    chromatic: {
      clef: "treble", h: 116,
      keys: [["c/4"], ["c#/4"], ["d/4"], ["d#/4"], ["e/4"], ["f/4"], ["f#/4"], ["g/4"]],
    },
  };

  function drawOne(el, kind) {
    if (!window.Vex || !window.Vex.Flow) return false;
    const spec = CH[kind];
    if (!spec) return false;
    const VF = Vex.Flow;
    const W = Math.max(200, el.clientWidth || 260), H = spec.h;
    el.innerHTML = "";
    const r = new VF.Renderer(el, VF.Renderer.Backends.SVG);
    r.resize(W, H);
    const ctx = r.getContext();
    const stave = new VF.Stave(2, 14, W - 8);
    stave.addClef(spec.clef);
    stave.setContext(ctx).draw();
    const notes = spec.keys.map((keys, i) => {
      const n = new VF.StaveNote({ clef: spec.clef, keys: keys, duration: "q" });
      keys.forEach((k, ki) => {
        if (k[1] === "b") n.addModifier(new VF.Accidental("b"), ki);
        else if (k[1] === "#") n.addModifier(new VF.Accidental("#"), ki);
      });
      if (spec.nums) {
        const a = new VF.Annotation(String(spec.nums[i]));
        a.setVerticalJustification(VF.Annotation.VerticalJustify.TOP);
        n.addModifier(a, 0);
      }
      return n;
    });
    VF.Formatter.FormatAndDraw(ctx, stave, notes);
    const svg = el.querySelector("svg");
    if (svg) { svg.style.width = "100%"; svg.style.height = "auto"; svg.removeAttribute("height"); }
    el.setAttribute("data-done", "1");
    return true;
  }

  // Render any not-yet-drawn notation placeholders inside `root`.
  function renderNotation(root) {
    const scope = root || document;
    const els = scope.querySelectorAll(".vfwrap[data-vf]:not([data-done])");
    els.forEach((el) => drawOne(el, el.getAttribute("data-vf")));
  }

  window.notationKind = notationKind;
  window.renderNotation = renderNotation;
})();
