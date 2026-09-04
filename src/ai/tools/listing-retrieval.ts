// src/ai/tools/listing-retrieval.ts
//
// Ported from the real Locari codebase (src/ai/tools/listing-retrieval.ts),
// where it's wrapped as a Genkit tool (`ai.defineTool`). Genkit isn't used in
// this bot, so the filtering/matching logic below is copied as-is and
// exposed as a plain async function instead, matching Locari's actual
// behavior rather than the earlier spec-based placeholder.

import { getAdminDb } from "@/src/lib/firebaseAdmin";

export type ListingSearchInput = {
  location?: string;
  maxPrice?: number;
  propertyType?: string;
  beds?: number;
};

export async function getPropertyListings(input: ListingSearchInput): Promise<any[]> {
  const adminDb = getAdminDb();
  if (!adminDb) {
    console.error("[getPropertyListings] ❌ Admin DB not initialized. Check environment variables.");
    return [];
  }

  console.log("[getPropertyListings] 📡 Fetching listings with criteria:", JSON.stringify(input));

  try {
    // 1. Map input property type to DB categories
    let targetType = "";
    if (input.propertyType) {
      const pt = input.propertyType.toLowerCase();
      if (pt.includes("short") || pt.includes("daily")) targetType = "Shortlet";
      else if (pt.includes("office") || pt.includes("workspace")) targetType = "Office Space";
      else if (pt.includes("warehouse") || pt.includes("store")) targetType = "Warehouse";
      else if (pt.includes("shop") || pt.includes("mall")) targetType = "Shop";
      else if (
        pt.includes("house") ||
        pt.includes("flat") ||
        pt.includes("apt") ||
        pt.includes("room") ||
        pt.includes("self") ||
        pt.includes("duplex") ||
        pt.includes("bungalow")
      )
        targetType = "House";
    }

    // 2. Start with a filtered query for performance (only live listings)
    let query: any = adminDb.collection("listings").where("status", "==", "published");

    // 3. Apply property type filter at the DB level if mapped
    if (targetType) {
      query = query.where("type", "==", targetType);
    }

    const snapshot = await query.get();

    if (snapshot.empty) {
      console.log("[getPropertyListings] 📭 No published listings found in database.");
      return [];
    }

    // 4. Map and sanitize data
    let listings = snapshot.docs.map((doc: any) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        title: data.title || "Untitled Property",
        yearlyRent: data.yearlyRent || 0,
        imageUrls: data.imageUrls || [],
        address: data.address || { street: "", lga: "", state: "" },
        createdAt: data.createdAt?.toDate?.()
          ? data.createdAt.toDate().toISOString()
          : new Date().toISOString(),
      };
    });

    // --- REFINED IN-MEMORY FILTERING ---

    // 5. Enhanced Location Matching
    if (input.location) {
      const cleanSearch = input.location
        .toLowerCase()
        .replace(/\s+state$/, "")
        .replace(/\s+lga$/, "")
        .replace(/\s+area$/, "")
        .trim();

      if (cleanSearch.length > 0) {
        listings = listings.filter((l: any) => {
          const lgaVal = (l.address?.lga || "").toLowerCase();
          const stateVal = (l.address?.state || "").toLowerCase();
          const streetVal = (l.address?.street || "").toLowerCase();
          const titleVal = (l.title || "").toLowerCase();

          const matchesBase =
            (lgaVal.length > 0 && lgaVal.includes(cleanSearch)) ||
            (stateVal.length > 0 && stateVal.includes(cleanSearch)) ||
            (streetVal.length > 0 && streetVal.includes(cleanSearch)) ||
            (titleVal.length > 0 && titleVal.includes(cleanSearch));

          // Handles "I need a house in Oyo State" matching a listing where state is simply "Oyo"
          const matchesReverse =
            cleanSearch.length > 2 &&
            ((lgaVal.length > 2 && cleanSearch.includes(lgaVal)) ||
              (stateVal.length > 2 && cleanSearch.includes(stateVal)));

          return matchesBase || matchesReverse;
        });
      }
    }

    // 6. Price Filter
    if (input.maxPrice && input.maxPrice > 0) {
      listings = listings.filter((l: any) => (l.yearlyRent || 0) <= input.maxPrice!);
    }

    // 7. Beds Filter
    if (input.beds && input.beds > 0) {
      listings = listings.filter((l: any) => (l.beds || 0) >= input.beds!);
    }

    console.log(`[getPropertyListings] ✅ Found ${listings.length} filtered matches.`);

    // Limit results to top 10
    return listings.slice(0, 10);
  } catch (error: any) {
    console.error("[getPropertyListings] 💥 Retrieval error:", error.message);
    return [];
  }
}
