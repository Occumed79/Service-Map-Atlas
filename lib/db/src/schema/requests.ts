import { pgTable, text, serial, timestamp, integer, boolean, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const serviceRequestsTable = pgTable("service_requests", {
  id: serial("id").primaryKey(),
  clientName: text("client_name").notNull(),
  clientEmail: text("client_email").notNull(),
  clientPhone: text("client_phone"),
  employerCompany: text("employer_company"),
  requestedService: text("requested_service").notNull(),
  requestedLocation: text("requested_location").notNull(),
  urgency: text("urgency").notNull().default("normal"),
  notes: text("notes"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const searchEventsTable = pgTable("search_events", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  userName: text("user_name"),
  userEmail: text("user_email"),
  employerAccountId: integer("employer_account_id"),
  employerName: text("employer_name"),
  employerEmailDomain: text("employer_email_domain"),
  searchText: text("search_text").notNull(),
  selectedServiceType: text("selected_service_type"),
  geocodedCity: text("geocoded_city"),
  geocodedState: text("geocoded_state"),
  geocodedCountry: text("geocoded_country"),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  matchingProviderCount: integer("matching_provider_count").notNull().default(0),
  zeroResultSearch: boolean("zero_result_search").notNull().default(false),
  markerClicked: boolean("marker_clicked").notNull().default(false),
  requestSubmitted: boolean("request_submitted").notNull().default(false),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
});

export const activityLogsTable = pgTable("activity_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  action: text("action").notNull(),
  entityType: text("entity_type"),
  entityId: integer("entity_id"),
  details: text("details"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertServiceRequestSchema = createInsertSchema(serviceRequestsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertServiceRequest = z.infer<typeof insertServiceRequestSchema>;
export type ServiceRequest = typeof serviceRequestsTable.$inferSelect;

export const insertSearchEventSchema = createInsertSchema(searchEventsTable).omit({ id: true, timestamp: true });
export type InsertSearchEvent = z.infer<typeof insertSearchEventSchema>;
export type SearchEvent = typeof searchEventsTable.$inferSelect;
