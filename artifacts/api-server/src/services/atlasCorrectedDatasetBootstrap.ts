import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { pool } from "@workspace/db";
import { logger } from "../lib/logger";

const EXPECTED_COUNT = 19_771;
const EXPECTED_UNMAPPED = 3_759;
const EXPECTED_MISSING_LOCATION = 14;
const DATASET_KEY = "atlas-corrected-command-center-2026-09-08-v2";
const COMMAND_CENTER_URL = "https://raw.githubusercontent.com/Occumed79/International-Search/main/data/OccuMed_Command_Center.html";
const BATCH_SIZE = 500;

const SERVICE_NAMES = [
  "Dental",
  "Chest X-Ray",
  "B-Reader",
  "Spirometry",
  "Pulmonary Function Testing",
  "Drug Screen",
  "DOT Physical",
  "Audiogram",
  "EKG",
  "Treadmill Stress Test",
  "Laboratory Services",
  "Titers",
  "Vaccinations",
  "Physical Examination",
  "Vision Testing",
  "Occupational Medicine",
  "Specialty Services",
] as const;

type RawProvider = Record<string, unknown>;
type AuxSnapshot = {
  clinics: unknown[][];
  components: string[];
  types: string[];
  availability: unknown[][];
};

type ProviderRecord = {
  name: string;
  city: string;
  state: string;
  country: string;
  latitude: number;
  longitude: number;
  availabilityNotes: string;
  coverageNotes: string;
  internalTags: string;
  services: string[];
};

type CapabilityEvidence = { components: Set<string>; types: Set<string> };

type SqlClient = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: unknown[] }>;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeCountry(value: unknown) {
  const raw = clean(value);
  return ["US", "USA", "UNITED STATES", "UNITED STATES OF AMERICA"].includes(raw.toUpperCase())
    ? "United States"
    : raw;
}

function extractEmbeddedJson<T>(html: string, variableName: "PAYLOAD" | "AUX_PAYLOAD"): T {
  const match = html.match(new RegExp(`const\\s+${variableName}\\s*=\\s*"([A-Za-z0-9+/=]+)"\\s*;`));
  if (!match?.[1]) throw new Error(`Could not locate ${variableName} in Command Center source.`);
  return JSON.parse(gunzipSync(Buffer.from(match[1], "base64")).toString("utf8")) as T;
}

function classifyProviderType(facilityType: string) {
  const lower = facilityType.toLowerCase();
  if (lower.includes("laborator")) return "Lab";
  if (lower.includes("imaging") || lower.includes("radiology")) return "Imaging Center";
  if (lower.includes("pharmacy")) return "Pharmacy";
  return "Clinic";
}

function fullAddress(provider: RawProvider) {
  const address = clean(provider.a);
  const address2 = clean(provider.a2);
  const city = clean(provider.cy);
  const state = clean(provider.rg);
  const postal = clean(provider.z);
  const country = normalizeCountry(provider.co);
  const parts = [address, address2, city, [state, postal].filter(Boolean).join(" "), country].filter(Boolean);
  return parts.join(", ");
}

function recoverCityState(address: string) {
  const match = address.match(/,\s*([^,]+),\s*([A-Za-z]{2})\s+\d{4,5}(?:-\d{4})?(?:,|$)/);
  return match ? { city: match[1].trim(), state: match[2].toUpperCase() } : { city: "", state: "" };
}

function roundedCityCoordinate(value: number) {
  return Number(value.toFixed(1));
}

function documentedTags(provider: RawProvider) {
  const value = provider.sv;
  if (Array.isArray(value)) return new Set(value.map(clean).filter(Boolean));
  return new Set(clean(value).split(/[|,;\n]+/).map((item) => item.trim()).filter(Boolean));
}

function buildCapabilityEvidence(aux: AuxSnapshot) {
  const byExternalId = new Map<number, CapabilityEvidence>();
  for (const record of aux.availability) {
    const clinicIndex = Number(record?.[0]);
    const componentIndex = Number(record?.[1]);
    const typeIndex = Number(record?.[2]);
    const clinic = aux.clinics[clinicIndex] ?? [];
    const externalId = finiteNumber(clinic[0]);
    if (externalId === null) continue;
    const component = clean(aux.components[componentIndex]);
    const type = clean(aux.types[typeIndex]);
    const evidence = byExternalId.get(externalId) ?? { components: new Set<string>(), types: new Set<string>() };
    if (component) evidence.components.add(component);
    if (type) evidence.types.add(type);
    byExternalId.set(externalId, evidence);
  }
  return byExternalId;
}

function mappedServices(provider: RawProvider, evidence: CapabilityEvidence | undefined, clinicType: string) {
  const tags = documentedTags(provider);
  const components = [...(evidence?.components ?? [])].sort();
  const componentTypes = evidence?.types ?? new Set<string>();
  const facility = clean(provider.ft);
  const lowerComponents = components.map((item) => item.toLowerCase());
  const found = new Set<string>();

  if (tags.has("Dental") || componentTypes.has("Dental Examination") || facility === "Dental") found.add("Dental");
  if (lowerComponents.some((item) => item.includes("chest x-ray"))) found.add("Chest X-Ray");
  if (lowerComponents.some((item) => item.includes("b-read"))) found.add("B-Reader");
  if (tags.has("PFT / Spirometry") || lowerComponents.some((item) => item.includes("spirom"))) found.add("Spirometry");
  if (tags.has("PFT / Spirometry") || lowerComponents.some((item) => item.includes("pulmonary function"))) found.add("Pulmonary Function Testing");
  if (tags.has("Drug Testing") || lowerComponents.some((item) => item.includes("drug screen"))) found.add("Drug Screen");
  if (lowerComponents.some((item) => item.includes("dot exam and certificate") || item.includes("dot physical"))) found.add("DOT Physical");
  if (tags.has("Audiology / Hearing") || lowerComponents.some((item) => item.includes("audiogram"))) found.add("Audiogram");
  if (tags.has("EKG / ECG") || lowerComponents.some((item) => item.includes("ekg") || item.includes("ecg"))) found.add("EKG");
  if (lowerComponents.some((item) => item.includes("treadmill stress") || item.includes("exercise treadmill"))) found.add("Treadmill Stress Test");

  const labTerms = [
    "venipuncture", "urinalysis", "u/a dipstick", "blood draw", "complete blood count", " cbc",
    "chemistry", "quantiferon", "t-spot", "hiv", "hepatitis", "specimen collection", "glucose",
    "prostate-specific antigen", "psa", "abo/rh",
  ];
  if (
    clinicType === "Lab" || tags.has("Laboratory") ||
    lowerComponents.some((item) => labTerms.some((term) => ` ${item}`.includes(term)))
  ) found.add("Laboratory Services");

  if (lowerComponents.some((item) => item.includes("titer"))) found.add("Titers");
  if (tags.has("Vaccinations") || lowerComponents.some((item) => item.includes("vaccination"))) found.add("Vaccinations");
  if (
    tags.has("Medical / Physical Exam") || componentTypes.has("Medical Examination") ||
    lowerComponents.some((item) => ["physical examination", "physical exam", "respirator physical", "flight physical", "return-to-work physical"].some((term) => item.includes(term)))
  ) found.add("Physical Examination");
  if (tags.has("Vision") || lowerComponents.some((item) => item.includes("vision exam") || item.includes("vision testing"))) found.add("Vision Testing");
  if (facility === "Occupational Medicine") found.add("Occupational Medicine");

  const specialtyTags = new Set(["Respirator Fit Testing", "Alcohol Testing", "Pap Smear", "Mammography", "Cardiac Stress Testing", "COVID Testing"]);
  const specialtyTerms = [
    "stress echo", "echocardiogram", "respirator fit", "physical ability test", "lift test", "mammograph",
    "pap smear", "alcohol testing", "covid", "lexiscan", "cardiolite", "myocardial perfusion", "ultrasound",
    "lumbar spine x-ray", "thoracic x-ray",
  ];
  if (
    [...tags].some((tag) => specialtyTags.has(tag)) ||
    lowerComponents.some((item) => specialtyTerms.some((term) => item.includes(term)))
  ) found.add("Specialty Services");

  return {
    services: SERVICE_NAMES.filter((name) => found.has(name)),
    tags: [...tags].sort(),
    components,
  };
}

function anonymousName(provider: RawProvider, clinicType: string) {
  const prefix = clinicType === "Lab" ? "LAB" : clinicType === "Imaging Center" ? "IMG" : clinicType === "Pharmacy" ? "PHARM" : "CLINIC";
  const seed = `${clean(provider.i)}|${clean(provider.source_status)}|${clinicType}`;
  const token = createHash("sha256").update(seed).digest("hex").slice(0, 10).toUpperCase();
  return `${clinicType} · ${prefix}-${token}`;
}

function buildCorrectedProviders(rawProviders: RawProvider[], aux: AuxSnapshot) {
  const providers = rawProviders.filter((provider) => clean(provider.st) !== "Expired");
  const evidenceByExternalId = buildCapabilityEvidence(aux);
  const centroidPoints = new Map<string, Array<[number, number]>>();

  for (const provider of providers) {
    const city = clean(provider.cy);
    const state = clean(provider.rg) || "N/A";
    let country = normalizeCountry(provider.co);
    if (!country && /^[A-Za-z]{2}$/.test(state) && state !== "N/A") country = "United States";
    const latitude = finiteNumber(provider.lat);
    const longitude = finiteNumber(provider.lon);
    if (!city || !country || latitude === null || longitude === null) continue;
    const key = `${city.toLowerCase()}|${state.toLowerCase()}|${country.toLowerCase()}`;
    const points = centroidPoints.get(key) ?? [];
    points.push([latitude, longitude]);
    centroidPoints.set(key, points);
  }

  const centroids = new Map<string, [number, number]>();
  for (const [key, points] of centroidPoints) {
    const latitude = points.reduce((sum, point) => sum + point[0], 0) / points.length;
    const longitude = points.reduce((sum, point) => sum + point[1], 0) / points.length;
    centroids.set(key, [roundedCityCoordinate(latitude), roundedCityCoordinate(longitude)]);
  }

  const corrected: ProviderRecord[] = [];
  let unmapped = 0;
  let missingLocation = 0;

  for (const provider of providers) {
    let city = clean(provider.cy);
    let state = clean(provider.rg);
    let country = normalizeCountry(provider.co);
    const address = fullAddress(provider);
    if ((!city || !state) && address) {
      const recovered = recoverCityState(address);
      city ||= recovered.city;
      state ||= recovered.state;
    }
    if (city && !state) state = "N/A";
    if (!country && state && /^[A-Za-z]{2}$/.test(state) && state !== "N/A") country = "United States";
    if (!country && state.toUpperCase() === "PR") country = "Puerto Rico";
    if (!country && address.includes("Tamuning")) country = "Guam";

    let point: [number, number] | undefined;
    if (city && state && country) {
      const key = `${city.toLowerCase()}|${state.toLowerCase()}|${country.toLowerCase()}`;
      point = centroids.get(key);
      if (!point) {
        const latitude = finiteNumber(provider.lat);
        const longitude = finiteNumber(provider.lon);
        if (latitude !== null && longitude !== null) point = [roundedCityCoordinate(latitude), roundedCityCoordinate(longitude)];
      }
    }
    if (!city || !state || !country || !point) {
      missingLocation += 1;
      continue;
    }

    const clinicType = classifyProviderType(clean(provider.ft));
    const externalId = finiteNumber(provider.i);
    const evidence = externalId === null ? undefined : evidenceByExternalId.get(externalId);
    const mapped = mappedServices(provider, evidence, clinicType);
    if (!mapped.services.length) {
      unmapped += 1;
      continue;
    }

    const allCapabilities = [...new Set([...mapped.tags, ...mapped.components])].sort();
    corrected.push({
      name: anonymousName(provider, clinicType),
      city,
      state,
      country,
      latitude: point[0],
      longitude: point[1],
      availabilityNotes: mapped.components.join("; "),
      coverageNotes: allCapabilities.join("; "),
      internalTags: `Clinic Type=${clinicType}; Facility Category=${clean(provider.ft)}; Coordinate Privacy=generalized city-scale`,
      services: mapped.services,
    });
  }

  if (corrected.length !== EXPECTED_COUNT || unmapped !== EXPECTED_UNMAPPED || missingLocation !== EXPECTED_MISSING_LOCATION) {
    throw new Error(`Command Center normalization mismatch: mapped=${corrected.length}/${EXPECTED_COUNT}, unmapped=${unmapped}/${EXPECTED_UNMAPPED}, missing=${missingLocation}/${EXPECTED_MISSING_LOCATION}.`);
  }
  return corrected;
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function importEnabled() {
  return process.env.ATLAS_COMMAND_CENTER_BOOTSTRAP === "1" && Boolean(process.env.NEON_API_KEY && process.env.ATLAS_EXPECTED_ENDPOINT);
}

async function verifyTarget() {
  const databaseUrl = process.env.DATABASE_URL;
  const apiKey = process.env.NEON_API_KEY;
  const expectedEndpoint = process.env.ATLAS_EXPECTED_ENDPOINT;
  if (!databaseUrl || !apiKey || !expectedEndpoint) throw new Error("Corrected Atlas import target verification is not configured.");

  const hostname = new URL(databaseUrl).hostname;
  if (!hostname.startsWith(`${expectedEndpoint}.`) && !hostname.startsWith(`${expectedEndpoint}-pooler.`)) {
    throw new Error(`Refusing corrected Atlas import: DATABASE_URL host ${hostname} does not match ${expectedEndpoint}.`);
  }

  const headers = { Authorization: `Bearer ${apiKey}` };
  const projectsResponse = await fetch("https://console.neon.tech/api/v2/projects?limit=100", { headers });
  if (!projectsResponse.ok) throw new Error(`Neon project verification failed with HTTP ${projectsResponse.status}.`);
  const projectPayload = (await projectsResponse.json()) as { projects?: Array<{ id: string; name: string }> };
  const project = projectPayload.projects?.find((item) => item.name === "Service-Map-Atlas");
  if (!project) throw new Error("Neon API key cannot see the Service-Map-Atlas project.");

  const endpointsResponse = await fetch(`https://console.neon.tech/api/v2/projects/${encodeURIComponent(project.id)}/endpoints`, { headers });
  if (!endpointsResponse.ok) throw new Error(`Neon endpoint verification failed with HTTP ${endpointsResponse.status}.`);
  const endpointPayload = (await endpointsResponse.json()) as { endpoints?: Array<{ id: string }> };
  if (!endpointPayload.endpoints?.some((endpoint) => endpoint.id === expectedEndpoint)) {
    throw new Error(`Service-Map-Atlas project does not expose expected production endpoint ${expectedEndpoint}.`);
  }
  logger.info({ projectId: project.id, endpointId: expectedEndpoint }, "Verified corrected Atlas import target");
}

async function loadCorrectedProviders() {
  const response = await fetch(COMMAND_CENTER_URL);
  if (!response.ok) throw new Error(`Command Center download failed with HTTP ${response.status}.`);
  const html = await response.text();
  const rawProviders = extractEmbeddedJson<RawProvider[]>(html, "PAYLOAD");
  const aux = extractEmbeddedJson<AuxSnapshot>(html, "AUX_PAYLOAD");
  if (!Array.isArray(rawProviders) || rawProviders.length !== 31_026) {
    throw new Error(`Unexpected Command Center provider count: ${Array.isArray(rawProviders) ? rawProviders.length : 0}.`);
  }
  return buildCorrectedProviders(rawProviders, aux);
}

async function ensureServiceCategories(client: SqlClient) {
  const existing = (await client.query(`SELECT id, name FROM service_categories WHERE name = ANY($1::text[])`, [SERVICE_NAMES])) as {
    rows: Array<{ id: number; name: string }>;
  };
  const byName = new Map<string, number>(existing.rows.map((row) => [row.name, row.id]));
  for (const name of SERVICE_NAMES) {
    if (byName.has(name)) continue;
    const result = (await client.query(
      `INSERT INTO service_categories (name, slug) VALUES ($1, $2)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
      [name, slugify(name)],
    )) as { rows: Array<{ id: number }> };
    byName.set(name, result.rows[0].id);
  }
  return byName;
}

function generatedNameSql(column = "name") {
  return `(
    ${column} ~ '^(CLINIC|LAB|IMG|PHARM)-[A-F0-9]{10}$'
    OR ${column} ~ '^(Clinic|Lab|Imaging Center|Pharmacy) · (CLINIC|LAB|IMG|PHARM)-[A-F0-9]{10}$'
  )`;
}

export async function runCorrectedAtlasDatasetBootstrap() {
  if (!importEnabled()) return;
  await verifyTarget();
  const providers = await loadCorrectedProviders();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(`CREATE TABLE IF NOT EXISTS atlas_dataset_state (
      dataset_key TEXT PRIMARY KEY,
      provider_count INTEGER NOT NULL,
      imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);

    const state = await client.query<{ provider_count: number }>(`SELECT provider_count FROM atlas_dataset_state WHERE dataset_key = $1`, [DATASET_KEY]);
    if (Number(state.rows[0]?.provider_count) === EXPECTED_COUNT) {
      const existing = await client.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM service_locations WHERE ${generatedNameSql()}`);
      if (Number(existing.rows[0]?.count) === EXPECTED_COUNT) {
        await client.query("ROLLBACK");
        logger.info({ providerCount: EXPECTED_COUNT }, "Corrected Atlas dataset already present; bootstrap skipped");
        return;
      }
    }

    const categories = await ensureServiceCategories(client as unknown as SqlClient);
    const deleted = await client.query<{ id: number }>(`DELETE FROM service_locations WHERE ${generatedNameSql()} RETURNING id`);
    let inserted = 0;
    let serviceLinks = 0;

    for (let start = 0; start < providers.length; start += BATCH_SIZE) {
      const batch = providers.slice(start, start + BATCH_SIZE);
      const values: unknown[] = [];
      const tuples = batch.map((provider) => {
        const base = values.length;
        values.push(provider.name, "", provider.city, provider.state, provider.country, provider.latitude, provider.longitude,
          provider.availabilityNotes || null, provider.coverageNotes || null, provider.internalTags || null, true);
        return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9},$${base + 10},$${base + 11})`;
      });
      const created = await client.query<{ id: number; name: string }>(
        `INSERT INTO service_locations
          (name, address, city, state, country, latitude, longitude, availability_notes, coverage_notes, internal_tags, active)
         VALUES ${tuples.join(",")} RETURNING id, name`, values,
      );
      inserted += created.rows.length;
      const idByName = new Map(created.rows.map((row) => [row.name, row.id]));
      const linkValues: unknown[] = [];
      const linkTuples: string[] = [];
      for (const provider of batch) {
        const locationId = idByName.get(provider.name);
        if (!locationId) throw new Error(`Could not resolve inserted location ${provider.name}.`);
        for (const service of provider.services) {
          const categoryId = categories.get(service);
          if (!categoryId) throw new Error(`Could not resolve Atlas service category ${service}.`);
          const base = linkValues.length;
          linkValues.push(locationId, categoryId);
          linkTuples.push(`($${base + 1},$${base + 2})`);
        }
      }
      if (linkTuples.length) {
        await client.query(`INSERT INTO location_services (location_id, category_id) VALUES ${linkTuples.join(",")}`, linkValues);
        serviceLinks += linkTuples.length;
      }
      if (inserted % 5_000 === 0 || inserted === EXPECTED_COUNT) {
        logger.info({ inserted, expected: EXPECTED_COUNT }, "Corrected Atlas dataset import progress");
      }
    }

    const verified = await client.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM service_locations WHERE ${generatedNameSql()}`);
    const verifiedCount = Number(verified.rows[0]?.count);
    if (inserted !== EXPECTED_COUNT || verifiedCount !== EXPECTED_COUNT) {
      throw new Error(`Corrected Atlas provider verification failed: inserted=${inserted}, database=${verifiedCount}, expected=${EXPECTED_COUNT}.`);
    }

    await client.query(
      `INSERT INTO atlas_dataset_state (dataset_key, provider_count, imported_at) VALUES ($1, $2, NOW())
       ON CONFLICT (dataset_key) DO UPDATE SET provider_count = EXCLUDED.provider_count, imported_at = EXCLUDED.imported_at`,
      [DATASET_KEY, EXPECTED_COUNT],
    );
    await client.query("COMMIT");
    logger.info({ deletedPriorGeneratedProviders: deleted.rows.length, importedProviders: inserted, serviceLinks }, "Corrected Atlas dataset import complete");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
