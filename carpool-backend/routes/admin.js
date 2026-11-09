const express = require("express");
const router = express.Router();

const db = require("../config/firebase");
const verifyToken = require("../middleware/verifyToken");

// ========================================
// Admin Configuration
// ========================================

// Admin emails must be configured in the backend .env file.
// Example: ADMIN_EMAILS=admin@gmail.com
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

// ========================================
// Admin Authorization Middleware
// ========================================

// Verify the Firebase token first, then check the verified email.
const checkAdmin = (req, res, next) => {
  const userEmail = req.user?.email?.toLowerCase();

  if (!userEmail || !ADMIN_EMAILS.includes(userEmail)) {
    return res.status(403).json({
      error: "Access denied. Admin only.",
    });
  }

  next();
};

// All routes require authentication and admin authorization.
router.use(verifyToken, checkAdmin);

// ========================================
// Dashboard Statistics
// ========================================

router.post("/stats", async (req, res) => {
  try {
    const [users, rides, bookings] = await Promise.all([
      db.collection("users").get(),
      db.collection("rides").get(),
      db.collection("bookings").get(),
    ]);

    res.json({
      success: true,
      users: users.size,
      rides: rides.size,
      bookings: bookings.size,
    });
  } catch (error) {
    console.error("Admin stats error:", error);

    res.status(500).json({
      error: "Failed to fetch dashboard statistics.",
    });
  }
});

// ========================================
// Ride Management
// ========================================

// Get All Rides
router.post("/rides", async (req, res) => {
  try {
    const snapshot = await db.collection("rides").get();

    const data = snapshot.docs.map((document) => ({
      id: document.id,
      ...document.data(),
    }));

    res.json({ success: true, data });
  } catch (error) {
    console.error("Admin rides error:", error);

    res.status(500).json({
      error: "Failed to fetch rides.",
    });
  }
});

// Update Ride Seats
router.post("/update-ride", async (req, res) => {
  try {
    const { rideId, updates } = req.body;

    if (!rideId || typeof rideId !== "string") {
      return res.status(400).json({
        error: "Valid ride ID is required.",
      });
    }

    // Only allow the seats field to be changed through this endpoint.
    if (
      !updates ||
      Object.keys(updates).length !== 1 ||
      !Object.prototype.hasOwnProperty.call(updates, "seats")
    ) {
      return res.status(400).json({
        error: "Only the available seats field can be updated.",
      });
    }

    const seats = Number(updates.seats);

    if (!Number.isInteger(seats) || seats < 0 || seats > 100) {
      return res.status(400).json({
        error: "Seats must be a whole number between 0 and 100.",
      });
    }

    const rideRef = db.collection("rides").doc(rideId);
    const rideDoc = await rideRef.get();

    if (!rideDoc.exists) {
      return res.status(404).json({
        error: "Ride not found.",
      });
    }

    await rideRef.update({ seats });

    res.json({
      success: true,
      message: "Ride seats updated successfully.",
    });
  } catch (error) {
    console.error("Admin update ride error:", error);

    res.status(500).json({
      error: "Failed to update ride.",
    });
  }
});

// Delete Ride
router.post("/delete-ride", async (req, res) => {
  try {
    const { rideId } = req.body;

    if (!rideId || typeof rideId !== "string") {
      return res.status(400).json({
        error: "Valid ride ID is required.",
      });
    }

    const rideRef = db.collection("rides").doc(rideId);
    const rideDoc = await rideRef.get();

    if (!rideDoc.exists) {
      return res.status(404).json({
        error: "Ride not found.",
      });
    }

    await rideRef.delete();

    res.json({
      success: true,
      message: "Ride deleted successfully.",
    });
  } catch (error) {
    console.error("Admin delete ride error:", error);

    res.status(500).json({
      error: "Failed to delete ride.",
    });
  }
});

// ========================================
// Booking Management
// ========================================

// Get All Bookings
router.post("/bookings", async (req, res) => {
  try {
    const snapshot = await db.collection("bookings").get();

    const data = snapshot.docs.map((document) => ({
      id: document.id,
      ...document.data(),
    }));

    res.json({ success: true, data });
  } catch (error) {
    console.error("Admin bookings error:", error);

    res.status(500).json({
      error: "Failed to fetch bookings.",
    });
  }
});

// Delete Booking
router.post("/delete-booking", async (req, res) => {
  try {
    const { bookingId } = req.body;

    if (!bookingId || typeof bookingId !== "string") {
      return res.status(400).json({
        error: "Valid booking ID is required.",
      });
    }

    const bookingRef = db.collection("bookings").doc(bookingId);
    const bookingDoc = await bookingRef.get();

    if (!bookingDoc.exists) {
      return res.status(404).json({
        error: "Booking not found.",
      });
    }

    await bookingRef.delete();

    res.json({
      success: true,
      message: "Booking deleted successfully.",
    });
  } catch (error) {
    console.error("Admin delete booking error:", error);

    res.status(500).json({
      error: "Failed to delete booking.",
    });
  }
});

// ========================================
// User Management
// ========================================

// Get All Users
router.post("/users", async (req, res) => {
  try {
    const snapshot = await db.collection("users").get();

    const data = snapshot.docs.map((document) => ({
      id: document.id,
      ...document.data(),
    }));

    res.json({ success: true, data });
  } catch (error) {
    console.error("Admin users error:", error);

    res.status(500).json({
      error: "Failed to fetch users.",
    });
  }
});

// Delete User Profile
router.post("/delete-user", async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId || typeof userId !== "string") {
      return res.status(400).json({
        error: "Valid user ID is required.",
      });
    }

    // Prevent the admin from deleting their own profile through this route.
    if (userId === req.user.uid) {
      return res.status(400).json({
        error: "You cannot delete your own admin profile.",
      });
    }

    const userRef = db.collection("users").doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return res.status(404).json({
        error: "User profile not found.",
      });
    }

    await userRef.delete();

    res.json({
      success: true,
      message: "User profile deleted successfully.",
    });
  } catch (error) {
    console.error("Admin delete user error:", error);

    res.status(500).json({
      error: "Failed to delete user profile.",
    });
  }
});

// ========================================
// Export Router
// ========================================

module.exports = router;