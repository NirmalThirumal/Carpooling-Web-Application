require("dotenv").config();

const express = require("express");
const router = express.Router();

const verifyToken = require("../middleware/verifyToken");

// ========================================
// API Configuration
// ========================================

const OPENCAGE_KEY = process.env.OPENCAGE_API_KEY;
const GRAPHHOPPER_KEY = process.env.GRAPHHOPPER_API_KEY;

const GRAPHHOPPER_URL = "https://graphhopper.com/api/1/route";

// ========================================
// Coordinate Validation
// ========================================

// Check frontend coordinates: [latitude, longitude].
const validateCoordinates = (coords) => {
  if (
    !Array.isArray(coords) ||
    coords.length !== 2 ||
    !Number.isFinite(Number(coords[0])) ||
    !Number.isFinite(Number(coords[1]))
  ) {
    return false;
  }

  const [lat, lng] = coords.map(Number);

  return (
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
};

// ========================================
// API Configuration Status
// ========================================

console.log(
  "OpenCage API Key loaded:",
  Boolean(OPENCAGE_KEY)
);

console.log(
  "GraphHopper API Key loaded:",
  Boolean(GRAPHHOPPER_KEY)
);

// ========================================
// 1. Location Suggestions - OpenCage
// GET /api/maps/suggestions
// ========================================

router.get("/suggestions", verifyToken, async (req, res) => {
  try {
    const query = String(req.query.q || "").trim();

    if (query.length < 3) {
      return res.json({
        success: true,
        suggestions: [],
      });
    }

    if (!OPENCAGE_KEY) {
      return res.status(500).json({
        success: false,
        error: "Location service is not configured.",
      });
    }

    const url = new URL(
      "https://api.opencagedata.com/geocode/v1/json"
    );

    url.searchParams.set("q", query);
    url.searchParams.set("key", OPENCAGE_KEY);
    url.searchParams.set("limit", "5");
    url.searchParams.set("countrycode", "in");

    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok || data.status?.code !== 200) {
      console.error("OpenCage error:", {
        httpStatus: response.status,
        providerStatus: data.status?.code,
        message: data.status?.message,
      });

      return res.status(502).json({
        success: false,
        error:
          data.status?.message ||
          "OpenCage location provider request failed.",
      });
    }

    const suggestions = (data.results || [])
      .filter(
        (item) =>
          Number.isFinite(Number(item.geometry?.lat)) &&
          Number.isFinite(Number(item.geometry?.lng))
      )
      .map((item) => ({
        label: item.formatted,
        lat: Number(item.geometry.lat),
        lng: Number(item.geometry.lng),
      }));

    return res.json({
      success: true,
      suggestions,
    });
  } catch (error) {
    console.error("Location suggestions error:", error.message);

    return res.status(500).json({
      success: false,
      error: "Unable to retrieve location suggestions.",
    });
  }
});

// ========================================
// 2. Shared GraphHopper Route Request
// ========================================

const requestGraphHopperRoute = async (
  pickupCoords,
  destCoords
) => {
  if (!GRAPHHOPPER_KEY) {
    throw new Error("GraphHopper API key is not configured.");
  }

  if (
    !validateCoordinates(pickupCoords) ||
    !validateCoordinates(destCoords)
  ) {
    throw new Error("Invalid pickup or destination coordinates.");
  }

  const url = new URL(GRAPHHOPPER_URL);

  // GraphHopper expects latitude,longitude for point parameters.
  url.searchParams.append(
    "point",
    `${Number(pickupCoords[0])},${Number(pickupCoords[1])}`
  );

  url.searchParams.append(
    "point",
    `${Number(destCoords[0])},${Number(destCoords[1])}`
  );

  url.searchParams.set("profile", "car");
  url.searchParams.set("points_encoded", "false");
  url.searchParams.set("key", GRAPHHOPPER_KEY);

  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok) {
    console.error("GraphHopper provider error:", {
      status: response.status,
      message: data.message || data.hints?.[0]?.message,
    });

    throw new Error(
      data.message ||
        data.hints?.[0]?.message ||
        "GraphHopper route request failed."
    );
  }

  const route = data.paths?.[0];

  if (!route) {
    throw new Error("No driving route was found.");
  }

  return route;
};

// ========================================
// 3. Calculate Driving Distance
// POST /api/maps/distance
// ========================================

router.post("/distance", verifyToken, async (req, res) => {
  try {
    const { pickupCoords, destCoords } = req.body;

    const route = await requestGraphHopperRoute(
      pickupCoords,
      destCoords
    );

    const distanceMeters = route.distance;

    if (
      typeof distanceMeters !== "number" ||
      !Number.isFinite(distanceMeters) ||
      distanceMeters <= 0
    ) {
      throw new Error("Invalid distance returned by GraphHopper.");
    }

    return res.json({
      success: true,
      distance: distanceMeters / 1000,
    });
  } catch (error) {
    console.error("Distance calculation error:", error.message);

    return res.status(502).json({
      success: false,
      error: error.message,
    });
  }
});

// ========================================
// 4. Get Route for Leaflet Map
// POST /api/maps/route
// ========================================

router.post("/route", verifyToken, async (req, res) => {
  try {
    const { pickupCoords, destCoords } = req.body;

    const route = await requestGraphHopperRoute(
      pickupCoords,
      destCoords
    );

    const coordinates = route.points?.coordinates;

    if (!Array.isArray(coordinates) || coordinates.length === 0) {
      throw new Error("Route geometry is unavailable.");
    }

    // GraphHopper returns [longitude, latitude].
    // Leaflet expects [latitude, longitude].
    const mapCoordinates = coordinates.map(([lng, lat]) => [
      Number(lat),
      Number(lng),
    ]);

    return res.json({
      success: true,
      route: mapCoordinates,
    });
  } catch (error) {
    console.error("Route retrieval error:", error.message);

    return res.status(502).json({
      success: false,
      error: error.message,
    });
  }
});

// ========================================
// Export Router
// ========================================

module.exports = router;