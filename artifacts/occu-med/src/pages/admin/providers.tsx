import { useMemo, useState } from "react";
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
import { AlertCircle, Database, Download, FileSpreadsheet, LayoutGrid, Loader2, MapPin, Plus, Search, Trash2, Upload } from "lucide-react";
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

type ProviderView = "coverage" | "records" | "import";

type BulkProviderInput = {
  name: string;
  address: string;
  city: string;
  state: string;
  country: string;
  postalCode?: string;
  latitude: number;
  longitude: number;
  phone?: string;
  email?: string;
  website?: string;
  availabilityNotes?: string;
  coverageNotes?: string;
  internalTags?: string;
  active: boolean;
  serviceIds: number[];
};

type SpreadsheetModule = {
  read: (data: ArrayBuffer, options: { type: "array" }) => { SheetNames: string[]; Sheets: Record<string, unknown> };
  utils: {
    sheet_to_json: (sheet: unknown, options: { defval: string }) => Record<string, unknown>[];
    json_to_sheet: (rows: Record<string, string>[]) => unknown;
    book_new: () => unknown;
    book_append_sheet: (book: unknown, sheet: unknown, name: string) => void;
  };
  writeFile: (book: unknown, fileName: string) => void;
};

async function loadSpreadsheetModule() {
  const moduleUrl = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm";
  return import(/* @vite-ignore */ moduleUrl) as Promise<SpreadsheetModule>;
}

function normalizedRow(row: Record<string, unknown>) {
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    normalized[key.toLowerCase().replace(/[^a-z0-9]/g, "")] = value;
  }
  return normalized;
}

function rowValue(row: Record<string, unknown>, ...aliases: string[]) {
  for (const alias of aliases) {
    const value = row[alias.toLowerCase().replace(/[^a-z0-9]/g, "")];
    if (value !== undefined && value !== null && String(value).trim() !== "") return String(value).trim();
  }
  return "";
}

export default function AdminProviders() {
  const [view, setView] = useState<ProviderView>("coverage");
  const [search, setSearch] = useState("");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [serviceIds, setServiceIds] = useState<number[]>([]);
  const [bulkRows, setBulkRows] = useState<BulkProviderInput[]>([]);
  const [bulkErrors, setBulkErrors] = useState<string[]>([]);
  const [bulkFileName, setBulkFileName] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const { data: providers = [], isLoading } = useListProviders({ search: search || undefined });
  const { data: categories = [] } = useListCategories();
  const createProvider = useCreateProvider();
  const deleteProvider = useDeleteProvider();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const clientCoverage = useMemo(() => {
    const byService = new Map<string, { service: string; providerCount: number; areas: Set<string> }>();
    for (const provider of providers.filter((item) => item.active)) {
      const area = [provider.city, provider.state, provider.country].filter(Boolean).join(", ");
      for (const service of provider.services || []) {
        const current = byService.get(service) || { service, providerCount: 0, areas: new Set<string>() };
        current.providerCount += 1;
        current.areas.add(area);
        byService.set(service, current);
      }
    }
    return Array.from(byService.values())
      .map((item) => ({ ...item, areaList: Array.from(item.areas).sort() }))
      .sort((a, b) => a.service.localeCompare(b.service));
  }, [providers]);

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
    const query = [form.address, form.city, form.state, form.postalCode, form.country].filter(Boolean).join(", ");
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

      setForm((current) => ({
        ...current,
        latitude: String(match.lat),
        longitude: String(match.lon),
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
    const latitude = Number(form.latitude);
    const longitude = Number(form.longitude);
    if (!form.name || !form.address || !form.city || !form.state || !form.country) {
      toast({ title: "Complete the required provider and location fields", variant: "destructive" });
      return;
    }
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
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
        toast({ title: "Provider added", description: "Its services now feed the client-facing coverage layer." });
        resetForm();
        setIsAddOpen(false);
      },
      onError: () => toast({ title: "Provider could not be added", variant: "destructive" }),
    });
  };

  const parseSpreadsheet = async (file: File) => {
    setIsParsing(true);
    setBulkErrors([]);
    setBulkRows([]);
    setBulkFileName(file.name);

    try {
      const XLSX = await loadSpreadsheetModule();
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json(firstSheet, { defval: "" });
      const categoryIndex = new Map(categories.map((category) => [category.name.toLowerCase(), category.id]));
      const parsedRows: BulkProviderInput[] = [];
      const errors: string[] = [];

      rawRows.forEach((rawRow, index) => {
        const rowNumber = index + 2;
        const row = normalizedRow(rawRow);
        const name = rowValue(row, "Provider Name", "Clinic Name", "Name");
        const address = rowValue(row, "Street Address", "Address");
        const city = rowValue(row, "City");
        const state = rowValue(row, "State Region", "State", "Region");
        const country = rowValue(row, "Country") || "US";
        const latitude = Number(rowValue(row, "Latitude", "Lat"));
        const longitude = Number(rowValue(row, "Longitude", "Lng", "Lon"));
        const serviceNames = rowValue(row, "Services", "Services Offered", "Service Types")
          .split(/[;,|]/)
          .map((service) => service.trim())
          .filter(Boolean);
        const unknownServices = serviceNames.filter((service) => !categoryIndex.has(service.toLowerCase()));
        const matchedServiceIds = serviceNames
          .map((service) => categoryIndex.get(service.toLowerCase()))
          .filter((id): id is number => typeof id === "number");

        const rowProblems: string[] = [];
        if (!name) rowProblems.push("provider name");
        if (!address) rowProblems.push("street address");
        if (!city) rowProblems.push("city");
        if (!state) rowProblems.push("state/region");
        if (!Number.isFinite(latitude)) rowProblems.push("valid latitude");
        if (!Number.isFinite(longitude)) rowProblems.push("valid longitude");
        if (matchedServiceIds.length === 0) rowProblems.push("at least one recognized service");
        if (unknownServices.length) rowProblems.push(`unknown services: ${unknownServices.join(", ")}`);

        if (rowProblems.length) {
          errors.push(`Row ${rowNumber}: ${rowProblems.join("; ")}`);
          return;
        }

        parsedRows.push({
          name,
          address,
          city,
          state,
          country,
          postalCode: rowValue(row, "Postal Code", "Zip", "Zip Code") || undefined,
          latitude,
          longitude,
          phone: rowValue(row, "Phone") || undefined,
          email: rowValue(row, "Email") || undefined,
          website: rowValue(row, "Website", "URL") || undefined,
          availabilityNotes: rowValue(row, "Availability Notes") || undefined,
          coverageNotes: rowValue(row, "Coverage Notes") || undefined,
          internalTags: rowValue(row, "Internal Tags", "Tags") || undefined,
          active: true,
          serviceIds: matchedServiceIds,
        });
      });

      setBulkRows(parsedRows);
      setBulkErrors(errors);
      if (!parsedRows.length) toast({ title: "No valid provider rows found", variant: "destructive" });
    } catch {
      setBulkErrors(["The spreadsheet could not be read. Use the provided template and upload an .xlsx, .xls, or .csv file."]);
    } finally {
      setIsParsing(false);
    }
  };

  const downloadTemplate = async () => {
    try {
      const XLSX = await loadSpreadsheetModule();
      const sheet = XLSX.utils.json_to_sheet([{
        "Provider Name": "Example Clinic",
        "Street Address": "123 Main Street",
        City: "Fresno",
        "State / Region": "CA",
        Country: "US",
        "Postal Code": "93721",
        Latitude: "36.7378",
        Longitude: "-119.7871",
        Phone: "",
        Email: "",
        Website: "",
        "Availability Notes": "",
        "Coverage Notes": "",
        "Internal Tags": "",
        Services: "Dental; Physical Examination",
      }]);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, sheet, "Providers");
      XLSX.writeFile(workbook, "occu-med-provider-import-template.xlsx");
    } catch {
      toast({ title: "Template could not be generated", variant: "destructive" });
    }
  };

  const uploadBulkProviders = async () => {
    if (!bulkRows.length || bulkErrors.length) {
      toast({ title: "Resolve spreadsheet errors before importing", variant: "destructive" });
      return;
    }

    setIsUploading(true);
    try {
      const response = await fetch("/api/providers/bulk", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providers: bulkRows }),
      });
      const payload = await response.json().catch(() => null) as { createdCount?: number; error?: string } | null;
      if (!response.ok) throw new Error(payload?.error || "Bulk import failed");
      await queryClient.invalidateQueries({ queryKey: getListProvidersQueryKey() });
      toast({ title: `${payload?.createdCount || bulkRows.length} providers imported` });
      setBulkRows([]);
      setBulkErrors([]);
      setBulkFileName("");
      setView("coverage");
    } catch (error) {
      toast({ title: "Bulk import failed", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Coverage & Provider Management</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage the service coverage clients see while keeping clinic identities inside the internal record view.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ViewButton active={view === "coverage"} onClick={() => setView("coverage")} icon={LayoutGrid}>Client-facing services</ViewButton>
          <ViewButton active={view === "records"} onClick={() => setView("records")} icon={Database}>Internal records</ViewButton>
          <ViewButton active={view === "import"} onClick={() => setView("import")} icon={FileSpreadsheet}>Excel upload</ViewButton>
        </div>
      </div>

      {view === "coverage" && (
        <>
          <GlassPanel className="p-5">
            <div className="flex items-start gap-3">
              <LayoutGrid className="w-5 h-5 mt-0.5 admin-icon" />
              <div>
                <h2 className="font-semibold">Client-facing service layer</h2>
                <p className="text-sm text-muted-foreground mt-1">This view contains service types and generalized coverage areas only. Clinic names, addresses, contacts, and internal notes are not displayed.</p>
              </div>
            </div>
          </GlassPanel>

          {clientCoverage.length === 0 ? (
            <GlassPanel className="p-10 text-center text-muted-foreground">No client-facing service coverage is available yet.</GlassPanel>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {clientCoverage.map((item) => (
                <GlassPanel key={item.service} className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-lg font-bold">{item.service}</h2>
                      <p className="text-sm text-muted-foreground mt-1">{item.areaList.length} coverage area{item.areaList.length === 1 ? "" : "s"}</p>
                    </div>
                    <div className="rounded-xl bg-[#d8e7f1] px-3 py-2 text-[#173b5c] font-bold text-sm">{item.providerCount}</div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {item.areaList.slice(0, 6).map((area) => <span key={area} className="rounded-full bg-white/65 border border-slate-200 px-3 py-1 text-xs text-slate-600">{area}</span>)}
                    {item.areaList.length > 6 && <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">+{item.areaList.length - 6} more</span>}
                  </div>
                </GlassPanel>
              ))}
            </div>
          )}
        </>
      )}

      {view === "records" && (
        <>
          <div className="flex flex-col sm:flex-row justify-between gap-3">
            <GlassPanel className="p-4 flex items-center gap-4 flex-1">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Search internal provider records" className="pl-9 bg-white/60" value={search} onChange={(event) => setSearch(event.target.value)} />
              </div>
            </GlassPanel>
            <Button onClick={() => setIsAddOpen(true)}><Plus className="w-4 h-4 mr-2" /> Add provider</Button>
          </div>

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
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading providers…</TableCell></TableRow>
                ) : providers.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No providers found.</TableCell></TableRow>
                ) : providers.map((provider) => (
                  <TableRow key={provider.id}>
                    <TableCell className="font-medium">{provider.name}</TableCell>
                    <TableCell>{provider.city}, {provider.state}</TableCell>
                    <TableCell><div className="text-sm"><div>{provider.email || "—"}</div><div className="text-muted-foreground">{provider.phone || "—"}</div></div></TableCell>
                    <TableCell className="max-w-[280px]"><div className="flex flex-wrap gap-1">{provider.services?.slice(0, 4).map((service) => <span key={service} className="px-2 py-1 rounded-full bg-secondary text-[10px]">{service}</span>)}</div></TableCell>
                    <TableCell><span className={provider.active ? "px-2 py-1 rounded-full text-xs bg-emerald-600/10 text-emerald-700" : "px-2 py-1 rounded-full text-xs bg-destructive/10 text-destructive"}>{provider.active ? "Active" : "Inactive"}</span></TableCell>
                    <TableCell className="text-right"><Button variant="ghost" size="icon" onClick={() => handleDelete(provider.id)}><Trash2 className="w-4 h-4" /></Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </GlassPanel>
        </>
      )}

      {view === "import" && (
        <div className="space-y-5">
          <GlassPanel className="p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold">Bulk provider spreadsheet upload</h2>
                <p className="text-sm text-muted-foreground mt-1">Upload up to 1,000 provider rows from Excel. Every row is validated before the import button is enabled.</p>
              </div>
              <Button variant="secondary" onClick={downloadTemplate}><Download className="w-4 h-4 mr-2 admin-icon" /> Download Excel template</Button>
            </div>

            <label className="mt-6 min-h-40 rounded-2xl border-2 border-dashed border-slate-300 bg-white/45 flex flex-col items-center justify-center text-center p-6 cursor-pointer hover:bg-white/65 transition-colors">
              <Upload className="w-8 h-8 mb-3 admin-icon" />
              <span className="font-semibold">Choose an Excel or CSV file</span>
              <span className="text-sm text-muted-foreground mt-1">Accepted: .xlsx, .xls, .csv</span>
              <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) parseSpreadsheet(file); event.currentTarget.value = ""; }} />
            </label>
            {isParsing && <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Reading spreadsheet…</div>}
            {bulkFileName && <p className="mt-4 text-sm"><strong>File:</strong> {bulkFileName}</p>}
          </GlassPanel>

          {bulkErrors.length > 0 && (
            <GlassPanel className="p-5 border-destructive/25">
              <div className="flex items-center gap-2 text-destructive font-semibold"><AlertCircle className="w-5 h-5" /> {bulkErrors.length} spreadsheet issue{bulkErrors.length === 1 ? "" : "s"}</div>
              <ul className="mt-3 space-y-1 text-sm text-muted-foreground max-h-48 overflow-auto">{bulkErrors.slice(0, 50).map((error) => <li key={error}>• {error}</li>)}</ul>
            </GlassPanel>
          )}

          {bulkRows.length > 0 && (
            <GlassPanel className="p-0 overflow-hidden">
              <div className="p-4 flex items-center justify-between gap-4 border-b border-slate-200/70">
                <div><h3 className="font-semibold">Validated import preview</h3><p className="text-sm text-muted-foreground">{bulkRows.length} valid provider row{bulkRows.length === 1 ? "" : "s"}</p></div>
                <Button onClick={uploadBulkProviders} disabled={isUploading || bulkErrors.length > 0}>{isUploading ? "Importing…" : `Import ${bulkRows.length} providers`}</Button>
              </div>
              <div className="max-h-[460px] overflow-auto">
                <Table>
                  <TableHeader className="bg-white/35"><TableRow><TableHead>Provider</TableHead><TableHead>Location</TableHead><TableHead>Coordinates</TableHead><TableHead>Services</TableHead></TableRow></TableHeader>
                  <TableBody>{bulkRows.map((provider, index) => (
                    <TableRow key={`${provider.name}-${index}`}>
                      <TableCell className="font-medium">{provider.name}</TableCell>
                      <TableCell>{provider.city}, {provider.state}, {provider.country}</TableCell>
                      <TableCell className="text-xs font-mono">{provider.latitude}, {provider.longitude}</TableCell>
                      <TableCell>{provider.serviceIds.length} selected</TableCell>
                    </TableRow>
                  ))}</TableBody>
                </Table>
              </div>
            </GlassPanel>
          )}
        </div>
      )}

      <Dialog open={isAddOpen} onOpenChange={(open) => { setIsAddOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="atlas-modal sm:max-w-[760px] max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add internal provider record</DialogTitle>
            <DialogDescription>Provider identity stays inside the admin system. Client users receive only service and generalized coverage information.</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
            <Field label="Provider / clinic name *" value={form.name} onChange={(value) => updateField("name", value)} />
            <Field label="Country *" value={form.country} onChange={(value) => updateField("country", value)} />
            <div className="md:col-span-2"><Field label="Street address *" value={form.address} onChange={(value) => updateField("address", value)} /></div>
            <Field label="City *" value={form.city} onChange={(value) => updateField("city", value)} />
            <Field label="State / region *" value={form.state} onChange={(value) => updateField("state", value)} />
            <Field label="Postal code" value={form.postalCode} onChange={(value) => updateField("postalCode", value)} />
            <div className="flex items-end"><Button type="button" variant="secondary" className="w-full" onClick={geocodeAddress} disabled={isGeocoding}>{isGeocoding ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <MapPin className="w-4 h-4 mr-2 admin-icon" />}Find coordinates</Button></div>
            <Field label="Latitude *" value={form.latitude} onChange={(value) => updateField("latitude", value)} />
            <Field label="Longitude *" value={form.longitude} onChange={(value) => updateField("longitude", value)} />
            <Field label="Phone" value={form.phone} onChange={(value) => updateField("phone", value)} />
            <Field label="Email" value={form.email} onChange={(value) => updateField("email", value)} />
            <div className="md:col-span-2"><Field label="Website" value={form.website} onChange={(value) => updateField("website", value)} /></div>
            <div className="md:col-span-2"><Field label="Availability notes" value={form.availabilityNotes} onChange={(value) => updateField("availabilityNotes", value)} /></div>
            <div className="md:col-span-2"><Field label="Coverage notes" value={form.coverageNotes} onChange={(value) => updateField("coverageNotes", value)} /></div>
            <div className="md:col-span-2"><Field label="Internal tags" value={form.internalTags} onChange={(value) => updateField("internalTags", value)} /></div>
          </div>

          <div className="mt-5">
            <Label>Services offered *</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 mt-2">
              {categories.map((category) => (
                <label key={category.id} className="flex items-center gap-2 rounded-xl border bg-white/55 px-3 py-2 text-sm cursor-pointer">
                  <Checkbox checked={serviceIds.includes(category.id)} onCheckedChange={(checked) => setServiceIds((current) => checked ? [...current, category.id] : current.filter((id) => id !== category.id))} />
                  {category.name}
                </label>
              ))}
            </div>
          </div>

          <Button className="w-full mt-6" onClick={handleCreate} disabled={createProvider.isPending}>{createProvider.isPending ? "Adding provider…" : "Add provider to internal network"}</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ViewButton({ active, onClick, icon: Icon, children }: { active: boolean; onClick: () => void; icon: typeof LayoutGrid; children: React.ReactNode }) {
  return <Button type="button" variant={active ? "default" : "secondary"} onClick={onClick}><Icon className="w-4 h-4 mr-2 admin-icon" />{children}</Button>;
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <div className="space-y-2"><Label>{label}</Label><Input value={value} onChange={(event) => onChange(event.target.value)} className="bg-white/65" /></div>;
}
