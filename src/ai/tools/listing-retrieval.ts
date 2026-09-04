// src/ai/tools/listing-retrieval.ts
//
// ⚠️ PLACEHOLDER — built from the spec you provided (params, normalization
// rules, Firestore field names) rather than your actual source file.
// Replace this with your real listing-retrieval.ts once you can paste it in —
// the rest of the project (webhook, agent, whatsapp helpers) calls this by
// name and shape only, so swapping it in is a drop-in replacement.

import { getFirestore } from "firebase-admin/firestore";
import "@/src/lib/firebase-admin"; // ensures Admin is initialized

const db = getFirestore();

export type PropertyType =
  | "House"
  | "Shortlet"
  | "Office Space"
  | "Warehouse"
  | "Shop";

export type ListingSearchInput = {
  location?: string;
  maxPrice?: number;
  propertyType?: string;
  beds?: number;
};

export type Listing = {
  id: string;
  title: string;
  description?: string;
  yearlyRent: number;
  serviceCharge?: number;
  cautionCharge?: number;
  agencyFee?: number;
  agreementFee?: number;
  type: PropertyType;
  beds: number;
  baths?: number;
  toilets?: number;
  amenities?: string[];
  address: { street: string; lga: string; state: string };
  location?: { lat: number; lng: number };
  imageUrls: string[];
  videoUrl?: string | null;
  landlord?: {
    userId: string;
    name: string;
    photoUrl?: string;
    isVerified?: boolean;
  };
  createdAt?: string;
  status: "published" | "draft" | "rented";
  aiCommentary?: string;
};

/** Maps loose user input to the strict database property types */
function normalizePropertyType(input?: string): PropertyType | null {
  if (!input) return null;
  const s = input.toLowerCase();
  if (s.includes("short") || s.includes("daily")) return "Shortlet";
  if (s.includes("office") || s.includes("workspace")) return "Office Space";
  if (s.includes("warehouse") || s.includes("store")) return "Warehouse";
  if (s.includes("shop") || s.includes("mall")) return "Shop";
  // default bucket for house/flat/apartment/duplex/etc.
  return "House";
}

/** Strips trailing qualifiers like "state"/"lga"/"area" for looser matching */
function normalizeLocation(input: string): string {
  return input
    .toLowerCase()
    .replace(/\bstate\b/g, "")
    .replace(/\blga\b/g, "")
    .replace(/\barea\b/g, "")
    .trim();
}

function locationMatches(listing: Listing, query: string): boolean {
  const q = normalizeLocation(query);
  if (!q) return true;

  const haystacks = [
    listing.address?.lga,
    listing.address?.state,
    listing.address?.street,
    listing.title,
  ]
    .filter(Boolean)
    .map((s) => s!.toLowerCase());

  return haystacks.some((h) => h.includes(q) || q.includes(h));
}

export async function getPropertyListings(
  input: ListingSearchInput
): Promise<Listing[]> {
  // Firestore can't do the fuzzy location matching server-side, so pull
  // published listings (optionally pre-filtered by price/beds, which ARE
  // indexable) and do location + type matching in memory.
  let query: FirebaseFirestore.Query = db
    .collection("listings")
    .where("status", "==", "published");

  if (typeof input.maxPrice === "number") {
    query = query.where("yearlyRent", "<=", input.maxPrice);
  }
  if (typeof input.beds === "number") {
    query = query.where("beds", ">=", input.beds);
  }

  const snapshot = await query.get();
  let results = snapshot.docs.map(
    (doc) => ({ id: doc.id, ...doc.data() } as Listing)
  );

  const normalizedType = normalizePropertyType(input.propertyType);
  if (normalizedType) {
    results = results.filter((l) => l.type === normalizedType);
  }

  if (input.location) {
    results = results.filter((l) => locationMatches(l, input.location!));
  }

  return results;
}
