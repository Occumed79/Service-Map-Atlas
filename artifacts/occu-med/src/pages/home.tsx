import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClipboardPlus, Info, Navigation, Search } from "lucide-react";
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
import { AtlasArcgisMap, type CoverageArea } from "@/components/atlas-arcgis-map";

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

export default function Home() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>([18, 0]);
  const [mapZoom, setMapZoom] = useState(2);
  const [requestOpen, setRequestOpen] = useState(false);
  const [selectedCoverage, setSelectedCoverage] = useState<CoverageArea | null>(null);
  const [searchLabel, setSearchLabel] = useState("Worldwide");
  const [mapStatus, setMapStatus] = useState<"loading" | "ready" | "error">("loading");
  const [mapError, setMapError] = useState<string | null>(null);
  const { toast } = useToast();
  const recordSearch = useRecordSearchEvent();

  const { data: coverageAreas = [], isLoading } = useQuery<CoverageArea[]>({
    queryKey: ["coverage-areas", selectedService],
    queryFn: async () => {
      const query = selectedService ? `?serviceType=${encodeURIComponent(selectedService)}` : "";
      const response = await fetch(`/api/coverage${query}`, { credentials: "include" });
      if (!response.ok) throw new Error("Coverage could not be loaded");
      return response.json();
    },
  });

  const totalServices = useMemo(() => new Set(coverageAreas.flatMap((area) => area.services)).size, [coverageAreas]);

  const handleSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    const query = searchQuery.trim();
    if (!query) return;

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=1&q=${encodeURIComponent(query)}`,
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
      const nearbyCount = coverageAreas.filter((area) => distanceMiles(center, [area.latitude, area.longitude]) <= 75).length;
      setMapCenter(center);
      setMapZoom(9);
      setSearchLabel(match.display_name ?? query);

      recordSearch.mutate({
        data: {
          searchText: query,
          selectedServiceType: selectedService,
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

  const openRequest = (coverage: CoverageArea | null) => {
    setSelectedCoverage(coverage);
    setRequestOpen(true);
  };

  const handleMarkerClick = (area: CoverageArea) => {
    recordSearch.mutate({
      data: {
        searchText: searchQuery || "map_coverage_selection",
        selectedServiceType: selectedService,
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

  return (
    <div className="atlas-shell">
      <AtlasArcgisMap
        center={mapCenter}
        zoom={mapZoom}
        coverageAreas={coverageAreas}
        onMarkerClick={handleMarkerClick}
        onRequestCoverage={openRequest}
        onStatusChange={(status, message) => {
          setMapStatus(status);
          setMapError(message ?? null);
        }}
      />

      {mapStatus === "loading" && (
        <div className="atlas-map-status" role="status">
          Loading ArcGIS map…
        </div>
      )}

      {mapStatus === "error" && (
        <div className="atlas-map-status atlas-map-status-error" role="alert">
          ArcGIS map failed to load{mapError ? `: ${mapError}` : "."} Ensure VITE_ARCGIS_API_KEY is set on the server and the webmap is accessible.
        </div>
      )}

      <header className="atlas-header atlas-header-search-only">
        <GlassPanel className="atlas-search-panel">
          <form onSubmit={handleSearch}>
            <Search className="atlas-search-icon" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search any address, city, postal code, or country"
              className="atlas-search-input"
            />
            <Button type="submit" className="atlas-search-button" aria-label="Search map"><Navigation /></Button>
          </form>
        </GlassPanel>

        <div className="atlas-filter-rail" aria-label="Service filters">
          <button type="button" className={!selectedService ? "atlas-filter active" : "atlas-filter"} onClick={() => setSelectedService(null)}>All services</button>
          {SERVICE_CATEGORIES.map((category) => (
            <button
              type="button"
              key={category}
              className={selectedService === category ? "atlas-filter active" : "atlas-filter"}
              onClick={() => setSelectedService(selectedService === category ? null : category)}
            >
              {category}
            </button>
          ))}
        </div>
      </header>

      <GlassPanel className="atlas-summary-card" title={searchLabel}>
        <span className="atlas-summary-location">{isLoading ? "Loading" : searchLabel}</span>
        <strong>{coverageAreas.length} areas · {totalServices} services</strong>
      </GlassPanel>

      <Button type="button" className="atlas-request-button" onClick={() => openRequest(null)}>
        <ClipboardPlus /> Request service
      </Button>

      <GlassPanel className="atlas-disclaimer atlas-disclaimer-attention">
        <Info />
        <p><strong>The absence of a provider or service location within this Atlas does not necessarily indicate that Occu-Med is unable to coordinate or facilitate that service. Our network is continuously expanded and verified. Contact Occu-Med for confirmation, specialized requests, or locations not currently reflected here.</strong></p>
      </GlassPanel>

      <RequestServiceModal isOpen={requestOpen} onClose={() => setRequestOpen(false)} coverage={selectedCoverage} selectedService={selectedService} />
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
