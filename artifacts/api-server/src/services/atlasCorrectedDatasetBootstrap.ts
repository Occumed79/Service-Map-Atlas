import { createDecipheriv } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { pool } from "@workspace/db";
import { logger } from "../lib/logger";

const EXPECTED_COUNT = 19_771;
const DATASET_KEY = "atlas-corrected-command-center-2026-09-08-v1";
const AAD = Buffer.from("Service-Map-Atlas corrected dataset v1", "utf8");
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

type Payload = {
  version: string;
  expectedCount: number;
  providers: ProviderRecord[];
};

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function importEnabled() {
  return Boolean(
    process.env.ATLAS_DATASET_IMPORT_KEY &&
      process.env.ATLAS_DATASET_IMPORT_PAYLOAD_CHUNKS &&
      process.env.NEON_API_KEY &&
      process.env.ATLAS_EXPECTED_ENDPOINT,
  );
}

async function verifyTarget() {
  const databaseUrl = process.env.DATABASE_URL;
  const apiKey = process.env.NEON_API_KEY;
  const expectedEndpoint = process.env.ATLAS_EXPECTED_ENDPOINT;

  if (!databaseUrl || !apiKey || !expectedEndpoint) {
    throw new Error("Corrected Atlas import target verification is not configured.");
  }

  const hostname = new URL(databaseUrl).hostname;
  const directHost = `${expectedEndpoint}.`;
  const pooledHost = `${expectedEndpoint}-pooler.`;
  if (!hostname.startsWith(directHost) && !hostname.startsWith(pooledHost)) {
    throw new Error(`Refusing corrected Atlas import: DATABASE_URL host ${hostname} does not match ${expectedEndpoint}.`);
  }

  const headers = { Authorization: `Bearer ${apiKey}` };
  const projectsResponse = await fetch("https://console.neon.tech/api/v2/projects?limit=100", { headers });
  if (!projectsResponse.ok) {
    throw new Error(`Neon project verification failed with HTTP ${projectsResponse.status}.`);
  }

  const projectPayload = (await projectsResponse.json()) as { projects?: Array<{ id: string; name: string }> };
  const project = projectPayload.projects?.find((item) => item.name === "Service-Map-Atlas");
  if (!project) throw new Error("Neon API key cannot see the Service-Map-Atlas project.");

  const endpointsResponse = await fetch(
    `https://console.neon.tech/api/v2/projects/${encodeURIComponent(project.id)}/endpoints`,
    { headers },
  );
  if (!endpointsResponse.ok) {
    throw new Error(`Neon endpoint verification failed with HTTP ${endpointsResponse.status}.`);
  }

  const endpointPayload = (await endpointsResponse.json()) as { endpoints?: Array<{ id: string }> };
  if (!endpointPayload.endpoints?.some((endpoint) => endpoint.id === expectedEndpoint)) {
    throw new Error(`Service-Map-Atlas project does not expose expected production endpoint ${expectedEndpoint}.`);
  }

  logger.info({ projectId: project.id, endpointId: expectedEndpoint }, "Verified corrected Atlas import target");
}

function readEncryptedPayloadFromEnv() {
  const rawCount = process.env.ATLAS_DATASET_IMPORT_PAYLOAD_CHUNKS;
  const chunkCount = Number(rawCount);
  if (!Number.isInteger(chunkCount) || chunkCount < 1 || chunkCount > 100) {
    throw new Error(`Invalid corrected Atlas payload chunk count: ${rawCount ?? "missing"}.`);
  }

  let encoded = "";
  for (let index = 0; index < chunkCount; index += 1) {
    const key = `ATLAS_DATASET_IMPORT_PAYLOAD_${String(index).padStart(3, "0")}`;
    const value = process.env[key];
    if (!value) throw new Error(`Missing corrected Atlas payload chunk ${key}.`);
    encoded += value;
  }
  return encoded;
}

async function loadPayload(): Promise<Payload> {
  const keyHex = process.env.ATLAS_DATASET_IMPORT_KEY;
  if (!keyHex) throw new Error("Corrected Atlas payload key is missing.");

  const encoded = readEncryptedPayloadFromEnv();
  const encrypted = Buffer.from(encoded, "base64");
  if (encrypted.length < 29) throw new Error("Corrected Atlas payload is invalid.");

  const nonce = encrypted.subarray(0, 12);
  const cipherAndTag = encrypted.subarray(12);
  const tag = cipherAndTag.subarray(cipherAndTag.length - 16);
  const ciphertext = cipherAndTag.subarray(0, cipherAndTag.length - 16);
  const key = Buffer.from(keyHex, "hex");
  if (key.length !== 32) throw new Error("Corrected Atlas payload key must be 32 bytes.");

  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAAD(AAD);
  decipher.setAuthTag(tag);
  const compressed = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  const payload = JSON.parse(gunzipSync(compressed).toString("utf8")) as Payload;

  if (!payload || payload.expectedCount !== EXPECTED_COUNT || payload.providers?.length !== EXPECTED_COUNT) {
    throw new Error(`Corrected Atlas payload count mismatch: expected ${EXPECTED_COUNT}, received ${payload?.providers?.length ?? 0}.`);
  }

  const accepted = new Set<string>(SERVICE_NAMES);
  for (const provider of payload.providers) {
    if (
      !provider.name || !provider.city || !provider.state || !provider.country ||
      !Number.isFinite(provider.latitude) || !Number.isFinite(provider.longitude) ||
      !provider.services?.length || provider.services.some((service) => !accepted.has(service))
    ) {
      throw new Error(`Corrected Atlas payload failed validation at ${provider.name || "unnamed provider"}.`);
    }
  }

  return payload;
}

async function ensureServiceCategories(client: Awaited<ReturnType<typeof pool.connect>>): Promise<Map<string, number>> {
  const existing = await client.query<{ id: number; name: string }>(
    `SELECT id, name FROM service_categories WHERE name = ANY($1::text[])`,
    [SERVICE_NAMES],
  );
  const byName = new Map(existing.rows.map((row) => [row.name, row.id]));

  for (const name of SERVICE_NAMES) {
    if (byName.has(name)) continue;
    const result = await client.query<{ id: number }>(
      `INSERT INTO service_categories (name, slug) VALUES ($1, $2)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [name, slugify(name)],
    );
    byName.set(name, result.rows[0].id);
  }
  return byName;
}

function isGeneratedProviderNameSql(column = "name") {
  return `(
    ${column} ~ '^(CLINIC|LAB|IMG|PHARM)-[A-F0-9]{10}$'
    OR ${column} ~ '^(Clinic|Lab|Imaging Center|Pharmacy) · (CLINIC|LAB|IMG|PHARM)-[A-F0-9]{10}$'
  )`;
}

export async function runCorrectedAtlasDatasetBootstrap() {
  if (!importEnabled()) return;

  await verifyTarget();
  const payload = await loadPayload();
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
      const existingCount = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM service_locations WHERE ${isGeneratedProviderNameSql()}`,
      );
      if (Number(existingCount.rows[0]?.count) === EXPECTED_COUNT) {
        await client.query("ROLLBACK");
        logger.info({ providerCount: EXPECTED_COUNT }, "Corrected Atlas dataset already present; bootstrap skipped");
        return;
      }
    }

    const categories = await ensureServiceCategories(client);
    const deleted = await client.query<{ id: number }>(
      `DELETE FROM service_locations WHERE ${isGeneratedProviderNameSql()} RETURNING id`,
    );

    let inserted = 0;
    let serviceLinks = 0;

    for (let start = 0; start < payload.providers.length; start += BATCH_SIZE) {
      const batch = payload.providers.slice(start, start + BATCH_SIZE);
      const values: unknown[] = [];
      const tuples = batch.map((provider) => {
        const base = values.length;
        values.push(
          provider.name, "", provider.city, provider.state, provider.country,
          provider.latitude, provider.longitude,
          provider.availabilityNotes || null, provider.coverageNotes || null,
          provider.internalTags || null, true,
        );
        return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9},$${base + 10},$${base + 11})`;
      });

      const created = await client.query<{ id: number; name: string }>(
        `INSERT INTO service_locations
          (name, address, city, state, country, latitude, longitude, availability_notes, coverage_notes, internal_tags, active)
         VALUES ${tuples.join(",")}
         RETURNING id, name`,
        values,
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
        await client.query(
          `INSERT INTO location_services (location_id, category_id) VALUES ${linkTuples.join(",")}`,
          linkValues,
        );
        serviceLinks += linkTuples.length;
      }

      if (inserted % 5_000 === 0 || inserted === EXPECTED_COUNT) {
        logger.info({ inserted, expected: EXPECTED_COUNT }, "Corrected Atlas dataset import progress");
      }
    }

    const verified = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM service_locations WHERE ${isGeneratedProviderNameSql()}`,
    );
    const verifiedCount = Number(verified.rows[0]?.count);
    if (inserted !== EXPECTED_COUNT || verifiedCount !== EXPECTED_COUNT) {
      throw new Error(`Corrected Atlas provider verification failed: inserted=${inserted}, database=${verifiedCount}, expected=${EXPECTED_COUNT}.`);
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
        importedProviders: inserted,
        serviceLinks,
        datasetVersion: payload.version,
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
