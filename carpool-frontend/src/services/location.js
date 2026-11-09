import authenticatedFetch from "./authenticatedFetch";

// ========================================
// Location Suggestions
// ========================================

export const getSuggestions = async (query) => {
  // Validate search query.
  if (!query || query.trim().length < 3) {
    return [];
  }

  try {
    // Prepare API endpoint.
    const endpoint = `/api/maps/suggestions?q=${encodeURIComponent(
      query.trim()
    )}`;

    const response = await authenticatedFetch(endpoint);

    let data;

    // Parse API response.
    try {
      data = await response.json();
    } catch {
      throw new Error("Invalid response from location service.");
    }

    // Validate API response.
    if (!response.ok || !data.success) {
      throw new Error(
        data.error || "Unable to retrieve location suggestions."
      );
    }

    // Return location suggestions.
    return Array.isArray(data.suggestions)
      ? data.suggestions
      : [];
  } catch (error) {
    console.error("Location suggestion error:", error);
    throw error;
  }
};