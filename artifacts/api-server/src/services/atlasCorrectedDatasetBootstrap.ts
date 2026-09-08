import { brotliDecompressSync } from "node:zlib";
import type { PoolClient } from "pg";
import { pool } from "@workspace/db";
import { logger } from "../lib/logger";

const EXPECTED_COUNT = 19_771;
const DATASET_KEY = "atlas-corrected-19771-2026-09-08-v3";
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

const PROVIDER_TYPES = ["Clinic", "Lab", "Imaging Center", "Pharmacy"] as const;

type CompactRow = [
  string,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  string,
  string,
  string,
];

type CompactPayload = {
  c: string[];
  s: string[];
  o: string[];
  p: CompactRow[];
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

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function importEnabled() {
  return (
    process.env.ATLAS_COMPACT_BOOTSTRAP === "1" &&
    Boolean(
      process.env.ATLAS_COMPACT_PAYLOAD_CHUNKS &&
      process.env.NEON_API_KEY &&
      process.env.ATLAS_EXPECTED_ENDPOINT,
    )
  );
}

function readPayload(): ProviderRecord[] {
  const chunkCount = Number(process.env.ATLAS_COMPACT_PAYLOAD_CHUNKS);
  if (!Number.isInteger(chunkCount) || chunkCount < 1 || chunkCount > 50) {
    throw new Error(`Invalid Atlas compact payload chunk count: ${process.env.ATLAS_COMPACT_PAYLOAD_CHUNKS ?? "missing"}.`);
  }

  let encoded = "";
  for (let index = 0; index < chunkCount; index += 1) {
    const key = `ATLAS_COMPACT_PAYLOAD_${String(index).padStart(3, "0")}`;
    const chunk = process.env[key];
    if (!chunk) throw new Error(`Missing Atlas compact payload chunk ${key}.`);
    encoded += chunk;
  }

  const compact = JSON.parse(
    brotliDecompressSync(Buffer.from(encoded, "base64")).toString("utf8"),
  ) as CompactPayload;

  if (!compact || !Array.isArray(compact.p) || compact.p.length !== EXPECTED_COUNT) {
    throw new Error(`Atlas compact payload count mismatch: ${compact?.p?.length ?? 0}/${EXPECTED_COUNT}.`);
  }

  const providers = compact.p.map((row): ProviderRecord => {
    const [anonymousId, typeIndex, cityIndex, stateIndex, countryIndex, lat10, lon10, mask, availabilityNotes, coverageNotes, internalTags] = row;
    const providerType = PROVIDER_TYPES[typeIndex];
    const city = compact.c[cityIndex];
    const state = compact.s[stateIndex];
    const country = compact.o[countryIndex];
    if (!providerType || !anonymousId || !city || !state || !country) {
      throw new Error(`Invalid compact Atlas provider row for ${anonymousId || "unknown"}.`);
    }

    const services = SERVICE_NAMES.filter((_, index) => (mask & (1 << index)) !== 0);
    if (!services.length) throw new Error(`Atlas provider ${anonymousId} has no mapped service.`);

    return {
      name: `${providerType} · ${anonymousId}`,
      city,
      state,
      country,
      latitude: lat10 / 10,
      longitude: lon10 / 10,
      availabilityNotes,
      coverageNotes,
      internalTags,
      services,
    };
  });

  if (new Set(providers.map((provider) => provider.name)).size !== EXPECTED_COUNT) {
    throw new Error("Atlas compact payload contains duplicate anonymous provider IDs.");
  }

  return providers;
}

async function verifyTarget() {
  const databaseUrl = process.env.DATABASE_URL;
  const apiKey = process.env.NEON_API_KEY;
  const expectedEndpoint = process.env.ATLAS_EXPECTED_ENDPOINT;
  if (!databaseUrl || !apiKey || !expectedEndpoint) {
    throw new Error("Atlas corrected import target verification is not configured.");
  }

  const hostname = new URL(databaseUrl).hostname;
  if (!hostname.startsWith(`${expectedEndpoint}.`) && !hostname.startsWith(`${expectedEndpoint}-pooler.`)) {
    throw new Error(`Refusing Atlas corrected import: DATABASE_URL host ${hostname} does not match ${expectedEndpoint}.`);
  }

  const headers = { Authorization: `Bearer ${apiKey}` };
  const projectsResponse = await fetch("https://console.neon.tech/api/v2/projects?limit=100", { headers });
  if (!projectsResponse.ok) {
    throw new Error(`Neon project verification failed with HTTP ${projectsResponse.status}.`);
  }
  const projects = (await projectsResponse.json()) as { projects?: Array<{ id: string; name: string }> };
  const project = projects.projects?.find((item) => item.name === "Service-Map-Atlas");
  if (!project) throw new Error("Neon API key cannot see Service-Map-Atlas.");

  const endpointsResponse = await fetch(
    `https://console.neon.tech/api/v2/projects/${encodeURIComponent(project.id)}/endpoints`,
    { headers },
  );
  if (!endpointsResponse.ok) {
    throw new Error(`Neon endpoint verification failed with HTTP ${endpointsResponse.status}.`);
  }
  const endpoints = (await endpointsResponse.json()) as { endpoints?: Array<{ id: string }> };
  if (!endpoints.endpoints?.some((endpoint) => endpoint.id === expectedEndpoint)) {
    throw new Error(`Service-Map-Atlas does not expose production endpoint ${expectedEndpoint}.`);
  }

  logger.info({ projectId: project.id, endpointId: expectedEndpoint }, "Verified corrected Atlas import target");
}

async function ensureCategories(client: PoolClient) {
  const existing = await client.query<{ id: number; name: string }>(
    `SELECT id, name FROM service_categories WHERE name = ANY($1::text[])`,
    [SERVICE_NAMES],
  );
  const byName = new Map<string, number>(existing.rows.map((row) => [row.name, row.id]));

  for (const name of SERVICE_NAMES) {
    if (byName.has(name)) continue;
    const inserted = await client.query<{ id: number }>(
      `INSERT INTO service_categories (name, slug)
       VALUES ($1, $2)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [name, slugify(name)],
    );
    byName.set(name, inserted.rows[0].id);
  }
  return byName;
}

function generatedProviderPredicate(column = "name") {
  return `(
    ${column} ~ '^(CLINIC|LAB|IMG|PHARM)-[A-F0-9]{10}$'
    OR ${column} ~ '^(Clinic|Lab|Imaging Center|Pharmacy) · (CLINIC|LAB|IMG|PHARM)-[A-F0-9]{10}$'
  )`;
}

export async function runCorrectedAtlasDatasetBootstrap() {
  if (!importEnabled()) return;

  await verifyTarget();
  const providers = readPayload();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(`
      CREATE TABLE IF NOT EXISTS atlas_dataset_state (
        dataset_key TEXT PRIMARY KEY,
        provider_count INTEGER NOT NULL,
        imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const state = await client.query<{ provider_count: number }>(
      `SELECT provider_count FROM atlas_dataset_state WHERE dataset_key = $1`,
      [DATASET_KEY],
    );
    if (Number(state.rows[0]?.provider_count) === EXPECTED_COUNT) {
      const countResult = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM service_locations WHERE ${generatedProviderPredicate()}`,
      );
      if (Number(countResult.rows[0]?.count) === EXPECTED_COUNT) {
        await client.query("ROLLBACK");
        logger.info({ providerCount: EXPECTED_COUNT }, "Corrected Atlas dataset already present; bootstrap skipped");
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
      const locationValues: unknown[] = [];
      const locationTuples = batch.map((provider) => {
        const base = locationValues.length;
        locationValues.push(
          provider.name,
          "",
          provider.city,
          provider.state,
          provider.country,
          provider.latitude,
          provider.longitude,
          provider.availabilityNotes || null,
          provider.coverageNotes || null,
          provider.internalTags || null,
          true,
        );
        return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9},$${base + 10},$${base + 11})`;
      });

      const created = await client.query<{ id: number; name: string }>(
        `INSERT INTO service_locations
          (name, address, city, state, country, latitude, longitude, availability_notes, coverage_notes, internal_tags, active)
         VALUES ${locationTuples.join(",")}
         RETURNING id, name`,
        locationValues,
      );
      insertedCount += created.rows.length;
      const idByName = new Map(created.rows.map((row) => [row.name, row.id]));

      const linkValues: number[] = [];
      const linkTuples: string[] = [];
      for (const provider of batch) {
        const locationId = idByName.get(provider.name);
        if (!locationId) throw new Error(`Failed to resolve inserted provider ${provider.name}.`);
        for (const service of provider.services) {
          const categoryId = categories.get(service);
          if (!categoryId) throw new Error(`Failed to resolve Atlas service ${service}.`);
          const base = linkValues.length;
          linkValues.push(locationId, categoryId);
          linkTuples.push(`($${base + 1},$${base + 2})`);
        }
      }
      if (linkTuples.length) {
        await client.query(
          `INSERT INTO location_services (location_id, category_id) VALUES ${linkTuples.join(",")}`,
          linkValues,
        );
        serviceLinkCount += linkTuples.length;
      }

      if (insertedCount % 5_000 === 0 || insertedCount === EXPECTED_COUNT) {
        logger.info({ inserted: insertedCount, expected: EXPECTED_COUNT }, "Corrected Atlas database import progress");
      }
    }

    const verified = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM service_locations WHERE ${generatedProviderPredicate()}`,
    );
    const verifiedCount = Number(verified.rows[0]?.count);
    if (insertedCount !== EXPECTED_COUNT || verifiedCount !== EXPECTED_COUNT) {
      throw new Error(
        `Corrected Atlas verification failed: inserted=${insertedCount}, database=${verifiedCount}, expected=${EXPECTED_COUNT}.`,
      );
    }

    await client.query(
      `INSERT INTO atlas_dataset_state (dataset_key, provider_count, imported_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (dataset_key)
       DO UPDATE SET provider_count = EXCLUDED.provider_count, imported_at = EXCLUDED.imported_at`,
      [DATASET_KEY, EXPECTED_COUNT],
    );

    await client.query("COMMIT");
    logger.info(
      {
        deletedPriorGeneratedProviders: deleted.rows.length,
        importedProviders: insertedCount,
        serviceLinks: serviceLinkCount,
      },
      "Corrected Atlas dataset import complete",
    );
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
