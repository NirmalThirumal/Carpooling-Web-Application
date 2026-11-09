import auth from "../firebase/auth";

// ========================================
// Backend API Configuration
// ========================================

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000"
).replace(/\/+$/, "");

// ========================================
// Authenticated API Request
// ========================================

const authenticatedFetch = async (endpoint, options = {}) => {
  const currentUser = auth.currentUser;

  // Ensure the user is logged in.
  if (!currentUser) {
    throw new Error("Please log in to continue.");
  }

  // Get Firebase ID token.
  const idToken = await currentUser.getIdToken();

  // Prepare request headers.
  const headers = new Headers(options.headers || {});

  // Attach authentication token.
  headers.set("Authorization", `Bearer ${idToken}`);

  // Set JSON content type when required.
  if (
    options.body &&
    !(options.body instanceof FormData) &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }

  // Send authenticated request.
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  return response;
};

// ========================================
// Default Export
// ========================================

export default authenticatedFetch;