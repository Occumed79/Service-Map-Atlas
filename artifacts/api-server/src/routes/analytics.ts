import { Router } from "express";
import { db, searchEventsTable, serviceLocationsTable, serviceRequestsTable, usersTable } from "@workspace/db";
import { eq, sql, desc, and } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router = Router();

router.get("/summary", requireAdmin, async (_req, res) => {
  try {
    const [searches] = await db.select({ count: sql<number>`count(*)::int` }).from(searchEventsTable);
    const [providers] = await db.select({ count: sql<number>`count(*)::int` }).from(serviceLocationsTable);
    const [activeProviders] = await db.select({ count: sql<number>`count(*)::int` }).from(serviceLocationsTable).where(eq(serviceLocationsTable.active, true));
    const [requests] = await db.select({ count: sql<number>`count(*)::int` }).from(serviceRequestsTable);
    const [pendingRequests] = await db.select({ count: sql<number>`count(*)::int` }).from(serviceRequestsTable).where(eq(serviceRequestsTable.status, "pending"));
    const [users] = await db.select({ count: sql<number>`count(*)::int` }).from(usersTable);
    const [zeroResults] = await db.select({ count: sql<number>`count(*)::int` }).from(searchEventsTable).where(eq(searchEventsTable.zeroResultSearch, true));
    const [submitted] = await db.select({ count: sql<number>`count(*)::int` }).from(searchEventsTable).where(eq(searchEventsTable.requestSubmitted, true));

    const totalSearches = searches.count;
    const searchToRequestRate = totalSearches > 0 ? submitted.count / totalSearches : 0;

    res.json({
      totalSearches,
      totalProviders: providers.count,
      totalServiceRequests: requests.count,
      totalUsers: users.count,
      zeroResultSearches: zeroResults.count,
      searchToRequestRate,
      pendingRequests: pendingRequests.count,
      activeProviders: activeProviders.count,
    });
  } catch (err) {
    logger.error({ err }, "Analytics summary error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/top-services", requireAdmin, async (req, res) => {
  try {
    const limit = parseInt(String(req.query.limit || "10"));
    const rows = await db
      .select({
        serviceType: searchEventsTable.selectedServiceType,
        count: sql<number>`count(*)::int`,
      })
      .from(searchEventsTable)
      .where(sql`${searchEventsTable.selectedServiceType} is not null`)
      .groupBy(searchEventsTable.selectedServiceType)
      .orderBy(desc(sql`count(*)`))
      .limit(limit);

    res.json(rows.map(r => ({ serviceType: r.serviceType || "Unknown", count: r.count })));
  } catch (err) {
    logger.error({ err }, "Top services error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/top-locations", requireAdmin, async (req, res) => {
  try {
    const limit = parseInt(String(req.query.limit || "10"));
    const rows = await db
      .select({
        city: searchEventsTable.geocodedCity,
        state: searchEventsTable.geocodedState,
        country: searchEventsTable.geocodedCountry,
        count: sql<number>`count(*)::int`,
      })
      .from(searchEventsTable)
      .where(sql`${searchEventsTable.geocodedCity} is not null or ${searchEventsTable.geocodedCountry} is not null`)
      .groupBy(searchEventsTable.geocodedCity, searchEventsTable.geocodedState, searchEventsTable.geocodedCountry)
      .orderBy(desc(sql`count(*)`))
      .limit(limit);

    res.json(rows.map(r => ({
      city: r.city ?? null,
      state: r.state ?? null,
      country: r.country ?? null,
      count: r.count,
    })));
  } catch (err) {
    logger.error({ err }, "Top locations error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/demand-heatmap", requireAdmin, async (_req, res) => {
  try {
    const rows = await db
      .select({
        latitude: searchEventsTable.latitude,
        longitude: searchEventsTable.longitude,
        count: sql<number>`count(*)::int`,
      })
      .from(searchEventsTable)
      .where(sql`${searchEventsTable.latitude} is not null and ${searchEventsTable.longitude} is not null`)
      .groupBy(searchEventsTable.latitude, searchEventsTable.longitude);

    const maxCount = rows.reduce((m, r) => Math.max(m, r.count), 1);

    res.json(rows.map(r => ({
      latitude: r.latitude!,
      longitude: r.longitude!,
      intensity: r.count / maxCount,
    })));
  } catch (err) {
    logger.error({ err }, "Demand heatmap error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/employer-trends", requireAdmin, async (req, res) => {
  try {
    const limit = parseInt(String(req.query.limit || "10"));
    const rows = await db
      .select({
        employerName: searchEventsTable.employerName,
        count: sql<number>`count(*)::int`,
        zeroCount: sql<number>`sum(case when ${searchEventsTable.zeroResultSearch} then 1 else 0 end)::int`,
        topService: sql<string>`mode() within group (order by ${searchEventsTable.selectedServiceType})`,
      })
      .from(searchEventsTable)
      .where(sql`${searchEventsTable.employerName} is not null`)
      .groupBy(searchEventsTable.employerName)
      .orderBy(desc(sql`count(*)`))
      .limit(limit);

    res.json(rows.map(r => ({
      employerName: r.employerName || "Unknown",
      searchCount: r.count,
      topService: r.topService || null,
      zeroResultCount: r.zeroCount || 0,
    })));
  } catch (err) {
    logger.error({ err }, "Employer trends error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/zero-result-searches", requireAdmin, async (req, res) => {
  try {
    const limit = parseInt(String(req.query.limit || "20"));
    const rows = await db
      .select()
      .from(searchEventsTable)
      .where(eq(searchEventsTable.zeroResultSearch, true))
      .orderBy(desc(searchEventsTable.timestamp))
      .limit(limit);

    res.json(rows.map(r => ({
      id: r.id,
      searchText: r.searchText,
      selectedServiceType: r.selectedServiceType ?? null,
      geocodedCity: r.geocodedCity ?? null,
      geocodedState: r.geocodedState ?? null,
      geocodedCountry: r.geocodedCountry ?? null,
      latitude: r.latitude ?? null,
      longitude: r.longitude ?? null,
      matchingProviderCount: r.matchingProviderCount,
      zeroResultSearch: r.zeroResultSearch,
      markerClicked: r.markerClicked,
      requestSubmitted: r.requestSubmitted,
      employerName: r.employerName ?? null,
      timestamp: r.timestamp.toISOString(),
    })));
  } catch (err) {
    logger.error({ err }, "Zero result searches error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/recent-searches", requireAdmin, async (req, res) => {
  try {
    const limit = parseInt(String(req.query.limit || "20"));
    const rows = await db
      .select()
      .from(searchEventsTable)
      .orderBy(desc(searchEventsTable.timestamp))
      .limit(limit);

    res.json(rows.map(r => ({
      id: r.id,
      searchText: r.searchText,
      selectedServiceType: r.selectedServiceType ?? null,
      geocodedCity: r.geocodedCity ?? null,
      geocodedState: r.geocodedState ?? null,
      geocodedCountry: r.geocodedCountry ?? null,
      latitude: r.latitude ?? null,
      longitude: r.longitude ?? null,
      matchingProviderCount: r.matchingProviderCount,
      zeroResultSearch: r.zeroResultSearch,
      markerClicked: r.markerClicked,
      requestSubmitted: r.requestSubmitted,
      employerName: r.employerName ?? null,
      timestamp: r.timestamp.toISOString(),
    })));
  } catch (err) {
    logger.error({ err }, "Recent searches error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
