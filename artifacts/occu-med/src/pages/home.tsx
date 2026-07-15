import { useEffect, useMemo, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import { useQuery } from "@tanstack/react-query";
import L from "leaflet";
import { Activity, Info, Layers3, Navigation, Search, ShieldCheck } from "lucide-react";
import { useCreateServiceRequest, useRecordSearchEvent } from "@workspace/api-client-react";
import { GlassPanel } from "@/components/ui/glass-panel";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useToast } from "@/hooks/use-toast";
import * as z from "zod";

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

type CoverageArea = {
  id: string;
  city: string;
  region: string;
  country: string;
  latitude: number;
  longitude: number;
  services: string[];
  availability: "coordination_available";
};

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

const SERVICE_COLORS: Record<string, string> = {
  Dental: "#f07167",
  "Chest X-Ray": "#4f8fcf",
  "B-Reader": "#4f8fcf",
  Spirometry: "#2a9d8f",
  "Pulmonary Function Testing": "#2a9d8f",
  "Drug Screen": "#7b61a8",
  "DOT Physical": "#3a9b6f",
  Audiogram: "#d08a38",
  EKG: "#d95d67",
  "Treadmill Stress Test": "#d95d67",
  "Laboratory Services": "#7b61a8",
  Titers: "#7b61a8",
  Vaccinations: "#3a9b6f",
  "Physical Examination": "#3a9b6f",
  "Vision Testing": "#4f8fcf",
  "Occupational Medicine": "#346b87",
  "Specialty Services": "#6b7280",
};

function iconForCoverage(area: CoverageArea) {
  const primaryService = area.services[0] ?? "Specialty Services";
  const color = SERVICE_COLORS[primaryService] ?? SERVICE_COLORS["Specialty Services"];

  return new L.DivIcon({
    className: "coverage-marker-shell",
    html: `<span class="coverage-marker" style="--coverage-color:${color}"><span class="coverage-marker-core"></span></span>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -12],
  });
}

function MapUpdater({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();

  useEffect(() => {
    map.flyTo(center, zoom, { duration: 1.15 });
  }, [center, map, zoom]);

  return null;
}

function distanceMiles(a: [number, number], b: [number, number]) {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadiusMiles = 3958.8;
  const dLat = toRadians(b[0] - a[0]);
  const dLon = toRadians(b[1] - a[1]);
  const lat1 = toRadians(a[0]);
  const lat2 = toRadians(b[0]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return 2 * earthRadiusMiles * Math.asin(Math.sqrt(h));
}

export default function Home() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>([18, 0]);
  const [mapZoom, setMapZoom] = useState(2);
  const [requestOpen, setRequestOpen] = useState(false);
  const [selectedCoverage, setSelectedCoverage] = useState<CoverageArea | null>(null);
  const [searchLabel, setSearchLabel] = useState("Worldwide coverage");
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

  const totalServices = useMemo(
    () => new Set(coverageAreas.flatMap((area) => area.services)).size,
    [coverageAreas],
  );

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
      const nearbyCount = coverageAreas.filter((area) =>
        distanceMiles(center, [area.latitude, area.longitude]) <= 75,
      ).length;

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

  return (
    <div className="atlas-shell">
      <MapContainer center={mapCenter} zoom={mapZoom} className="atlas-map" zoomControl={false} minZoom={2}>
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        />
        <MapUpdater center={mapCenter} zoom={mapZoom} />

        {coverageAreas.map((area) => (
          <Marker
            key={area.id}
            position={[area.latitude, area.longitude]}
            icon={iconForCoverage(area)}
            eventHandlers={{
              click: () => {
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
              },
            }}
          >
            <Popup className="atlas-popup">
              <div className="coverage-popup">
                <div className="coverage-popup-kicker">Occu-Med network capability</div>
                <h3>Service coordination available</h3>
                <p>{area.city}, {area.region}{area.country ? ` · ${area.country}` : ""}</p>
                <div className="coverage-service-list">
                  {area.services.slice(0, 6).map((service) => (
                    <span key={service}>{service}</span>
                  ))}
                </div>
                <p className="coverage-popup-note">
                  Provider identity and final availability are confirmed by Occu-Med during coordination.
                </p>
                <Button className="w-full" size="sm" onClick={() => openRequest(area)}>
                  Request confirmation
                </Button>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      <header className="atlas-header">
        <GlassPanel className="atlas-brand-panel">
          <div className="atlas-brand-mark"><Layers3 /></div>
          <div>
            <div className="atlas-eyebrow">Occu-Med</div>
            <h1>Global Coverage Atlas</h1>
          </div>
          <div className="atlas-live-status"><span /> Network intelligence</div>
        </GlassPanel>

        <GlassPanel className="atlas-search-panel">
          <form onSubmit={handleSearch}>
            <Search className="atlas-search-icon" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search any address, city, postal code, or country"
              className="atlas-search-input"
            />
            <Button type="submit" className="atlas-search-button" aria-label="Search map">
              <Navigation />
            </Button>
          </form>
        </GlassPanel>

        <div className="atlas-filter-rail" aria-label="Service filters">
          <button
            className={!selectedService ? "atlas-filter active" : "atlas-filter"}
            onClick={() => setSelectedService(null)}
          >
            All services
          </button>
          {SERVICE_CATEGORIES.map((category) => (
            <button
              key={category}
              className={selectedService === category ? "atlas-filter active" : "atlas-filter"}
              onClick={() => setSelectedService(selectedService === category ? null : category)}
            >
              {category}
            </button>
          ))}
        </div>
      </header>

      <GlassPanel className="atlas-summary-card">
        <div className="atlas-summary-icon"><ShieldCheck /></div>
        <div>
          <span>{isLoading ? "Loading coverage" : searchLabel}</span>
          <strong>{coverageAreas.length} coverage areas · {totalServices} service types</strong>
        </div>
      </GlassPanel>

      <Button className="atlas-request-button" onClick={() => openRequest(null)}>
        <Activity />
        Request service
      </Button>

      <GlassPanel className="atlas-disclaimer">
        <Info />
        <p>
          The absence of a provider or service location within this Atlas does not necessarily indicate that Occu-Med is unable to coordinate or facilitate that service. Our network is continuously expanded and verified. Contact Occu-Med for confirmation, specialized requests, or locations not currently reflected here.
        </p>
      </GlassPanel>

      <RequestServiceModal
        isOpen={requestOpen}
        onClose={() => setRequestOpen(false)}
        coverage={selectedCoverage}
        selectedService={selectedService}
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
  const createRequest = useCreateServiceRequest();
  const recordSearch = useRecordSearchEvent();
  const locationLabel = coverage ? `${coverage.city}, ${coverage.region}, ${coverage.country}` : "";

  const form = useForm<z.infer<typeof requestSchema>>({
    resolver: zodResolver(requestSchema),
    defaultValues: {
      clientName: "",
      clientEmail: "",
      clientPhone: "",
      employerCompany: "",
      requestedService: selectedService ?? coverage?.services[0] ?? "",
      requestedLocation: locationLabel,
      urgency: "normal",
      notes: "",
    },
  });

  useEffect(() => {
    if (!isOpen) return;
    form.setValue("requestedLocation", locationLabel);
    form.setValue("requestedService", selectedService ?? coverage?.services[0] ?? "");
  }, [coverage, form, isOpen, locationLabel, selectedService]);

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
        form.reset();
        onClose();
      },
      onError: () => {
        toast({ title: "Submission failed", description: "Please try again or contact Occu-Med directly.", variant: "destructive" });
      },
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="atlas-modal sm:max-w-[620px]">
        <DialogHeader>
          <DialogTitle>Request service coordination</DialogTitle>
          <DialogDescription>
            Occu-Med will confirm the appropriate network location and coordinate the requested service.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField control={form.control} name="clientName" render={({ field }) => (
                <FormItem><FormLabel>Your name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="clientEmail" render={({ field }) => (
                <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="clientPhone" render={({ field }) => (
                <FormItem><FormLabel>Phone</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="employerCompany" render={({ field }) => (
                <FormItem><FormLabel>Employer</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="requestedService" render={({ field }) => (
                <FormItem><FormLabel>Requested service</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="requestedLocation" render={({ field }) => (
                <FormItem><FormLabel>Requested location</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="urgency" render={({ field }) => (
                <FormItem className="md:col-span-2"><FormLabel>Urgency</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select><FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem className="md:col-span-2"><FormLabel>Additional details</FormLabel><FormControl><textarea className="atlas-textarea" rows={4} {...field} /></FormControl><FormMessage /></FormItem>
              )} />
            </div>
            <Button type="submit" className="w-full" disabled={createRequest.isPending}>
              {createRequest.isPending ? "Submitting…" : "Submit coordination request"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
