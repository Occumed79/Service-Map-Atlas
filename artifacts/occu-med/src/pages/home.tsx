import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClipboardPlus, Clock3, Info, Navigation, Route, Search, Sparkles, X } from "lucide-react";
import { useCreateServiceRequest, useRecordSearchEvent } from "@workspace/api-client-react";
import { GlassPanel } from "@/components/ui/glass-panel";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import * as z from "zod";
import { AtlasArcgisMap, SERVICE_COLORS, type CoverageArea } from "@/components/atlas-arcgis-map";

const SERVICE_CATEGORIES = [
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
];

const SERVICE_ALIASES: Array<{ service: string; patterns: RegExp[] }> = [
  { service: "Pulmonary Function Testing", patterns: [/\bpft\b/i, /\bpulmonary function(?: testing)?\b/i] },
  { service: "Physical Examination", patterns: [/\bphysical(?: exam(?:ination)?)?\b/i, /\bmedical physical\b/i] },
  { service: "Treadmill Stress Test", patterns: [/\btreadmill(?: stress test)?\b/i, /\bstress test\b/i] },
  { service: "Laboratory Services", patterns: [/\blabs?\b/i, /\blaboratory\b/i, /\bblood ?work\b/i] },
  { service: "Chest X-Ray", patterns: [/\bchest x[- ]?ray\b/i, /\bcxr\b/i] },
  { service: "Drug Screen", patterns: [/\bdrug screen(?:ing)?\b/i, /\bdrug test(?:ing)?\b/i] },
  { service: "DOT Physical", patterns: [/\bdot physical\b/i] },
  { service: "Audiogram", patterns: [/\baudiogram\b/i, /\baudiometry\b/i, /\bhearing test(?:ing)?\b/i] },
  { service: "Spirometry", patterns: [/\bspirometry\b/i] },
  { service: "EKG", patterns: [/\bekg\b/i, /\becg\b/i] },
  { service: "Dental", patterns: [/\bdental\b/i, /\bdentist\b/i] },
  { service: "Titers", patterns: [/\btiters?\b/i] },
  { service: "Vaccinations", patterns: [/\bvaccinations?\b/i, /\bvaccines?\b/i, /\bimmunizations?\b/i] },
  { service: "Vision Testing", patterns: [/\bvision test(?:ing)?\b/i, /\bvision exam\b/i] },
  { service: "Occupational Medicine", patterns: [/\boccupational medicine\b/i, /\bocc(?:upational)? health\b/i] },
];

type ReachMode = "off" | "radius" | "drive";

const requestSchema = z.object({
  clientName: z.string().min(2, "Name is required"),
  clientEmail: z.string().email("Valid email required"),
  clientPhone: z.string().optional(),
  employerCompany: z.string().optional(),
  requestedService: z.string().min(2, "Service is required"),
  requestedLocation: z.string().min(2, "Location is required"),
  urgency: z.enum(["low", "normal", "high", "urgent"]),
  notes: z.string().optional(),
});

function distanceMiles(a: [number, number], b: [number, number]) {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadiusMiles = 3958.8;
  const dLat = toRadians(b[0] - a[0]);
  const dLon = toRadians(b[1] - a[1]);
  const lat1 = toRadians(a[0]);
  const lat2 = toRadians(b[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadiusMiles * Math.asin(Math.sqrt(h));
}

function nearestChoice(value: number, choices: number[]) {
  return choices.reduce((best, next) => Math.abs(next - value) < Math.abs(best - value) ? next : best, choices[0]);
}

function parseMissionQuery(rawQuery: string) {
  let location = rawQuery;
  const services: string[] = [];

  for (const alias of SERVICE_ALIASES) {
    const matched = alias.patterns.some((pattern) => pattern.test(location));
    if (!matched) continue;
    services.push(alias.service);
    for (const pattern of alias.patterns) {
      location = location.replace(new RegExp(pattern.source, "gi"), " ");
    }
  }

  const driveMatch = rawQuery.match(/\b(\d{1,3})\s*(?:min|mins|minute|minutes)\s*(?:drive|driving)?\b/i);
  const radiusMatch = rawQuery.match(/\b(\d{1,3})\s*(?:mi|mile|miles)\b/i);

  if (driveMatch) location = location.replace(driveMatch[0], " ");
  if (radiusMatch) location = location.replace(radiusMatch[0], " ");

  location = location
    .replace(/\b(?:show me|find me|find|locate|search for|need|providers?|coverage)\b/gi, " ")
    .replace(/\b(?:near|around|close to)\b/gi, " ")
    .replace(/^\s*(?:in|at|within)\s+/i, "")
    .replace(/[+&]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^,|,$/g, "")
    .trim();

  return {
    location: location || rawQuery,
    services: Array.from(new Set(services)),
    driveMinutes: driveMatch ? nearestChoice(Number(driveMatch[1]), [30, 60, 90]) : null,
    radiusMiles: radiusMatch ? nearestChoice(Number(radiusMatch[1]), [25, 50, 75]) : null,
  };
}

async function lookupTimeZone(latitude: number, longitude: number) {
  const response = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m&timezone=auto&forecast_days=1`,
  );
  if (!response.ok) return null;
  const data = await response.json();
  return typeof data?.timezone === "string" ? data.timezone : null;
}

function timeZoneIntelligence(timeZone: string | null, now: number) {
  if (!timeZone) return null;
  try {
    const instant = new Date(now);
    const time = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(instant);
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      hour: "2-digit",
      hourCycle: "h23",
    }).formatToParts(instant);
    const weekday = parts.find((part) => part.type === "weekday")?.value ?? "";
    const hour = Number(parts.find((part) => part.type === "hour")?.value ?? -1);
    const weekdayOpen = !["Sat", "Sun"].includes(weekday);
    const typicalWorkday = weekdayOpen && hour >= 8 && hour < 17;
    return {
      time,
      zone: timeZone,
      workday: typicalWorkday ? "Typical workday" : "Local after-hours",
    };
  } catch {
    return null;
  }
}

export default function Home() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [mapCenter, setMapCenter] = useState<[number, number]>([18, 0]);
  const [mapZoom, setMapZoom] = useState(2);
  const [searchAnchor, setSearchAnchor] = useState<[number, number] | null>(null);
  const [reachMode, setReachMode] = useState<ReachMode>("drive");
  const [radiusMiles, setRadiusMiles] = useState(75);
  const [driveMinutes, setDriveMinutes] = useState(60);
  const [showNetworkArcs, setShowNetworkArcs] = useState(true);
  const [toolsVisible, setToolsVisible] = useState(true);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [toolsInteracted, setToolsInteracted] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [selectedCoverage, setSelectedCoverage] = useState<CoverageArea | null>(null);
  const [searchLabel, setSearchLabel] = useState("Worldwide");
  const [searchTimeZone, setSearchTimeZone] = useState<string | null>(null);
  const [clockTick, setClockTick] = useState(Date.now());
  const [mapStatus, setMapStatus] = useState<"loading" | "ready" | "error">("loading");
  const [mapError, setMapError] = useState<string | null>(null);
  const { toast } = useToast();
  const recordSearch = useRecordSearchEvent();

  const { data: allCoverageAreas = [], isLoading } = useQuery<CoverageArea[]>({
    queryKey: ["coverage-areas"],
    queryFn: async () => {
      const response = await fetch("/api/coverage", { credentials: "include" });
      if (!response.ok) throw new Error("Coverage could not be loaded");
      return response.json();
    },
  });

  const coverageAreas = useMemo(() => {
    if (!selectedServices.length) return allCoverageAreas;
    return allCoverageAreas.filter((area) => selectedServices.every((service) => area.services.includes(service)));
  }, [allCoverageAreas, selectedServices]);

  const totalServices = useMemo(() => new Set(coverageAreas.flatMap((area) => area.services)).size, [coverageAreas]);
  const localTime = useMemo(() => timeZoneIntelligence(searchTimeZone, clockTick), [searchTimeZone, clockTick]);

  useEffect(() => {
    const interval = window.setInterval(() => setClockTick(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!toolsVisible || toolsInteracted) return;
    const timeout = window.setTimeout(() => setToolsVisible(false), 60_000);
    return () => window.clearTimeout(timeout);
  }, [toolsInteracted, toolsVisible]);

  const handleSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    const rawQuery = searchQuery.trim();
    if (!rawQuery) return;

    const mission = parseMissionQuery(rawQuery);
    const nextServices = mission.services.length ? mission.services : selectedServices;
    if (mission.services.length) setSelectedServices(mission.services);
    if (mission.driveMinutes) {
      setReachMode("drive");
      setDriveMinutes(mission.driveMinutes);
    } else if (mission.radiusMiles) {
      setReachMode("radius");
      setRadiusMiles(mission.radiusMiles);
    }

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=1&q=${encodeURIComponent(mission.location)}`,
        { headers: { Accept: "application/json" } },
      );
      const results = await response.json();
      const match = results?.[0];
      if (!match) {
        toast({ title: "Location not found", description: "Try a city, postal code, or full address." });
        return;
      }

      const latitude = Number(match.lat);
      const longitude = Number(match.lon);
      const center: [number, number] = [latitude, longitude];
      const matchingPool = nextServices.length
        ? allCoverageAreas.filter((area) => nextServices.every((service) => area.services.includes(service)))
        : allCoverageAreas;
      const nearbyCount = matchingPool.filter((area) => distanceMiles(center, [area.latitude, area.longitude]) <= 75).length;

      setMapCenter(center);
      setMapZoom(9);
      setSearchAnchor(center);
      setSearchLabel(match.display_name ?? mission.location);
      setSearchTimeZone(null);
      setToolsVisible(true);

      void lookupTimeZone(latitude, longitude).then((timeZone) => {
        if (timeZone) setSearchTimeZone(timeZone);
      }).catch(() => undefined);

      recordSearch.mutate({
        data: {
          searchText: rawQuery,
          selectedServiceType: nextServices.length ? nextServices.join(", ") : null,
          geocodedCity: match.address?.city ?? match.address?.town ?? match.address?.village ?? null,
          geocodedState: match.address?.state ?? null,
          geocodedCountry: match.address?.country ?? null,
          latitude,
          longitude,
          matchingProviderCount: nearbyCount,
          zeroResultSearch: nearbyCount === 0,
          markerClicked: false,
          requestSubmitted: false,
        },
      });
    } catch {
      toast({ title: "Search unavailable", description: "The location service could not be reached. Please try again." });
    }
  };

  const toggleService = (service: string) => {
    setSelectedServices((current) => current.includes(service)
      ? current.filter((item) => item !== service)
      : [...current, service]);
  };

  const openRequest = (coverage: CoverageArea | null) => {
    setSelectedCoverage(coverage);
    setRequestOpen(true);
  };

  const handleMarkerClick = (area: CoverageArea) => {
    recordSearch.mutate({
      data: {
        searchText: searchQuery || "map_coverage_selection",
        selectedServiceType: selectedServices.length ? selectedServices.join(", ") : null,
        geocodedCity: area.city,
        geocodedState: area.region,
        geocodedCountry: area.country,
        latitude: area.latitude,
        longitude: area.longitude,
        matchingProviderCount: 1,
        zeroResultSearch: false,
        markerClicked: true,
        requestSubmitted: false,
      },
    });
  };

  const openTools = () => {
    setToolsVisible(true);
    setToolsInteracted(true);
    setToolsOpen(true);
  };

  return (
    <div className="atlas-shell">
      <AtlasArcgisMap
        center={mapCenter}
        zoom={mapZoom}
        coverageAreas={coverageAreas}
        selectedService={selectedServices[0] ?? null}
        searchAnchor={searchAnchor}
        reachMode={reachMode}
        radiusMiles={radiusMiles}
        driveMinutes={driveMinutes}
        showNetworkArcs={showNetworkArcs}
        onMarkerClick={handleMarkerClick}
        onRequestCoverage={openRequest}
        onStatusChange={(status, message) => {
          setMapStatus(status);
          setMapError(message ?? null);
        }}
      />

      {mapStatus === "loading" && (
        <div className="atlas-map-status" role="status">
          Loading map…
        </div>
      )}

      {mapStatus === "error" && (
        <div className="atlas-map-status atlas-map-status-error" role="alert">
          Atlas map failed to load{mapError ? `: ${mapError}` : "."}
        </div>
      )}

      <header className="atlas-header atlas-header-search-only">
        <GlassPanel className="atlas-search-panel">
          <form onSubmit={handleSearch}>
            <Search className="atlas-search-icon" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search a place — or try: physical + EKG + labs near Warsaw"
              className="atlas-search-input"
            />
            <Button type="submit" className="atlas-search-button" aria-label="Search map"><Navigation /></Button>
          </form>
        </GlassPanel>

        <div className="atlas-filter-rail" aria-label="Mission service filters">
          <button type="button" className={!selectedServices.length ? "atlas-filter active" : "atlas-filter"} onClick={() => setSelectedServices([])}>All services</button>
          {SERVICE_CATEGORIES.map((category) => (
            <button
              type="button"
              key={category}
              className={selectedServices.includes(category) ? "atlas-filter active atlas-filter-category" : "atlas-filter atlas-filter-category"}
              style={{ "--filter-accent": SERVICE_COLORS[category] } as React.CSSProperties}
              onClick={() => toggleService(category)}
            >
              <span className="atlas-filter-color" aria-hidden="true" />
              {category}
            </button>
          ))}
        </div>
      </header>

      <GlassPanel className="atlas-summary-card" title={searchLabel}>
        <div className="atlas-summary-copy">
          <span className="atlas-summary-location">{isLoading ? "Loading" : searchLabel}</span>
          <strong>
            {coverageAreas.length} areas · {selectedServices.length ? `${selectedServices.length}-service mission` : `${totalServices} services`}
          </strong>
        </div>
        {localTime && (
          <div className="atlas-summary-time" title={localTime.zone}>
            <Clock3 aria-hidden="true" />
            <div>
              <strong>{localTime.time}</strong>
              <span>{localTime.workday}</span>
            </div>
          </div>
        )}
      </GlassPanel>

      {toolsVisible && (
        <div className={toolsOpen ? "atlas-tools-bubble open" : "atlas-tools-bubble"}>
          {!toolsOpen ? (
            <button type="button" className="atlas-tools-launcher" onClick={openTools} aria-label="Open Atlas tools">
              <Sparkles aria-hidden="true" />
              <span>Atlas tools</span>
            </button>
          ) : (
            <div className="atlas-tools-popover" role="dialog" aria-label="Atlas map tools">
              <div className="atlas-tools-head">
                <div>
                  <strong>Atlas tools</strong>
                  <span>{selectedServices.length ? `${selectedServices.length} mission services active` : "Explore network reach"}</span>
                </div>
                <button type="button" onClick={() => setToolsOpen(false)} aria-label="Collapse Atlas tools"><X /></button>
              </div>

              <div className="atlas-tools-section">
                <span className="atlas-tools-label">Reach</span>
                <div className="atlas-tools-segmented">
                  <button type="button" className={reachMode === "radius" ? "active" : ""} onClick={() => setReachMode("radius")}>Miles</button>
                  <button type="button" className={reachMode === "drive" ? "active" : ""} onClick={() => setReachMode("drive")}>Drive</button>
                  <button type="button" className={reachMode === "off" ? "active" : ""} onClick={() => setReachMode("off")}>Hide</button>
                </div>
              </div>

              {reachMode === "radius" && (
                <div className="atlas-tools-options" aria-label="Straight-line radius">
                  {[25, 50, 75].map((miles) => (
                    <button type="button" key={miles} className={radiusMiles === miles ? "active" : ""} onClick={() => setRadiusMiles(miles)}>{miles} mi</button>
                  ))}
                </div>
              )}

              {reachMode === "drive" && (
                <div className="atlas-tools-options" aria-label="Drive-time reach">
                  {[30, 60, 90].map((minutes) => (
                    <button type="button" key={minutes} className={driveMinutes === minutes ? "active" : ""} onClick={() => setDriveMinutes(minutes)}>{minutes} min</button>
                  ))}
                  <span className="atlas-tools-estimate">drive-time estimate</span>
                </div>
              )}

              <button type="button" className={showNetworkArcs ? "atlas-tools-toggle active" : "atlas-tools-toggle"} onClick={() => setShowNetworkArcs((value) => !value)}>
                <Route aria-hidden="true" />
                <span>
                  <strong>Luminous network paths</strong>
                  <small>Connect the search point to matching coverage</small>
                </span>
                <i aria-hidden="true" />
              </button>

              {selectedServices.length > 0 && (
                <button type="button" className="atlas-tools-clear" onClick={() => setSelectedServices([])}>Clear mission services</button>
              )}
            </div>
          )}
        </div>
      )}

      <Button type="button" className="atlas-request-button" onClick={() => openRequest(null)}>
        <ClipboardPlus /> Request service
      </Button>

      <GlassPanel className="atlas-disclaimer atlas-disclaimer-attention">
        <Info />
        <p><strong>The absence of a provider or service location within this Atlas does not necessarily indicate that Occu-Med is unable to coordinate or facilitate that service. Our network is continuously expanded and verified. Contact Occu-Med for confirmation, specialized requests, or locations not currently reflected here.</strong></p>
      </GlassPanel>

      <RequestServiceModal
        isOpen={requestOpen}
        onClose={() => setRequestOpen(false)}
        coverage={selectedCoverage}
        selectedService={selectedServices.length ? selectedServices.join(" + ") : null}
      />
    </div>
  );
}

function RequestServiceModal({
  isOpen,
  onClose,
  coverage,
  selectedService,
}: {
  isOpen: boolean;
  onClose: () => void;
  coverage: CoverageArea | null;
  selectedService: string | null;
}) {
  const { toast } = useToast();
  const { user } = useAuth();
  const createRequest = useCreateServiceRequest();
  const recordSearch = useRecordSearchEvent();
  const locationLabel = coverage ? `${coverage.city}, ${coverage.region}, ${coverage.country}` : "";

  const form = useForm<z.infer<typeof requestSchema>>({
    resolver: zodResolver(requestSchema),
    defaultValues: {
      clientName: user?.name ?? "",
      clientEmail: user?.email ?? "",
      clientPhone: "",
      employerCompany: user?.employerName ?? "",
      requestedService: selectedService ?? coverage?.services[0] ?? "",
      requestedLocation: locationLabel,
      urgency: "normal",
      notes: "",
    },
  });

  useEffect(() => {
    if (!isOpen) return;
    form.setValue("clientName", user?.name ?? form.getValues("clientName"));
    form.setValue("clientEmail", user?.email ?? form.getValues("clientEmail"));
    form.setValue("employerCompany", user?.employerName ?? form.getValues("employerCompany"));
    form.setValue("requestedLocation", locationLabel);
    form.setValue("requestedService", selectedService ?? coverage?.services[0] ?? "");
  }, [coverage, form, isOpen, locationLabel, selectedService, user]);

  const onSubmit = (data: z.infer<typeof requestSchema>) => {
    createRequest.mutate({ data }, {
      onSuccess: () => {
        recordSearch.mutate({
          data: {
            searchText: data.requestedLocation,
            selectedServiceType: data.requestedService,
            geocodedCity: coverage?.city ?? null,
            geocodedState: coverage?.region ?? null,
            geocodedCountry: coverage?.country ?? null,
            latitude: coverage?.latitude ?? null,
            longitude: coverage?.longitude ?? null,
            matchingProviderCount: coverage ? 1 : 0,
            zeroResultSearch: false,
            markerClicked: Boolean(coverage),
            requestSubmitted: true,
            employerName: data.employerCompany || null,
          },
        });
        toast({ title: "Request submitted", description: "Occu-Med will confirm availability and coordinate the service." });
        form.reset({
          clientName: user?.name ?? "",
          clientEmail: user?.email ?? "",
          clientPhone: "",
          employerCompany: user?.employerName ?? "",
          requestedService: "",
          requestedLocation: "",
          urgency: "normal",
          notes: "",
        });
        onClose();
      },
      onError: () => toast({ title: "Submission failed", description: "Please try again or contact Occu-Med directly.", variant: "destructive" }),
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="atlas-modal sm:max-w-[620px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Request service coordination</DialogTitle>
          <DialogDescription>Occu-Med will confirm the appropriate network location and coordinate the requested service.</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField control={form.control} name="clientName" render={({ field }) => <FormItem><FormLabel>Your name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>} />
              <FormField control={form.control} name="clientEmail" render={({ field }) => <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" {...field} /></FormControl><FormMessage /></FormItem>} />
              <FormField control={form.control} name="clientPhone" render={({ field }) => <FormItem><FormLabel>Phone</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>} />
              <FormField control={form.control} name="employerCompany" render={({ field }) => <FormItem><FormLabel>Employer</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>} />
              <FormField control={form.control} name="requestedService" render={({ field }) => <FormItem><FormLabel>Requested service</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>} />
              <FormField control={form.control} name="requestedLocation" render={({ field }) => <FormItem><FormLabel>Requested location</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>} />
              <FormField control={form.control} name="urgency" render={({ field }) => (
                <FormItem className="md:col-span-2">
                  <FormLabel>Urgency</FormLabel>
                  <FormControl>
                    <select {...field} className="atlas-native-select" aria-label="Urgency">
                      <option value="low">Low</option>
                      <option value="normal">Normal</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="notes" render={({ field }) => <FormItem className="md:col-span-2"><FormLabel>Additional details</FormLabel><FormControl><textarea className="atlas-textarea" rows={4} {...field} /></FormControl><FormMessage /></FormItem>} />
            </div>
            <Button type="submit" className="w-full atlas-modal-submit" disabled={createRequest.isPending}>{createRequest.isPending ? "Submitting…" : "Submit coordination request"}</Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
