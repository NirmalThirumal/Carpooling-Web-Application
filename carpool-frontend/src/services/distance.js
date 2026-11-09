import authenticatedFetch from "./authenticatedFetch";

// ========================================
// API Response Handler
// ========================================

const getAPIResponse = async (endpoint, body) => {
  const response = await authenticatedFetch(endpoint, {
    method: "POST",
    body: JSON.stringify(body),
  });

  let data;

  try {
    data = await response.json();
  } catch {
    throw new Error("Invalid response received from the map service.");
  }

  if (!response.ok || !data.success) {
    throw new Error(
      data.error || "Map service request failed."
    );
  }

  return data;
};

// ========================================
// Distance Calculation
// ========================================

// Calculate driving distance in kilometres.
export const getDistance = async (pickupCoords, destCoords) => {
  const data = await getAPIResponse("/api/maps/distance", {
    pickupCoords,
    destCoords,
  });

  const distance = Number(data.distance);

  if (!Number.isFinite(distance) || distance < 0) {
    throw new Error("Invalid distance received from the map service.");
  }

  return distance;
};

// ========================================
// Route Coordinates
// ========================================

// Get route coordinates for Leaflet MapView.
export const getRoute = async (pickupCoords, destCoords) => {
  const data = await getAPIResponse("/api/maps/route", {
    pickupCoords,
    destCoords,
  });

  if (!data.route) {
    throw new Error("Route information is unavailable.");
  }

  return data.route;
};