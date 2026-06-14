import { useState, useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { motion, AnimatePresence } from "framer-motion";
import { Search, MapPin, Navigation, Info, Phone, Activity } from "lucide-react";
import { useListProviders, useRecordSearchEvent, useCreateServiceRequest } from "@workspace/api-client-react";
import { GlassPanel } from "@/components/ui/glass-panel";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

const SERVICE_CATEGORIES = [
  "Dental", "Chest X-Ray", "B-Reader", "Spirometry", "Pulmonary Function Testing",
  "Drug Screen", "DOT Physical", "Audiogram", "EKG", "Treadmill Stress Test",
  "Laboratory Services", "Titers", "Vaccinations", "Physical Examination",
  "Vision Testing", "Occupational Medicine", "Specialty Services"
];

const customIcon = new L.DivIcon({
  className: "glowing-marker-container",
  html: `<div class="glowing-marker"></div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});


function MapUpdater({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo(center, zoom);
  }, [center, zoom, map]);
  return null;
}

export default function Home() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>([39.8283, -98.5795]); // US Center
  const [mapZoom, setMapZoom] = useState(4);
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<any>(null);

  const { data: providers = [] } = useListProviders({
    serviceType: selectedService || undefined,
    search: searchQuery || undefined,
    active: true
  });

  const recordSearch = useRecordSearchEvent();

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery) return;

    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}`);
      const data = await res.json();
      if (data && data.length > 0) {
        const lat = parseFloat(data[0].lat);
        const lon = parseFloat(data[0].lon);
        setMapCenter([lat, lon]);
        setMapZoom(10);
        
        recordSearch.mutate({
          data: {
            searchText: searchQuery,
            selectedServiceType: selectedService,
            latitude: lat,
            longitude: lon,
            matchingProviderCount: providers.length,
            zeroResultSearch: providers.length === 0,
            markerClicked: false,
            requestSubmitted: false
          }
        });
      }
    } catch (error) {
      console.error("Geocoding failed", error);
    }
  };

  return (
    <div className="relative w-full h-screen overflow-hidden bg-background">
      <MapContainer
        center={mapCenter}
        zoom={mapZoom}
        className="w-full h-full z-0"
        zoomControl={false}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        />
        <MapUpdater center={mapCenter} zoom={mapZoom} />
        
        {providers.map((provider) => (
          <Marker 
            key={provider.id} 
            position={[provider.latitude, provider.longitude]} 
            icon={customIcon}
            eventHandlers={{
              click: () => {
                recordSearch.mutate({
                  data: {
                    searchText: searchQuery || "map_click",
                    selectedServiceType: selectedService,
                    matchingProviderCount: providers.length,
                    zeroResultSearch: false,
                    markerClicked: true,
                    requestSubmitted: false
                  }
                });
              }
            }}
          >
            <Popup className="premium-popup">
              <div className="p-2">
                <h3 className="font-bold text-lg mb-1">{provider.name}</h3>
                <p className="text-sm text-muted-foreground mb-3">{provider.city}, {provider.state}</p>
                
                <div className="space-y-2 mb-4">
                  <div className="flex flex-wrap gap-1">
                    {provider.services?.slice(0, 3).map((s: string) => (
                      <span key={s} className="text-[10px] bg-primary/20 text-primary px-2 py-1 rounded-full">
                        {s}
                      </span>
                    ))}
                    {(provider.services?.length || 0) > 3 && (
                      <span className="text-[10px] bg-secondary text-secondary-foreground px-2 py-1 rounded-full">
                        +{(provider.services?.length || 0) - 3} more
                      </span>
                    )}
                  </div>
                </div>
                
                <Button 
                  className="w-full" 
                  size="sm"
                  onClick={() => {
                    setSelectedProvider(provider);
                    setIsRequestModalOpen(true);
                  }}
                >
                  Request Service
                </Button>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* Floating Header / Search */}
      <div className="absolute top-0 left-0 right-0 z-10 p-6 pointer-events-none flex flex-col items-center gap-4">
        <GlassPanel className="w-full max-w-2xl p-2 pointer-events-auto flex items-center gap-2">
          <form onSubmit={handleSearch} className="flex-1 flex items-center relative">
            <Search className="absolute left-3 w-5 h-5 text-muted-foreground" />
            <Input 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search locations, zip codes, or coordinates..." 
              className="pl-10 border-none bg-transparent focus-visible:ring-0 text-lg"
            />
            <Button type="submit" variant="ghost" size="icon" className="absolute right-1">
              <Navigation className="w-5 h-5 text-primary" />
            </Button>
          </form>
        </GlassPanel>

        {/* Filter Chips */}
        <div className="w-full max-w-5xl overflow-x-auto pb-4 pointer-events-auto hide-scrollbar">
          <div className="flex items-center gap-2 px-4">
            {SERVICE_CATEGORIES.map(category => (
              <button
                key={category}
                onClick={() => setSelectedService(selectedService === category ? null : category)}
                className={`whitespace-nowrap px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 border backdrop-blur-md ${
                  selectedService === category 
                    ? "bg-primary text-primary-foreground border-primary shadow-[0_0_15px_rgba(var(--primary),0.5)]" 
                    : "bg-card/40 text-foreground border-white/10 hover:bg-card/60"
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Floating Action Buttons */}
      <div className="absolute top-1/2 right-6 -translate-y-1/2 flex flex-col gap-4 z-10 pointer-events-auto">
        <Button 
          size="lg" 
          className="rounded-full w-14 h-14 shadow-lg shadow-primary/20"
          onClick={() => {
            setSelectedProvider(null);
            setIsRequestModalOpen(true);
          }}
          title="Request Service"
        >
          <Activity className="w-6 h-6" />
        </Button>
        <Button 
          variant="secondary"
          size="lg" 
          className="rounded-full w-14 h-14 glass-panel border-none"
          title="Contact Support"
        >
          <Phone className="w-6 h-6" />
        </Button>
      </div>

      {/* Disclaimer Panel */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 pointer-events-auto w-full max-w-4xl px-4">
        <GlassPanel className="p-4 flex items-start gap-3 text-xs text-muted-foreground">
          <Info className="w-5 h-5 shrink-0 text-primary mt-0.5" />
          <p>
            The absence of a provider or service location within this portal does not necessarily indicate that Occu-Med is unable to coordinate or facilitate that service. While we continuously expand and update our provider network database, some providers, locations, or services may not yet be reflected within the platform. Clients are encouraged to contact Occu-Med directly for assistance.
          </p>
        </GlassPanel>
      </div>

      <RequestServiceModal 
        isOpen={isRequestModalOpen} 
        onClose={() => setIsRequestModalOpen(false)}
        provider={selectedProvider}
      />
    </div>
  );
}

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

function RequestServiceModal({ isOpen, onClose, provider }: { isOpen: boolean, onClose: () => void, provider: any }) {
  const { toast } = useToast();
  const createRequest = useCreateServiceRequest();
  const recordSearch = useRecordSearchEvent();
  
  const form = useForm<z.infer<typeof requestSchema>>({
    resolver: zodResolver(requestSchema),
    defaultValues: {
      clientName: "",
      clientEmail: "",
      clientPhone: "",
      employerCompany: "",
      requestedService: "",
      requestedLocation: provider ? `${provider.city}, ${provider.state}` : "",
      urgency: "normal",
      notes: provider ? `Requested specific provider: ${provider.name} (ID: ${provider.id})` : "",
    }
  });

  // Update default values if provider changes
  useEffect(() => {
    if (provider) {
      form.setValue("requestedLocation", `${provider.city}, ${provider.state}`);
      const currentNotes = form.getValues("notes");
      if (!currentNotes?.includes(provider.name)) {
         form.setValue("notes", `Requested specific provider: ${provider.name} (ID: ${provider.id})\n${currentNotes || ""}`);
      }
    }
  }, [provider, form]);

  const onSubmit = (data: z.infer<typeof requestSchema>) => {
    createRequest.mutate({ data }, {
      onSuccess: () => {
        toast({
          title: "Request Submitted",
          description: "Our coordination team will contact you shortly.",
        });
        
        recordSearch.mutate({
          data: {
            searchText: "service_request",
            matchingProviderCount: 0,
            zeroResultSearch: false,
            markerClicked: false,
            requestSubmitted: true
          }
        });
        
        form.reset();
        onClose();
      },
      onError: () => {
        toast({
          title: "Submission Failed",
          description: "There was an error submitting your request. Please try again.",
          variant: "destructive"
        });
      }
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="glass-panel border-white/10 sm:max-w-[600px] p-0 overflow-hidden">
        <div className="p-6 bg-card/80 backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-primary">Request Coordination Service</DialogTitle>
            <DialogDescription>
              Submit a request for occupational health services. Our team will coordinate the details.
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="clientName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Your Name</FormLabel>
                      <FormControl>
                        <Input placeholder="John Doe" className="bg-background/50 border-white/10" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="clientEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email Address</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="john@company.com" className="bg-background/50 border-white/10" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="employerCompany"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Company</FormLabel>
                      <FormControl>
                        <Input placeholder="Acme Corp" className="bg-background/50 border-white/10" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="clientPhone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone Number (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="(555) 123-4567" className="bg-background/50 border-white/10" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="requestedService"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Requested Service</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="bg-background/50 border-white/10">
                            <SelectValue placeholder="Select a service" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="bg-card border-white/10">
                          {SERVICE_CATEGORIES.map(cat => (
                            <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="urgency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Urgency</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="bg-background/50 border-white/10">
                            <SelectValue placeholder="Select urgency" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="bg-card border-white/10">
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="normal">Normal</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                          <SelectItem value="urgent">Urgent</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="requestedLocation"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Location</FormLabel>
                    <FormControl>
                      <Input placeholder="City, State or Zip Code" className="bg-background/50 border-white/10" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end pt-4 gap-2">
                <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
                <Button type="submit" disabled={createRequest.isPending}>
                  {createRequest.isPending ? "Submitting..." : "Submit Request"}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
