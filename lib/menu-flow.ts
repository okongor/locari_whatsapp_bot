// lib/menu-flow.ts
// Defines the button/list-driven "select an option" flow, Ziva-style —
// no free text required except for a custom-location fallback.

import type { FlowState, FlowStep, FlowFilters } from "./flow-store";

// ---- Option catalogs ----

export const PROPERTY_TYPES = [
  { id: "type_house", title: "House / Flat / Apartment" },
  { id: "type_shortlet", title: "Shortlet" },
  { id: "type_office", title: "Office Space" },
  { id: "type_warehouse", title: "Warehouse" },
  { id: "type_shop", title: "Shop" },
];

export const POPULAR_LOCATIONS = [
  { id: "loc_lekki", title: "Lekki" },
  { id: "loc_ikeja", title: "Ikeja" },
  { id: "loc_ajah", title: "Ajah" },
  { id: "loc_yaba", title: "Yaba" },
  { id: "loc_abuja", title: "Abuja (FCT)" },
  { id: "loc_ph", title: "Port Harcourt" },
  { id: "loc_other", title: "Type a different area" },
];

export const BUDGET_RANGES = [
  { id: "budget_500k", title: "Under ₦500k/yr", maxPrice: 500_000 },
  { id: "budget_1m", title: "₦500k – ₦1m/yr", maxPrice: 1_000_000 },
  { id: "budget_2m", title: "₦1m – ₦2m/yr", maxPrice: 2_000_000 },
  { id: "budget_5m", title: "₦2m – ₦5m/yr", maxPrice: 5_000_000 },
  { id: "budget_any", title: "No limit", maxPrice: undefined },
];

export const BED_OPTIONS = [
  { id: "beds_1", title: "1 bedroom", beds: 1 },
  { id: "beds_2", title: "2 bedrooms", beds: 2 },
  { id: "beds_3", title: "3 bedrooms", beds: 3 },
  { id: "beds_4", title: "4+ bedrooms", beds: 4 },
  { id: "beds_any", title: "Any", beds: undefined },
];

// ---- Message builders (called by the webhook to know what to send) ----

export type MenuMessage =
  | { kind: "list"; body: string; buttonLabel: string; rows: { id: string; title: string }[] }
  | { kind: "text"; body: string };

export function getMenuMessage(step: FlowStep): MenuMessage {
  switch (step) {
    case "start":
      return {
        kind: "list",
        body: "👋 Welcome to Locari! What are you looking for?",
        buttonLabel: "Choose type",
        rows: PROPERTY_TYPES,
      };
    case "awaiting_property_type":
      return {
        kind: "list",
        body: "👋 Welcome to Locari! What are you looking for?",
        buttonLabel: "Choose type",
        rows: PROPERTY_TYPES,
      };
    case "awaiting_location":
      return {
        kind: "list",
        body: "Great — which area are you interested in?",
        buttonLabel: "Choose area",
        rows: POPULAR_LOCATIONS,
      };
    case "awaiting_location_text":
      return {
        kind: "text",
        body: "No problem — just type the city, LGA, or neighborhood you're looking in.",
      };
    case "awaiting_budget":
      return {
        kind: "list",
        body: "What's your yearly rent budget?",
        buttonLabel: "Choose budget",
        rows: BUDGET_RANGES,
      };
    case "awaiting_beds":
      return {
        kind: "list",
        body: "How many bedrooms do you need?",
        buttonLabel: "Choose bedrooms",
        rows: BED_OPTIONS,
      };
    default:
      return {
        kind: "text",
        body: "Searching for listings that match what you selected...",
      };
  }
}

// ---- Advancing the flow ----

export type AdvanceResult = {
  nextState: FlowState;
  /** true once all filters are collected and a search should run */
  readyToSearch: boolean;
};

/**
 * Given the current state and the user's input (a button/list selection id,
 * or free text for the location fallback), returns the next state.
 */
export function advanceFlow(
  current: FlowState,
  input: { selectionId?: string; freeText?: string }
): AdvanceResult {
  const filters: FlowFilters = { ...current.filters };

  switch (current.step) {
    case "start":
    case "awaiting_property_type": {
      const match = PROPERTY_TYPES.find((t) => t.id === input.selectionId);
      if (match) {
        filters.propertyType = match.title.split(" / ")[0]; // "House" from "House / Flat / Apartment"
      }
      return { nextState: { step: "awaiting_location", filters }, readyToSearch: false };
    }

    case "awaiting_location": {
      if (input.selectionId === "loc_other") {
        return { nextState: { step: "awaiting_location_text", filters }, readyToSearch: false };
      }
      const match = POPULAR_LOCATIONS.find((l) => l.id === input.selectionId);
      if (match) filters.location = match.title;
      return { nextState: { step: "awaiting_budget", filters }, readyToSearch: false };
    }

    case "awaiting_location_text": {
      if (input.freeText) filters.location = input.freeText.trim();
      return { nextState: { step: "awaiting_budget", filters }, readyToSearch: false };
    }

    case "awaiting_budget": {
      const match = BUDGET_RANGES.find((b) => b.id === input.selectionId);
      if (match) filters.maxPrice = match.maxPrice;
      return { nextState: { step: "awaiting_beds", filters }, readyToSearch: false };
    }

    case "awaiting_beds": {
      const match = BED_OPTIONS.find((b) => b.id === input.selectionId);
      if (match) filters.beds = match.beds;
      return { nextState: { step: "done", filters }, readyToSearch: true };
    }

    default:
      // Already done or unknown — restart the flow
      return { nextState: { step: "start", filters: {} }, readyToSearch: false };
  }
}
