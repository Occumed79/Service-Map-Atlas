import { Router } from "express";
import { db, searchEventsTable } from "@workspace/db";
import { RecordSearchEventBody } from "@workspace/api-zod";
import { logger } from "../lib/logger";

const router = Router();

router.post("/", async (req, res) => {
  const parsed = RecordSearchEventBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  try {
    const userId = req.session?.userId ?? null;
    const userName = req.session?.userName ?? null;
    const userEmail = req.session?.userEmail ?? null;
    const employerAccountId = req.session?.employerAccountId ?? null;
    const employerName = parsed.data.employerName ?? req.session?.employerName ?? null;

    const emailDomain = userEmail
      ? userEmail.split("@")[1] ?? null
      : (parsed.data.employerEmailDomain ?? null);

    await db.insert(searchEventsTable).values({
      userId,
      userName,
      userEmail,
      employerAccountId,
      employerName,
      employerEmailDomain: emailDomain,
      searchText: parsed.data.searchText,
      selectedServiceType: parsed.data.selectedServiceType ?? null,
      geocodedCity: parsed.data.geocodedCity ?? null,
      geocodedState: parsed.data.geocodedState ?? null,
      geocodedCountry: parsed.data.geocodedCountry ?? null,
      latitude: parsed.data.latitude ?? null,
      longitude: parsed.data.longitude ?? null,
      matchingProviderCount: parsed.data.matchingProviderCount,
      zeroResultSearch: parsed.data.zeroResultSearch,
      markerClicked: parsed.data.markerClicked,
      requestSubmitted: parsed.data.requestSubmitted,
    });
    res.status(201).json({ success: true });
  } catch (err) {
    logger.error({ err }, "Record search event error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
