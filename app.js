const API = (window.__API_BASE__ || "").replace(/\/$/, "");
const $ = (id) => document.getElementById(id);

const DETECT = [
  ["Intonation", "flat / sharp notes vs the pros"],
  ["Dynamics", "too loud or too soft"],
  ["Tone", "bright / harsh vs dull / covered"],
  ["Timbre", "breathy / airy vs pressed"],
  ["Tempo", "overall too fast or slow"],
  ["Vibrato", "much wider / narrower or absent"],
];

function setStatus(msg, busy) {
  $("status").textContent = msg || "";
  $("runUpload").disabled = !!busy;
  $("runDemo").disabled = !!busy;
}

async function health() {
  try {
    const r = await fetch(API + "/api/health");
    const d = await r.json();
    $("apihint").textContent = "Analysis API connected · " + d.exercises + " exercises loaded.";
  } catch (e) {
    $("apihint").innerHTML = "⚠ Analysis API not reachable at <code>" + (API || "same origin") +
      "</code>. Set the URL in <code>config.js</code>.";
  }
}

function renderResult(d) {
  $("results").hidden = false;
  $("resTitle").textContent = "Diagnosis — " + d.name;
  const tr = d.tempo_ratio;
  const pill = $("tempoPill");
  if (Math.abs(tr - 1) > 0.05) {
    pill.className = "pill warn";
    pill.textContent = "Tempo: " + Math.round(Math.abs(tr - 1) * 100) + "% " +
      (tr > 1 ? "slower" : "faster") + " than pros";
  } else { pill.className = "pill ok"; pill.textContent = "Tempo: in range"; }

  const fw = $("findings"); fw.innerHTML = "";
  if (!d.findings.length && !d.vibrato_msgs.length) {
    fw.innerHTML = '<div class="finding"><span class="tag">clean</span>' +
      'No sustained problems — inside the professional corridor.</div>';
  }
  d.vibrato_msgs.forEach((m) => {
    fw.insertAdjacentHTML("beforeend",
      '<div class="finding"><span class="tag">vibrato</span>' + m + '</div>');
  });
  d.findings.forEach((f) => {
    const where = f.t0 != null ? (f.t0 + "–" + f.t1 + "s") : (f.pos[0] + "–" + f.pos[1] + "%");
    fw.insertAdjacentHTML("beforeend",
      '<div class="finding"><span class="tag">' + f.category + '</span>' +
      '<span>' + f.label + ' <span class="micro">(' + f.value + ')</span></span>' +
      '<span class="where">' + where + '</span></div>');
  });

  $("plot").src = d.plot;

  const pw = $("plan"); pw.innerHTML = "";
  if (!d.plan.length) { pw.innerHTML = '<p class="micro">No exercises needed — keep maintaining with daily long tones.</p>'; }
  d.plan.forEach((p, i) => {
    let exs = p.exercises.map((e) =>
      '<div class="ex"><div class="exname">' + e.name + '</div>' +
      '<div class="meta">' + e.category + ' · ' + e.difficulty + ' · develops ' + e.develops + '</div>' +
      '<div class="how">' + e.how + '</div></div>').join("");
    pw.insertAdjacentHTML("beforeend",
      '<div class="planitem"><div class="prob">' + (i + 1) + '. ' + p.problem + '</div>' + exs + '</div>');
  });
  $("results").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function runDemo() {
  setStatus("Running the demo analysis…", true);
  try {
    const fd = new FormData();
    fd.append("instrument", $("instrument").value);
    const r = await fetch(API + "/api/demo", { method: "POST", body: fd });
    if (!r.ok) throw new Error("api");
    renderResult(await r.json());
    setStatus("Demo complete.", false);
    return;
  } catch (e) { /* API offline - fall back to a precomputed sample */ }
  try {
    const r = await fetch("./demo_result.json");
    if (!r.ok) throw new Error("sample");
    renderResult(await r.json());
    setStatus("Showing a precomputed sample. Connect the analysis API for live analysis of your own recordings.", false);
  } catch (e) { setStatus("Demo unavailable.", false); }
}

let proFiles = [];
function renderProList() {
  const ul = $("proList");
  ul.innerHTML = proFiles.map((f, i) =>
    '<li><span>' + f.name + '</span><button data-i="' + i + '" title="remove">x</button></li>').join("");
  ul.querySelectorAll("button").forEach((b) =>
    b.onclick = () => { proFiles.splice(+b.dataset.i, 1); renderProList(); });
}
$("pros").addEventListener("change", (e) => {
  for (const f of e.target.files) {
    if (!proFiles.some((p) => p.name === f.name && p.size === f.size)) proFiles.push(f);
  }
  e.target.value = "";
  renderProList();
});

async function runUpload() {
  const stu = $("student").files[0];
  const pros = proFiles;
  if (!stu) return setStatus("Choose your recording first.", false);
  if (pros.length < 2) return setStatus("Add at least 2 professional reference recordings (you have " + pros.length + ").", false);
  setStatus("Uploading and analysing… (large files take a moment)", true);
  try {
    const fd = new FormData();
    fd.append("student", stu);
    for (const p of pros) fd.append("pros", p);
    fd.append("instrument", $("instrument").value);
    const r = await fetch(API + "/api/analyze", { method: "POST", body: fd });
    if (!r.ok) throw new Error(await r.text());
    renderResult(await r.json());
    setStatus("Analysis complete.", false);
  } catch (e) { setStatus("Analysis failed: " + e.message, false); }
}

let EXDB = null, activeCat = "All";
function renderChips() {
  $("detectChips").innerHTML = DETECT.map((d) =>
    '<span class="chip"><b>' + d[0] + '</b> — ' + d[1] + '</span>').join("");
}
function renderExercises() {
  if (!EXDB) return;
  const cats = ["All", ...Object.keys(EXDB.categories)];
  $("catFilters").innerHTML = cats.map((c) =>
    '<button class="fbtn' + (c === activeCat ? " active" : "") + '" data-c="' + c + '">' + c + '</button>').join("");
  $("catFilters").querySelectorAll(".fbtn").forEach((b) =>
    b.onclick = () => { activeCat = b.dataset.c; renderExercises(); });
  const list = EXDB.exercises.filter((e) => activeCat === "All" || e.category === activeCat);
  $("exGrid").innerHTML = list.map((e) =>
    '<div class="excard"><span class="diff">' + e.difficulty + '</span>' +
    '<div class="cat">' + e.category + '</div><h4>' + e.exercise + '</h4>' +
    '<p>' + e.how + '</p></div>').join("");
}
async function loadExercises() {
  const sources = [API + "/api/exercises", "./exercise_database.json"];
  for (const url of sources) {
    try {
      const r = await fetch(url);
      if (!r.ok) continue;
      EXDB = await r.json();
      renderExercises();
      return;
    } catch (e) { /* try next source */ }
  }
  $("exGrid").innerHTML = '<p class="micro">Exercise library unavailable.</p>';
}

$("runDemo").onclick = runDemo;
$("runUpload").onclick = runUpload;
renderChips();
health();
loadExercises();
