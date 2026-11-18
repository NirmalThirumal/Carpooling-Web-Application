
const express = require("express");
const mongoose = require("mongoose");

const router = express.Router();

const verifyToken = require("../middleware/verifyToken");

const User = require("../models/User");
const Ride = require("../models/Ride");
const Booking = require("../models/Booking");

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
      User.countDocuments(),
      Ride.countDocuments(),
      Booking.countDocuments(),
    ]);

    res.json({
      success: true,
      users,
      rides,
      bookings,
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
    const rides = await Ride.find()
      .sort({ createdAt: -1 })
      .lean();

    const data = rides.map((ride) => ({
      ...ride,
      id: String(ride._id),
    }));

    res.json({
      success: true,
      data,
    });
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

    if (
      !rideId ||
      typeof rideId !== "string" ||
      !mongoose.isValidObjectId(rideId)
    ) {
      return res.status(400).json({
        error: "Valid ride ID is required.",
      });
    }

    // Only allow the seats field to be changed through this endpoint.

    if (
      !updates ||
      typeof updates !== "object" ||
      Array.isArray(updates) ||
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

    const updatedRide = await Ride.findByIdAndUpdate(
      rideId,
      { $set: { seats } },
      { new: true, runValidators: true }
    );

    if (!updatedRide) {
      return res.status(404).json({
        error: "Ride not found.",
      });
    }

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

    if (
      !rideId ||
      typeof rideId !== "string" ||
      !mongoose.isValidObjectId(rideId)
    ) {
      return res.status(400).json({
        error: "Valid ride ID is required.",
      });
    }

    const deletedRide = await Ride.findByIdAndDelete(rideId);

    if (!deletedRide) {
      return res.status(404).json({
        error: "Ride not found.",
      });
    }

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
    const bookings = await Booking.find()
      .sort({ createdAt: -1 })
      .lean();

    const data = bookings.map((booking) => ({
      ...booking,
      id: String(booking._id),
    }));

    res.json({
      success: true,
      data,
    });
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

    if (
      !bookingId ||
      typeof bookingId !== "string" ||
      !mongoose.isValidObjectId(bookingId)
    ) {
      return res.status(400).json({
        error: "Valid booking ID is required.",
      });
    }

    const deletedBooking = await Booking.findByIdAndDelete(bookingId);

    if (!deletedBooking) {
      return res.status(404).json({
        error: "Booking not found.",
      });
    }

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
    const users = await User.find()
      .sort({ createdAt: -1 })
      .lean();

    const data = users.map((user) => ({
      ...user,
      id: user.uid,
    }));

    res.json({
      success: true,
      data,
    });
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

    // Prevent the admin from deleting their own profile.

    if (userId === req.user.uid) {
      return res.status(400).json({
        error: "You cannot delete your own admin profile.",
      });
    }

    // User documents are identified by Firebase UID.

    const deletedUser = await User.findOneAndDelete({
      uid: userId,
    });

    if (!deletedUser) {
      return res.status(404).json({
        error: "User profile not found.",
      });
    }

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
