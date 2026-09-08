import fs from "node:fs";
import { gunzipSync } from "node:zlib";

const SOURCE_URL = "https://raw.githubusercontent.com/Occumed79/International-Search/main/data/OccuMed_Command_Center.html";
const OUTPUT = "/tmp/atlas-aux.json";

function clean(v) { return String(v ?? "").replace(/\s+/g, " ").trim(); }

const response = await fetch(SOURCE_URL);
if (!response.ok) throw new Error(`Command Center download failed: ${response.status}`);
let html = await response.text();
const match = html.match(/const\s+AUX_PAYLOAD\s*=\s*"([A-Za-z0-9+/=]+)"\s*;/);
if (!match?.[1]) throw new Error("AUX_PAYLOAD not found");
const encoded = match[1];
html = "";
const aux = JSON.parse(gunzipSync(Buffer.from(encoded, "base64")).toString("utf8"));
if (!Array.isArray(aux.availability) || !Array.isArray(aux.clinics) || !Array.isArray(aux.components) || !Array.isArray(aux.types)) {
  throw new Error("AUX_PAYLOAD malformed");
}
const byExternal = Object.create(null);
for (const record of aux.availability) {
  const clinic = aux.clinics[Number(record[0])] || [];
  const externalId = Number(clinic[0]);
  const component = clean(aux.components[Number(record[1])]);
  const type = clean(aux.types[Number(record[2])]);
  if (!Number.isFinite(externalId) || !component) continue;
  const key = String(externalId);
  (byExternal[key] ||= []).push([component, type]);
}
fs.writeFileSync(OUTPUT, JSON.stringify(byExternal));
console.log(JSON.stringify({ ok: true, availability: aux.availability.length, providersWithAvailability: Object.keys(byExternal).length }));
