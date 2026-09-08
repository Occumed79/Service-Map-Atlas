import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import type { PoolClient } from "pg";
import { pool } from "@workspace/db";
import { logger } from "../lib/logger";

const EXPECTED_COUNT = 19_771;
const DATASET_KEY = "atlas-corrected-source-19771-2026-09-08-v1";
const SOURCE_URL = "https://raw.githubusercontent.com/Occumed79/International-Search/main/data/OccuMed_Command_Center.html";
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

type ServiceName = (typeof SERVICE_NAMES)[number];
type Row = Record<string, unknown>;
type AuxSnapshot = {
  clinics: unknown[][];
  components: string[];
  types: string[];
  prices: unknown[][];
  availability: unknown[][];
};

type ProviderType = "Clinic" | "Lab" | "Imaging Center" | "Pharmacy";
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
  services: ServiceName[];
};

function clean(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function splitTags(value: unknown) {
  const values = Array.isArray(value) ? value : [value];
  return values
    .flatMap((item) => clean(item).split(/[|,;\n]+/))
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeCountry(value: unknown) {
  const raw = clean(value);
  if (["US", "USA", "UNITED STATES", "UNITED STATES OF AMERICA"].includes(raw.toUpperCase())) {
    return "United States";
  }
  return raw;
}

function extractEmbeddedJson<T>(html: string, variableName: "PAYLOAD" | "AUX_PAYLOAD"): T {
  const match = html.match(new RegExp(`const\\s+${variableName}\\s*=\\s*"([A-Za-z0-9+/=]+)"\\s*;`));
  if (!match?.[1]) throw new Error(`Could not locate ${variableName} in Command Center source.`);
  return JSON.parse(gunzipSync(Buffer.from(match[1], "base64")).toString("utf8")) as T;
}

function providerType(row: Row): ProviderType {
  const facility = clean(row.ft).toLowerCase();
  if (facility.includes("laborat") || facility === "lab") return "Lab";
  if (facility.includes("imag") || facility.includes("radiol")) return "Imaging Center";
  if (facility.includes("pharmacy")) return "Pharmacy";
  return "Clinic";
}

function prefixFor(type: ProviderType) {
  if (type === "Lab") return "LAB";
  if (type === "Imaging Center") return "IMG";
  if (type === "Pharmacy") return "PHARM";
  return "CLINIC";
}

function anonymousId(row: Row, index: number, type: ProviderType) {
  const seed = [
    index,
    clean(row.i),
    clean(row.n),
    clean(row.org),
    clean(row.site),
    clean(row.a),
    clean(row.cy),
    clean(row.rg),
    normalizeCountry(row.co),
  ].join("|");
  const hash = createHash("sha1").update(seed).digest("hex").slice(0, 10).toUpperCase();
  return `${prefixFor(type)}-${hash}`;
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function generatedProviderPredicate(column = "name") {
  return `(
    ${column} ~ '^(CLINIC|LAB|IMG|PHARM)-[A-F0-9]{10}$'
    OR ${column} ~ '^(Clinic|Lab|Imaging Center|Pharmacy) · (CLINIC|LAB|IMG|PHARM)-[A-F0-9]{10}$'
  )`;
}

function mappedServices(row: Row, explicit: Array<{ component: string; type: string }>): ServiceName[] {
  const tags = new Set(splitTags(row.sv));
  const components = explicit.map((item) => item.component);
  const componentTypes = new Set(explicit.map((item) => item.type));
  const lower = components.map((item) => item.toLowerCase());
  const facility = clean(row.ft);
  const type = providerType(row);
  const found = new Set<ServiceName>();

  if (tags.has("Dental") || componentTypes.has("Dental Examination") || facility === "Dental") found.add("Dental");
  if (lower.some((item) => item.includes("chest x-ray"))) found.add("Chest X-Ray");
  if (lower.some((item) => item.includes("b-read"))) found.add("B-Reader");
  if (tags.has("PFT / Spirometry") || lower.some((item) => item.includes("spirom"))) found.add("Spirometry");
  if (tags.has("PFT / Spirometry") || lower.some((item) => item.includes("pulmonary function"))) found.add("Pulmonary Function Testing");
  if (tags.has("Drug Testing") || lower.some((item) => item.includes("drug screen"))) found.add("Drug Screen");
  if (lower.some((item) => item.includes("dot exam and certificate") || item.includes("dot physical"))) found.add("DOT Physical");
  if (tags.has("Audiology / Hearing") || lower.some((item) => item.includes("audiogram"))) found.add("Audiogram");
  if (tags.has("EKG / ECG") || lower.some((item) => item.includes("ekg") || item.includes("ecg"))) found.add("EKG");
  if (lower.some((item) => item.includes("treadmill stress") || item.includes("exercise treadmill"))) found.add("Treadmill Stress Test");

  const laboratoryTerms = [
    "venipuncture", "urinalysis", "u/a dipstick", "blood draw", "complete blood count", " cbc",
    "chemistry", "quantiferon", "t-spot", "hiv", "hepatitis", "specimen collection", "glucose",
    "prostate-specific antigen", "psa", "abo/rh",
  ];
  if (
    type === "Lab" ||
    tags.has("Laboratory") ||
    lower.some((item) => laboratoryTerms.some((term) => ` ${item}`.includes(term)))
  ) found.add("Laboratory Services");

  if (lower.some((item) => item.includes("titer"))) found.add("Titers");
  if (tags.has("Vaccinations") || lower.some((item) => item.includes("vaccination"))) found.add("Vaccinations");
  if (
    tags.has("Medical / Physical Exam") ||
    componentTypes.has("Medical Examination") ||
    lower.some((item) => ["physical examination", "physical exam", "respirator physical", "flight physical", "return-to-work physical"].some((term) => item.includes(term)))
  ) found.add("Physical Examination");
  if (tags.has("Vision") || lower.some((item) => item.includes("vision exam") || item.includes("vision testing"))) found.add("Vision Testing");
  if (facility === "Occupational Medicine") found.add("Occupational Medicine");

  const specialtyTags = new Set(["Respirator Fit Testing", "Alcohol Testing", "Pap Smear", "Mammography", "Cardiac Stress Testing", "COVID Testing"]);
  const specialtyTerms = [
    "stress echo", "echocardiogram", "respirator fit", "physical ability test", "lift test", "mammograph",
    "pap smear", "alcohol testing", "covid", "lexiscan", "cardiolite", "myocardial perfusion",
    "ultrasound", "lumbar spine x-ray", "thoracic x-ray",
  ];
  if ([...tags].some((tag) => specialtyTags.has(tag)) || lower.some((item) => specialtyTerms.some((term) => item.includes(term)))) {
    found.add("Specialty Services");
  }

  return SERVICE_NAMES.filter((name) => found.has(name));
}

async function verifyTarget() {
  if (process.env.APP_MODE !== "admin" || process.env.ATLAS_SOURCE_BOOTSTRAP !== "1") return false;
  const databaseUrl = process.env.DATABASE_URL;
  const apiKey = process.env.NEON_API_KEY;
  const expectedEndpoint = process.env.ATLAS_EXPECTED_ENDPOINT;
  if (!databaseUrl || !apiKey || !expectedEndpoint) {
    throw new Error("Atlas source bootstrap target verification is not configured.");
  }

  const hostname = new URL(databaseUrl).hostname;
  if (!hostname.startsWith(`${expectedEndpoint}.`) && !hostname.startsWith(`${expectedEndpoint}-pooler.`)) {
    throw new Error(`Refusing corrected Atlas import: DATABASE_URL host ${hostname} does not match ${expectedEndpoint}.`);
  }

  const headers = { Authorization: `Bearer ${apiKey}` };
  const projectsResponse = await fetch("https://console.neon.tech/api/v2/projects?limit=100", { headers });
  if (!projectsResponse.ok) throw new Error(`Neon project verification failed with HTTP ${projectsResponse.status}.`);
  const projects = (await projectsResponse.json()) as { projects?: Array<{ id: string; name: string }> };
  const project = projects.projects?.find((item) => item.name === "Service-Map-Atlas");
  if (!project) throw new Error("Provided Neon API key cannot see Service-Map-Atlas.");

  const endpointsResponse = await fetch(`https://console.neon.tech/api/v2/projects/${encodeURIComponent(project.id)}/endpoints`, { headers });
  if (!endpointsResponse.ok) throw new Error(`Neon endpoint verification failed with HTTP ${endpointsResponse.status}.`);
  const endpoints = (await endpointsResponse.json()) as { endpoints?: Array<{ id: string }> };
  if (!endpoints.endpoints?.some((endpoint) => endpoint.id === expectedEndpoint)) {
    throw new Error(`Service-Map-Atlas does not expose endpoint ${expectedEndpoint}.`);
  }

  logger.info({ projectId: project.id, endpointId: expectedEndpoint }, "Verified Service-Map-Atlas production target");
  return true;
}

async function ensureCategories(client: PoolClient) {
  const existing = await client.query<{ id: number; name: string }>(
    `SELECT id, name FROM service_categories WHERE name = ANY($1::text[])`,
    [SERVICE_NAMES],
  );
  const byName = new Map(existing.rows.map((row) => [row.name, row.id]));
  for (const name of SERVICE_NAMES) {
    if (byName.has(name)) continue;
    const inserted = await client.query<{ id: number }>(
      `INSERT INTO service_categories (name, slug) VALUES ($1, $2)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
      [name, slugify(name)],
    );
    byName.set(name, inserted.rows[0].id);
  }
  return byName;
}

function locationFor(row: Row, centroids: Map<string, [number, number]>) {
  let city = clean(row.cy);
  let state = clean(row.rg);
  let country = normalizeCountry(row.co);
  const address = clean(row.a);

  if ((!city || !state) && address) {
    const match = address.match(/,\s*([^,]+),\s*([A-Za-z]{2})\s+\d{4,5}(?:-\d{4})?(?:,|$)/);
    if (match) {
      city ||= match[1].trim();
      state ||= match[2].toUpperCase();
    }
  }
  if (city && !state) state = "N/A";
  if (!country && state.toUpperCase() === "PR") country = "Puerto Rico";
  if (!country && city.toLowerCase() === "tamuning") country = "Guam";
  if (!country && /^[A-Za-z]{2}$/.test(state) && state !== "N/A") country = "United States";

  const key = city && state && country ? `${city.toLowerCase()}|${state.toLowerCase()}|${country.toLowerCase()}` : "";
  let point = key ? centroids.get(key) : undefined;
  if (!point) {
    const latitude = Number(row.lat);
    const longitude = Number(row.lon);
    if (city && state && country && Number.isFinite(latitude) && Number.isFinite(longitude)) {
      point = [Math.round(latitude * 10) / 10, Math.round(longitude * 10) / 10];
    }
  }
  if (!city || !state || !country || !point) return null;
  return { city, state, country, latitude: point[0], longitude: point[1] };
}

async function buildProviders() {
  const response = await fetch(SOURCE_URL);
  if (!response.ok) throw new Error(`Command Center source download failed with HTTP ${response.status}.`);
  const html = await response.text();
  const rawProviders = extractEmbeddedJson<Row[]>(html, "PAYLOAD");
  const aux = extractEmbeddedJson<AuxSnapshot>(html, "AUX_PAYLOAD");
  if (!Array.isArray(rawProviders) || rawProviders.length !== 31_026) {
    throw new Error(`Unexpected Command Center provider count: ${rawProviders?.length ?? 0}.`);
  }

  const explicitByExternalId = new Map<number, Array<{ component: string; type: string }>>();
  for (const record of aux.availability) {
    const clinicIndex = Number(record[0]);
    const componentIndex = Number(record[1]);
    const typeIndex = Number(record[2]);
    const clinic = aux.clinics[clinicIndex] || [];
    const externalId = Number(clinic[0]);
    const component = clean(aux.components[componentIndex]);
    const type = clean(aux.types[typeIndex]);
    if (!Number.isFinite(externalId) || !component) continue;
    const current = explicitByExternalId.get(externalId) ?? [];
    current.push({ component, type });
    explicitByExternalId.set(externalId, current);
  }

  const nonExpired = rawProviders.filter((row) => clean(row.st) !== "Expired");
  if (nonExpired.length !== 23_544) throw new Error(`Unexpected non-expired provider count: ${nonExpired.length}.`);

  const centroidPoints = new Map<string, Array<[number, number]>>();
  for (const row of nonExpired) {
    const city = clean(row.cy);
    let state = clean(row.rg) || "N/A";
    let country = normalizeCountry(row.co);
    if (!country && state.toUpperCase() === "PR") country = "Puerto Rico";
    if (!country && city.toLowerCase() === "tamuning") country = "Guam";
    if (!country && /^[A-Za-z]{2}$/.test(state) && state !== "N/A") country = "United States";
    const latitude = Number(row.lat);
    const longitude = Number(row.lon);
    if (!city || !country || !Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
    const key = `${city.toLowerCase()}|${state.toLowerCase()}|${country.toLowerCase()}`;
    const current = centroidPoints.get(key) ?? [];
    current.push([latitude, longitude]);
    centroidPoints.set(key, current);
  }

  const centroids = new Map<string, [number, number]>();
  for (const [key, points] of centroidPoints) {
    const latitude = points.reduce((sum, point) => sum + point[0], 0) / points.length;
    const longitude = points.reduce((sum, point) => sum + point[1], 0) / points.length;
    centroids.set(key, [Math.round(latitude * 10) / 10, Math.round(longitude * 10) / 10]);
  }

  const providers: ProviderRecord[] = [];
  for (let index = 0; index < nonExpired.length; index += 1) {
    const row = nonExpired[index];
    const externalId = Number(row.i);
    const explicit = Number.isFinite(externalId) ? explicitByExternalId.get(externalId) ?? [] : [];
    const services = mappedServices(row, explicit);
    if (!services.length) continue;
    const location = locationFor(row, centroids);
    if (!location) continue;

    const type = providerType(row);
    const id = anonymousId(row, index, type);
    const tags = splitTags(row.sv);
    const componentNames = [...new Set(explicit.map((item) => item.component))];
    const allCapabilities = [...new Set([...tags, ...componentNames])];
    providers.push({
      name: `${type} · ${id}`,
      ...location,
      availabilityNotes: componentNames.join("; "),
      coverageNotes: allCapabilities.join("; "),
      internalTags: `Clinic Type=${type}; Facility Category=${clean(row.ft)}; Coordinate Privacy=generalized city-scale`,
      services,
    });
  }

  if (providers.length !== EXPECTED_COUNT) {
    throw new Error(`Corrected Atlas source build count mismatch: ${providers.length}/${EXPECTED_COUNT}. Database was not changed.`);
  }
  if (new Set(providers.map((provider) => provider.name)).size !== EXPECTED_COUNT) {
    throw new Error("Corrected Atlas source build produced duplicate anonymous provider IDs.");
  }
  return providers;
}

export async function runAtlasSourceDatasetBootstrap() {
  if (!(await verifyTarget())) return;
  const providers = await buildProviders();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const lock = await client.query<{ locked: boolean }>(`SELECT pg_try_advisory_xact_lock(197710908) AS locked`);
    if (!lock.rows[0]?.locked) {
      await client.query("ROLLBACK");
      logger.info("Corrected Atlas import already running elsewhere; skipped duplicate bootstrap");
      return;
    }

    await client.query(`CREATE TABLE IF NOT EXISTS atlas_dataset_state (
      dataset_key TEXT PRIMARY KEY,
      provider_count INTEGER NOT NULL,
      imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);

    const state = await client.query<{ provider_count: number }>(
      `SELECT provider_count FROM atlas_dataset_state WHERE dataset_key = $1`,
      [DATASET_KEY],
    );
    if (Number(state.rows[0]?.provider_count) === EXPECTED_COUNT) {
      const existing = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM service_locations WHERE ${generatedProviderPredicate()}`,
      );
      if (Number(existing.rows[0]?.count) === EXPECTED_COUNT) {
        await client.query("ROLLBACK");
        logger.info({ providerCount: EXPECTED_COUNT }, "Corrected Atlas source dataset already present; skipped");
        return;
      }
    }

    const categories = await ensureCategories(client);
    const deleted = await client.query<{ id: number }>(
      `DELETE FROM service_locations WHERE ${generatedProviderPredicate()} RETURNING id`,
    );

    let insertedCount = 0;
    let serviceLinkCount = 0;
    for (let start = 0; start < providers.length; start += BATCH_SIZE) {
      const batch = providers.slice(start, start + BATCH_SIZE);
      const values: unknown[] = [];
      const tuples = batch.map((provider) => {
        const base = values.length;
        values.push(
          provider.name, "", provider.city, provider.state, provider.country,
          provider.latitude, provider.longitude, provider.availabilityNotes || null,
          provider.coverageNotes || null, provider.internalTags || null, true,
        );
        return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9},$${base + 10},$${base + 11})`;
      });
      const created = await client.query<{ id: number; name: string }>(
        `INSERT INTO service_locations
          (name, address, city, state, country, latitude, longitude, availability_notes, coverage_notes, internal_tags, active)
         VALUES ${tuples.join(",")} RETURNING id, name`,
        values,
      );
      insertedCount += created.rows.length;
      const idByName = new Map(created.rows.map((row) => [row.name, row.id]));

      const linkValues: number[] = [];
      const linkTuples: string[] = [];
      for (const provider of batch) {
        const locationId = idByName.get(provider.name);
        if (!locationId) throw new Error(`Could not resolve inserted provider ${provider.name}.`);
        for (const service of provider.services) {
          const categoryId = categories.get(service);
          if (!categoryId) throw new Error(`Could not resolve service category ${service}.`);
          const base = linkValues.length;
          linkValues.push(locationId, categoryId);
          linkTuples.push(`($${base + 1},$${base + 2})`);
        }
      }
      if (linkTuples.length) {
        await client.query(`INSERT INTO location_services (location_id, category_id) VALUES ${linkTuples.join(",")}`, linkValues);
        serviceLinkCount += linkTuples.length;
      }
      logger.info({ inserted: insertedCount, expected: EXPECTED_COUNT }, "Corrected Atlas import progress");
    }

    const verified = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM service_locations WHERE ${generatedProviderPredicate()}`,
    );
    const withoutServices = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM service_locations l
       WHERE ${generatedProviderPredicate("l.name")}
         AND NOT EXISTS (SELECT 1 FROM location_services ls WHERE ls.location_id = l.id)`,
    );
    if (Number(verified.rows[0]?.count) !== EXPECTED_COUNT || Number(withoutServices.rows[0]?.count) !== 0) {
      throw new Error(`Post-import verification failed: providers=${verified.rows[0]?.count}, withoutServices=${withoutServices.rows[0]?.count}.`);
    }

    await client.query(
      `INSERT INTO atlas_dataset_state (dataset_key, provider_count, imported_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (dataset_key) DO UPDATE SET provider_count = EXCLUDED.provider_count, imported_at = EXCLUDED.imported_at`,
      [DATASET_KEY, EXPECTED_COUNT],
    );
    await client.query("COMMIT");
    logger.info({ deletedPriorGeneratedProviders: deleted.rows.length, importedProviders: insertedCount, serviceLinks: serviceLinkCount }, "Corrected Atlas production import complete");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
