import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pool } from "@workspace/db";
import { logger } from "../lib/logger";

const EXPECTED = 19_771;
const DATASET_KEY = "atlas-corrected-isolated-19771-2026-09-08-v1";
const SERVICE_NAMES = ["Dental","Chest X-Ray","B-Reader","Spirometry","Pulmonary Function Testing","Drug Screen","DOT Physical","Audiogram","EKG","Treadmill Stress Test","Laboratory Services","Titers","Vaccinations","Physical Examination","Vision Testing","Occupational Medicine","Specialty Services"];

type P = { n:string;t:string;c:string;s:string;o:string;a:number;g:number;v:string[];x:string;y:string;i:string };

function generated(column="name") {
  return `(${column} ~ '^(CLINIC|LAB|IMG|PHARM)-[A-F0-9]{10}$' OR ${column} ~ '^(Clinic|Lab|Imaging Center|Pharmacy) · (CLINIC|LAB|IMG|PHARM)-[A-F0-9]{10}$')`;
}
function slug(v:string) { return v.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,""); }

async function verifyTarget() {
  if (process.env.APP_MODE !== "admin" || process.env.ATLAS_SOURCE_BOOTSTRAP !== "1") return false;
  const dbUrl=process.env.DATABASE_URL, apiKey=process.env.NEON_API_KEY, endpoint=process.env.ATLAS_EXPECTED_ENDPOINT;
  if (!dbUrl || !apiKey || !endpoint) throw new Error("Atlas production import target verification is not configured");
  const host=new URL(dbUrl).hostname;
  if (!host.startsWith(`${endpoint}.`) && !host.startsWith(`${endpoint}-pooler.`)) throw new Error(`Refusing Atlas import: ${host} != ${endpoint}`);
  const headers={Authorization:`Bearer ${apiKey}`};
  const pr=await fetch("https://console.neon.tech/api/v2/projects?limit=100",{headers});
  if(!pr.ok) throw new Error(`Neon verification HTTP ${pr.status}`);
  const pj=await pr.json() as {projects?:Array<{id:string;name:string}>};
  const project=pj.projects?.find(p=>p.name==="Service-Map-Atlas");
  if(!project) throw new Error("API key cannot see Service-Map-Atlas");
  const er=await fetch(`https://console.neon.tech/api/v2/projects/${project.id}/endpoints`,{headers});
  if(!er.ok) throw new Error(`Neon endpoint verification HTTP ${er.status}`);
  const ej=await er.json() as {endpoints?:Array<{id:string}>};
  if(!ej.endpoints?.some(e=>e.id===endpoint)) throw new Error(`Endpoint ${endpoint} not in Service-Map-Atlas`);
  logger.info({projectId:project.id,endpointId:endpoint},"Verified Service-Map-Atlas production target");
  return true;
}

async function ensureCategories(client:any) {
  const r=await client.query(`SELECT id,name FROM service_categories WHERE name=ANY($1::text[])`,[SERVICE_NAMES]);
  const map=new Map<string,number>(r.rows.map((x:any)=>[String(x.name),Number(x.id)]));
  for(const name of SERVICE_NAMES){
    if(map.has(name)) continue;
    const q=await client.query(`INSERT INTO service_categories(name,slug) VALUES($1,$2) ON CONFLICT(slug) DO UPDATE SET name=EXCLUDED.name RETURNING id`,[name,slug(name)]);
    map.set(name,Number(q.rows[0].id));
  }
  return map;
}

function runBuilder(script:string){
  const full=path.resolve(process.cwd(),script);
  const stdout=execFileSync(process.execPath,[full],{encoding:"utf8",maxBuffer:5*1024*1024,env:process.env});
  logger.info({script,output:stdout.trim()},"Atlas isolated builder complete");
}

export async function runAtlasIsolatedDatasetBootstrap(){
  if(!(await verifyTarget())) return;
  runBuilder("scripts/atlas-extract-aux.mjs");
  runBuilder("scripts/atlas-build-final.mjs");
  const providers=JSON.parse(fs.readFileSync("/tmp/atlas-final.json","utf8")) as P[];
  if(providers.length!==EXPECTED) throw new Error(`Final payload ${providers.length}/${EXPECTED}; DB untouched`);

  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const lock=await client.query(`SELECT pg_try_advisory_xact_lock(197710908) locked`);
    if(!lock.rows[0]?.locked){await client.query("ROLLBACK");logger.info("Atlas import lock busy; skipped");return;}
    await client.query(`CREATE TABLE IF NOT EXISTS atlas_dataset_state(dataset_key text primary key,provider_count integer not null,imported_at timestamptz not null default now())`);
    const state=await client.query(`SELECT provider_count FROM atlas_dataset_state WHERE dataset_key=$1`,[DATASET_KEY]);
    if(Number(state.rows[0]?.provider_count)===EXPECTED){
      const c=await client.query(`SELECT count(*)::int count FROM service_locations WHERE ${generated()}`);
      if(Number(c.rows[0]?.count)===EXPECTED){await client.query("ROLLBACK");logger.info({providerCount:EXPECTED},"Corrected Atlas dataset already present");return;}
    }
    const categories=await ensureCategories(client);
    const deleted=await client.query(`DELETE FROM service_locations WHERE ${generated()} RETURNING id`);
    let inserted=0,links=0;
    for(let start=0;start<providers.length;start+=500){
      const batch=providers.slice(start,start+500), vals:any[]=[];
      const tuples=batch.map(p=>{const b=vals.length;vals.push(p.n,"",p.c,p.s,p.o,p.a,p.g,p.x||null,p.y||null,p.i||null,true);return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9},$${b+10},$${b+11})`;});
      const created=await client.query(`INSERT INTO service_locations(name,address,city,state,country,latitude,longitude,availability_notes,coverage_notes,internal_tags,active) VALUES ${tuples.join(",")} RETURNING id,name`,vals);
      const ids=new Map<string,number>(created.rows.map((r:any)=>[String(r.name),Number(r.id)]));
      inserted+=created.rows.length;
      const lv:number[]=[],lt:string[]=[];
      for(const p of batch){const locationId=ids.get(p.n);if(!locationId)throw new Error(`Missing inserted id ${p.n}`);for(const s of p.v){const categoryId=categories.get(s);if(!categoryId)throw new Error(`Missing category ${s}`);const b=lv.length;lv.push(locationId,categoryId);lt.push(`($${b+1},$${b+2})`);}}
      if(lt.length){await client.query(`INSERT INTO location_services(location_id,category_id) VALUES ${lt.join(",")}`,lv);links+=lt.length;}
      logger.info({inserted,expected:EXPECTED},"Corrected Atlas import progress");
    }
    const verified=await client.query(`SELECT count(*)::int count FROM service_locations WHERE ${generated()}`);
    const missing=await client.query(`SELECT count(*)::int count FROM service_locations l WHERE ${generated("l.name")} AND NOT EXISTS(SELECT 1 FROM location_services ls WHERE ls.location_id=l.id)`);
    if(Number(verified.rows[0]?.count)!==EXPECTED||Number(missing.rows[0]?.count)!==0) throw new Error(`Verification failed providers=${verified.rows[0]?.count} missingServices=${missing.rows[0]?.count}`);
    await client.query(`INSERT INTO atlas_dataset_state(dataset_key,provider_count,imported_at) VALUES($1,$2,now()) ON CONFLICT(dataset_key) DO UPDATE SET provider_count=excluded.provider_count,imported_at=excluded.imported_at`,[DATASET_KEY,EXPECTED]);
    await client.query("COMMIT");
    logger.info({deletedPriorGeneratedProviders:deleted.rows.length,importedProviders:inserted,serviceLinks:links},"Corrected Atlas production import complete");
  }catch(err){await client.query("ROLLBACK").catch(()=>undefined);throw err;}finally{client.release();}
}
