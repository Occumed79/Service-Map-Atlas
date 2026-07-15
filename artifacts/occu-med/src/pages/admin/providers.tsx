import { useState } from "react";
import {
  getListProvidersQueryKey,
  useCreateProvider,
  useDeleteProvider,
  useListCategories,
  useListProviders,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { GlassPanel } from "@/components/ui/glass-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, MapPin, Plus, Search, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const emptyForm = {
  name: "",
  address: "",
  city: "",
  state: "",
  country: "US",
  postalCode: "",
  latitude: "",
  longitude: "",
  phone: "",
  email: "",
  website: "",
  availabilityNotes: "",
  coverageNotes: "",
  internalTags: "",
};

export default function AdminProviders() {
  const [search, setSearch] = useState("");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [serviceIds, setServiceIds] = useState<number[]>([]);
  const { data: providers = [], isLoading, error: providersError } = useListProviders({ search: search || undefined });
  const { data: categories = [], error: categoriesError } = useListCategories();
  const createProvider = useCreateProvider();
  const deleteProvider = useDeleteProvider();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const updateField = (field: keyof typeof emptyForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const resetForm = () => {
    setForm(emptyForm);
    setServiceIds([]);
  };

  const handleDelete = (id: number) => {
    if (!confirm("Delete this internal provider record?")) return;

    deleteProvider.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProvidersQueryKey() });
        toast({ title: "Provider deleted" });
      },
      onError: () => toast({ title: "Delete failed", variant: "destructive" }),
    });
  };

  const geocodeAddress = async () => {
    const query = [form.address, form.city, form.state, form.postalCode, form.country]
      .filter(Boolean)
      .join(", ");

    if (!query) {
      toast({ title: "Enter an address first" });
      return;
    }

    setIsGeocoding(true);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=1&q=${encodeURIComponent(query)}`,
        { headers: { Accept: "application/json" } },
      );
      const results = await response.json();
      const match = results?.[0];
      if (!match) {
        toast({ title: "Address not found", description: "Enter coordinates manually or refine the address." });
        return;
      }

      const lat = match.lat?.toString().trim();
      const lon = match.lon?.toString().trim();

      if (!lat || !lon) {
        toast({ title: "Invalid coordinates returned", variant: "destructive" });
        return;
      }

      const latitude = Number(lat);
      const longitude = Number(lon);

      if (!Number.isFinite(latitude) || !Number.isFinite(longitude) ||
          latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
        toast({ title: "Invalid coordinate values", variant: "destructive" });
        return;
      }

      setForm((current) => ({
        ...current,
        latitude: String(latitude),
        longitude: String(longitude),
        city: current.city || match.address?.city || match.address?.town || match.address?.village || "",
        state: current.state || match.address?.state || "",
        postalCode: current.postalCode || match.address?.postcode || "",
        country: current.country || match.address?.country_code?.toUpperCase() || "US",
      }));
      toast({ title: "Coordinates added" });
    } catch {
      toast({ title: "Geocoding failed", variant: "destructive" });
    } finally {
      setIsGeocoding(false);
    }
  };

  const handleCreate = () => {
    const hasUserEnteredAddress = form.address.trim() || form.city.trim() || form.state.trim() || form.postalCode.trim();
    const isDefaultCountryOnly = form.country === emptyForm.country && !hasUserEnteredAddress;

    if (!form.name || !form.address.trim() || !form.city.trim() || !form.state.trim() || !form.country.trim() || isDefaultCountryOnly) {
      toast({ title: "Complete the required provider and location fields", variant: "destructive" });
      return;
    }

    const latStr = form.latitude?.toString().trim();
    const lonStr = form.longitude?.toString().trim();

    if (!latStr || !lonStr) {
      toast({ title: "Valid coordinates are required", variant: "destructive" });
      return;
    }

    const latitude = Number(latStr);
    const longitude = Number(lonStr);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) ||
        latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      toast({ title: "Valid coordinates are required", variant: "destructive" });
      return;
    }

    if (serviceIds.length === 0) {
      toast({ title: "Select at least one service", variant: "destructive" });
      return;
    }

    createProvider.mutate({
      data: {
        name: form.name,
        address: form.address,
        city: form.city,
        state: form.state,
        country: form.country,
        postalCode: form.postalCode || undefined,
        latitude,
        longitude,
        phone: form.phone || undefined,
        email: form.email || undefined,
        website: form.website || undefined,
        availabilityNotes: form.availabilityNotes || undefined,
        coverageNotes: form.coverageNotes || undefined,
        internalTags: form.internalTags || undefined,
        active: true,
        serviceIds,
      },
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProvidersQueryKey() });
        toast({ title: "Provider added", description: "The internal record is available to the sanitized coverage layer." });
        resetForm();
        setIsAddOpen(false);
      },
      onError: () => toast({ title: "Provider could not be added", variant: "destructive" }),
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Provider Network</h1>
          <p className="text-sm text-muted-foreground mt-1">Internal records are never exposed by name on the client Atlas.</p>
        </div>
        <Button onClick={() => setIsAddOpen(true)}>
          <Plus className="w-4 h-4 mr-2" /> Add provider
        </Button>
      </div>

      <GlassPanel className="p-4 flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search internal provider records"
            className="pl-9 bg-white/60"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </GlassPanel>

      <GlassPanel className="p-0 overflow-hidden">
        <Table>
          <TableHeader className="bg-white/35">
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Services</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {providersError ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-destructive">Failed to load providers. Please try again.</TableCell></TableRow>
            ) : isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading providers…</TableCell></TableRow>
            ) : providers.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No providers found.</TableCell></TableRow>
            ) : providers.map((provider) => (
              <TableRow key={provider.id}>
                <TableCell className="font-medium">{provider.name}</TableCell>
                <TableCell>{provider.city}, {provider.state}</TableCell>
                <TableCell>
                  <div className="text-sm">
                    <div>{provider.email || "—"}</div>
                    <div className="text-muted-foreground">{provider.phone || "—"}</div>
                  </div>
                </TableCell>
                <TableCell className="max-w-[280px]">
                  <div className="flex flex-wrap gap-1">
                    {provider.services?.slice(0, 4).map((service) => (
                      <span key={service} className="px-2 py-1 rounded-full bg-secondary text-[10px]">{service}</span>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  <span className={provider.active ? "px-2 py-1 rounded-full text-xs bg-emerald-600/10 text-emerald-700" : "px-2 py-1 rounded-full text-xs bg-destructive/10 text-destructive"}>
                    {provider.active ? "Active" : "Inactive"}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(provider.id)} aria-label={`Delete ${provider.name}`}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </GlassPanel>

      <Dialog open={isAddOpen} onOpenChange={(open) => { setIsAddOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="atlas-modal sm:max-w-[760px] max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add internal provider record</DialogTitle>
            <DialogDescription>
              Provider identity stays inside the admin system. Client users receive only aggregated service coverage.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
            <Field id="provider-name" label="Provider / clinic name *" value={form.name} onChange={(value) => updateField("name", value)} />
            <Field id="provider-country" label="Country *" value={form.country} onChange={(value) => updateField("country", value)} />
            <div className="md:col-span-2"><Field id="provider-address" label="Street address *" value={form.address} onChange={(value) => updateField("address", value)} /></div>
            <Field id="provider-city" label="City *" value={form.city} onChange={(value) => updateField("city", value)} />
            <Field id="provider-state" label="State / region *" value={form.state} onChange={(value) => updateField("state", value)} />
            <Field id="provider-postal" label="Postal code" value={form.postalCode} onChange={(value) => updateField("postalCode", value)} />
            <div className="flex items-end">
              <Button type="button" variant="secondary" className="w-full" onClick={geocodeAddress} disabled={isGeocoding}>
                {isGeocoding ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <MapPin className="w-4 h-4 mr-2" />}
                Find coordinates
              </Button>
            </div>
            <Field id="provider-latitude" label="Latitude *" value={form.latitude} onChange={(value) => updateField("latitude", value)} />
            <Field id="provider-longitude" label="Longitude *" value={form.longitude} onChange={(value) => updateField("longitude", value)} />
            <Field id="provider-phone" label="Phone" value={form.phone} onChange={(value) => updateField("phone", value)} />
            <Field id="provider-email" label="Email" value={form.email} onChange={(value) => updateField("email", value)} />
            <div className="md:col-span-2"><Field id="provider-website" label="Website" value={form.website} onChange={(value) => updateField("website", value)} /></div>
            <div className="md:col-span-2"><Field id="provider-availability" label="Availability notes" value={form.availabilityNotes} onChange={(value) => updateField("availabilityNotes", value)} /></div>
            <div className="md:col-span-2"><Field id="provider-coverage" label="Coverage notes" value={form.coverageNotes} onChange={(value) => updateField("coverageNotes", value)} /></div>
            <div className="md:col-span-2"><Field id="provider-tags" label="Internal tags" value={form.internalTags} onChange={(value) => updateField("internalTags", value)} /></div>
          </div>

          <div className="mt-5">
            <Label>Services offered *</Label>
            {categoriesError ? (
              <div className="text-destructive text-sm mt-2">Failed to load service categories. Please close and try again.</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 mt-2">
                {categories.map((category) => (
                  <label key={category.id} className="flex items-center gap-2 rounded-xl border bg-white/55 px-3 py-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={serviceIds.includes(category.id)}
                      onCheckedChange={(checked) => {
                        setServiceIds((current) => checked
                          ? [...current, category.id]
                          : current.filter((id) => id !== category.id));
                      }}
                    />
                    {category.name}
                  </label>
                ))}
              </div>
            )}
          </div>

          <Button className="w-full mt-6" onClick={handleCreate} disabled={createProvider.isPending || !!categoriesError}>
            {createProvider.isPending ? "Adding provider…" : "Add provider to internal network"}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, value, onChange, id }: { label: string; value: string; onChange: (value: string) => void; id: string }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} onChange={(event) => onChange(event.target.value)} className="bg-white/65" />
    </div>
  );
}
