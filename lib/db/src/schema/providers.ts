import { pgTable, text, serial, timestamp, boolean, integer, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const serviceCategoriesTable = pgTable("service_categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  icon: text("icon"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const serviceLocationsTable = pgTable("service_locations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  address: text("address").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
  country: text("country").notNull().default("US"),
  postalCode: text("postal_code"),
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  phone: text("phone"),
  email: text("email"),
  website: text("website"),
  availabilityNotes: text("availability_notes"),
  coverageNotes: text("coverage_notes"),
  internalTags: text("internal_tags"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const locationServicesTable = pgTable("location_services", {
  id: serial("id").primaryKey(),
  locationId: integer("location_id").notNull().references(() => serviceLocationsTable.id, { onDelete: "cascade" }),
  categoryId: integer("category_id").notNull().references(() => serviceCategoriesTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const providerNotesTable = pgTable("provider_notes", {
  id: serial("id").primaryKey(),
  locationId: integer("location_id").notNull().references(() => serviceLocationsTable.id, { onDelete: "cascade" }),
  note: text("note").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertServiceCategorySchema = createInsertSchema(serviceCategoriesTable).omit({ id: true, createdAt: true });
export type InsertServiceCategory = z.infer<typeof insertServiceCategorySchema>;
export type ServiceCategory = typeof serviceCategoriesTable.$inferSelect;

export const insertServiceLocationSchema = createInsertSchema(serviceLocationsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertServiceLocation = z.infer<typeof insertServiceLocationSchema>;
export type ServiceLocation = typeof serviceLocationsTable.$inferSelect;

export const insertLocationServiceSchema = createInsertSchema(locationServicesTable).omit({ id: true, createdAt: true });
export type InsertLocationService = z.infer<typeof insertLocationServiceSchema>;
export type LocationService = typeof locationServicesTable.$inferSelect;
