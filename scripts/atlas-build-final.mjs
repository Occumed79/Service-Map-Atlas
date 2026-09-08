import fs from "node:fs";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";

const SOURCE_URL = "https://raw.githubusercontent.com/Occumed79/International-Search/main/data/OccuMed_Command_Center.html";
const AUX_FILE = "/tmp/atlas-aux.json";
const OUTPUT = "/tmp/atlas-final.json";
const EXPECTED = 19771;
const SERVICES = [
  "Dental","Chest X-Ray","B-Reader","Spirometry","Pulmonary Function Testing","Drug Screen","DOT Physical","Audiogram","EKG","Treadmill Stress Test","Laboratory Services","Titers","Vaccinations","Physical Examination","Vision Testing","Occupational Medicine","Specialty Services"
];

function clean(v) { return String(v ?? "").replace(/\s+/g, " ").trim(); }
function split(v) {
  const values = Array.isArray(v) ? v : [v];
  return values.flatMap(x => clean(x).split(/[|,;\n]+/)).map(x => x.trim()).filter(Boolean);
}
function country(v) {
  const raw = clean(v);
  return ["US","USA","UNITED STATES","UNITED STATES OF AMERICA"].includes(raw.toUpperCase()) ? "United States" : raw;
}
function ptype(row) {
  const f = clean(row.ft).toLowerCase();
  if (f.includes("laborat") || f === "lab") return "Lab";
  if (f.includes("imag") || f.includes("radiol")) return "Imaging Center";
  if (f.includes("pharmacy")) return "Pharmacy";
  return "Clinic";
}
function prefix(type) { return type === "Lab" ? "LAB" : type === "Imaging Center" ? "IMG" : type === "Pharmacy" ? "PHARM" : "CLINIC"; }
function anon(row, rawIndex, type) {
  const seed = [rawIndex,clean(row.i),clean(row.n),clean(row.org),clean(row.site),clean(row.a),clean(row.cy),clean(row.rg),country(row.co)].join("|");
  return `${prefix(type)}-${createHash("sha1").update(seed).digest("hex").slice(0,10).toUpperCase()}`;
}
function mapServices(row, explicit) {
  const tags = new Set(split(row.sv));
  const components = explicit.map(x => clean(x[0]));
  const componentTypes = new Set(explicit.map(x => clean(x[1])));
  const lower = components.map(x => x.toLowerCase());
  const facility = clean(row.ft);
  const type = ptype(row);
  const found = new Set();
  if (tags.has("Dental") || componentTypes.has("Dental Examination") || facility === "Dental") found.add("Dental");
  if (lower.some(x => x.includes("chest x-ray"))) found.add("Chest X-Ray");
  if (lower.some(x => x.includes("b-read"))) found.add("B-Reader");
  if (tags.has("PFT / Spirometry") || lower.some(x => x.includes("spirom"))) found.add("Spirometry");
  if (tags.has("PFT / Spirometry") || lower.some(x => x.includes("pulmonary function"))) found.add("Pulmonary Function Testing");
  if (tags.has("Drug Testing") || lower.some(x => x.includes("drug screen"))) found.add("Drug Screen");
  if (lower.some(x => x.includes("dot exam and certificate") || x.includes("dot physical"))) found.add("DOT Physical");
  if (tags.has("Audiology / Hearing") || lower.some(x => x.includes("audiogram"))) found.add("Audiogram");
  if (tags.has("EKG / ECG") || lower.some(x => x.includes("ekg") || x.includes("ecg"))) found.add("EKG");
  if (lower.some(x => x.includes("treadmill stress") || x.includes("exercise treadmill"))) found.add("Treadmill Stress Test");
  const labTerms = ["venipuncture","urinalysis","u/a dipstick","blood draw","complete blood count"," cbc","chemistry","quantiferon","t-spot","hiv","hepatitis","specimen collection","glucose","prostate-specific antigen","psa","abo/rh"];
  if (type === "Lab" || tags.has("Laboratory") || lower.some(x => labTerms.some(term => ` ${x}`.includes(term)))) found.add("Laboratory Services");
  if (lower.some(x => x.includes("titer"))) found.add("Titers");
  if (tags.has("Vaccinations") || lower.some(x => x.includes("vaccination"))) found.add("Vaccinations");
  if (tags.has("Medical / Physical Exam") || componentTypes.has("Medical Examination") || lower.some(x => ["physical examination","physical exam","respirator physical","flight physical","return-to-work physical"].some(term => x.includes(term)))) found.add("Physical Examination");
  if (tags.has("Vision") || lower.some(x => x.includes("vision exam") || x.includes("vision testing"))) found.add("Vision Testing");
  if (facility === "Occupational Medicine") found.add("Occupational Medicine");
  const specialtyTags = new Set(["Respirator Fit Testing","Alcohol Testing","Pap Smear","Mammography","Cardiac Stress Testing","COVID Testing"]);
  const specialtyTerms = ["stress echo","echocardiogram","respirator fit","physical ability test","lift test","mammograph","pap smear","alcohol testing","covid","lexiscan","cardiolite","myocardial perfusion","ultrasound","lumbar spine x-ray","thoracic x-ray"];
  if ([...tags].some(t => specialtyTags.has(t)) || lower.some(x => specialtyTerms.some(term => x.includes(term)))) found.add("Specialty Services");
  return SERVICES.filter(s => found.has(s));
}
function normalizeLocation(row, centroids) {
  let city = clean(row.cy), state = clean(row.rg), co = country(row.co);
  const address = clean(row.a);
  if ((!city || !state) && address) {
    const m = address.match(/,\s*([^,]+),\s*([A-Za-z]{2})\s+\d{4,5}(?:-\d{4})?(?:,|$)/);
    if (m) { city ||= m[1].trim(); state ||= m[2].toUpperCase(); }
  }
  if (city && !state) state = "N/A";
  if (!co && state.toUpperCase() === "PR") co = "Puerto Rico";
  if (!co && city.toLowerCase() === "tamuning") co = "Guam";
  if (!co && /^[A-Za-z]{2}$/.test(state) && state !== "N/A") co = "United States";
  const key = city && state && co ? `${city.toLowerCase()}|${state.toLowerCase()}|${co.toLowerCase()}` : "";
  let point = key ? centroids[key] : null;
  const lat = Number(row.lat), lon = Number(row.lon);
  if (!point && city && state && co && Number.isFinite(lat) && Number.isFinite(lon)) point = [Math.round(lat*10)/10, Math.round(lon*10)/10];
  return city && state && co && point ? [city,state,co,point[0],point[1]] : null;
}

const explicitByExternal = JSON.parse(fs.readFileSync(AUX_FILE,"utf8"));
const response = await fetch(SOURCE_URL);
if (!response.ok) throw new Error(`Command Center download failed: ${response.status}`);
let html = await response.text();
const match = html.match(/const\s+PAYLOAD\s*=\s*"([A-Za-z0-9+/=]+)"\s*;/);
if (!match?.[1]) throw new Error("PAYLOAD not found");
const encoded = match[1];
html = "";
const providers = JSON.parse(gunzipSync(Buffer.from(encoded,"base64")).toString("utf8"));
if (!Array.isArray(providers) || providers.length !== 31026) throw new Error(`Raw provider count ${providers?.length ?? 0} != 31026`);

const sums = Object.create(null);
let nonExpired = 0;
for (const row of providers) {
  if (clean(row.st) === "Expired") continue;
  nonExpired++;
  const city = clean(row.cy);
  let state = clean(row.rg) || "N/A";
  let co = country(row.co);
  if (!co && state.toUpperCase() === "PR") co = "Puerto Rico";
  if (!co && city.toLowerCase() === "tamuning") co = "Guam";
  if (!co && /^[A-Za-z]{2}$/.test(state) && state !== "N/A") co = "United States";
  const lat = Number(row.lat), lon = Number(row.lon);
  if (!city || !co || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
  const key = `${city.toLowerCase()}|${state.toLowerCase()}|${co.toLowerCase()}`;
  const s = sums[key] ||= [0,0,0]; s[0]+=lat; s[1]+=lon; s[2]++;
}
if (nonExpired !== 23544) throw new Error(`Non-expired count ${nonExpired} != 23544`);
const centroids = Object.create(null);
for (const [key,s] of Object.entries(sums)) centroids[key] = [Math.round((s[0]/s[2])*10)/10,Math.round((s[1]/s[2])*10)/10];

const out = [];
for (let i=0;i<providers.length;i++) {
  const row = providers[i];
  if (clean(row.st) === "Expired") continue;
  const externalId = Number(row.i);
  const explicit = Number.isFinite(externalId) ? (explicitByExternal[String(externalId)] || []) : [];
  const services = mapServices(row, explicit);
  if (!services.length) continue;
  const loc = normalizeLocation(row, centroids);
  if (!loc) continue;
  const type = ptype(row);
  const id = anon(row,i,type);
  const tags = split(row.sv);
  const componentNames = [...new Set(explicit.map(x => clean(x[0])).filter(Boolean))];
  const capabilities = [...new Set([...tags,...componentNames])];
  out.push({n:`${type} · ${id}`,t:type,c:loc[0],s:loc[1],o:loc[2],a:loc[3],g:loc[4],v:services,x:componentNames.join("; "),y:capabilities.join("; "),i:`Clinic Type=${type}; Facility Category=${clean(row.ft)}; Coordinate Privacy=generalized city-scale`});
}
if (out.length !== EXPECTED) throw new Error(`Corrected mapped count ${out.length} != ${EXPECTED}`);
if (new Set(out.map(x=>x.n)).size !== EXPECTED) throw new Error("Duplicate anonymous IDs");
fs.writeFileSync(OUTPUT, JSON.stringify(out));
console.log(JSON.stringify({ok:true,raw:providers.length,nonExpired,corrected:out.length}));
