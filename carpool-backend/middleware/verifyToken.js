const admin = require("firebase-admin");

// ========================================
// Firebase ID Token Verification Middleware
// ========================================

const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    // Check Authorization header.
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        error: "Authentication token is required",
      });
    }

    // Extract Firebase ID token.
    const idToken = authHeader.slice(7).trim();

    if (!idToken) {
      return res.status(401).json({
        success: false,
        error: "Invalid authorization header",
      });
    }

    // Verify Firebase ID token and check revocation.
    const decodedToken = await admin.auth().verifyIdToken(
      idToken,
      true
    );

    // Attach verified user information to request.
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email || null,
      name: decodedToken.name || null,
      emailVerified: decodedToken.email_verified || false,
    };

    // Continue to the protected route.
    return next();
  } catch (error) {
    console.error("Authentication error:", error.message);

    return res.status(401).json({
      success: false,
      error: "Invalid or expired authentication token",
    });
  }
};

// ========================================
// Export Middleware
// ========================================

module.exports = verifyToken;