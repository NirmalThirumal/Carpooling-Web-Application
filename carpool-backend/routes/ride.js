const express = require("express");
const router = express.Router();

const db = require("../config/firebase");
const verifyToken = require("../middleware/verifyToken");

// ========================================
// CREATE RIDE
// POST /api/rides/create-ride
// Authenticated users only
// ========================================

router.post("/create-ride", verifyToken, async (req, res) => {
  try {
    const {
      pickup,
      destination,
      distance,
      seats,
      departureDate,
      departureTime,
      basePrice,
      serviceFee,
      totalPrice,
    } = req.body;

    // ========================================
    // VALIDATE REQUIRED FIELDS
    // ========================================

    if (
      typeof pickup !== "string" ||
      !pickup.trim() ||
      typeof destination !== "string" ||
      !destination.trim() ||
      !departureDate ||
      !departureTime
    ) {
      return res.status(400).json({
        success: false,
        error: "Pickup, destination, date and time are required",
      });
    }

    // ========================================
    // VALIDATE NUMERIC VALUES
    // ========================================

    const numericDistance = Number(distance);
    const numericSeats = Number(seats);
    const numericBasePrice = Number(basePrice);
    const numericServiceFee = Number(serviceFee);
    const numericTotalPrice = Number(totalPrice);

    if (
      !Number.isFinite(numericDistance) ||
      numericDistance <= 0 ||
      !Number.isInteger(numericSeats) ||
      numericSeats < 1 ||
      numericSeats > 8 ||
      !Number.isFinite(numericBasePrice) ||
      numericBasePrice < 0 ||
      !Number.isFinite(numericServiceFee) ||
      numericServiceFee < 0 ||
      !Number.isFinite(numericTotalPrice) ||
      numericTotalPrice < 0
    ) {
      return res.status(400).json({
        success: false,
        error: "Invalid distance, seats or pricing details",
      });
    }

    // ========================================
    // VALIDATE DEPARTURE DATE
    // Expected format: YYYY-MM-DD
    // ========================================

    const datePattern = /^\d{4}-\d{2}-\d{2}$/;

    if (!datePattern.test(departureDate)) {
      return res.status(400).json({
        success: false,
        error: "Invalid departure date. Use YYYY-MM-DD.",
      });
    }

    // Validate actual calendar date without timezone conversion.
    const [year, month, day] = departureDate.split("-").map(Number);

    const isValidDate =
      year >= 1000 &&
      year <= 9999 &&
      month >= 1 &&
      month <= 12 &&
      day >= 1 &&
      day <= new Date(Date.UTC(year, month, 0)).getUTCDate();

    if (!isValidDate) {
      return res.status(400).json({
        success: false,
        error: "Invalid departure date.",
      });
    }

    // Get today's date in India (YYYY-MM-DD).
    const todayInIndia = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    // Prevent past departure dates.
    if (departureDate < todayInIndia) {
      return res.status(400).json({
        success: false,
        error: "Departure date cannot be in the past.",
      });
    }

    // ========================================
    // VALIDATE DEPARTURE TIME
    // Expected format: HH:MM
    // ========================================

    const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

    if (!timePattern.test(departureTime)) {
      return res.status(400).json({
        success: false,
        error: "Invalid departure time",
      });
    }

    // ========================================
    // SERVER-SIDE PRICE VALIDATION
    // ========================================

    const expectedBasePrice = Number(
      (numericDistance * 3).toFixed(2)
    );

    const expectedServiceFee = Number(
      (expectedBasePrice * 0.10).toFixed(2)
    );

    const expectedTotalPrice = Number(
      (expectedBasePrice + expectedServiceFee).toFixed(2)
    );

    if (
      Math.abs(numericBasePrice - expectedBasePrice) > 0.02 ||
      Math.abs(numericServiceFee - expectedServiceFee) > 0.02 ||
      Math.abs(numericTotalPrice - expectedTotalPrice) > 0.02
    ) {
      return res.status(400).json({
        success: false,
        error: "Pricing details do not match the calculated fare",
      });
    }

    // ========================================
    // CREATE RIDE DOCUMENT
    // ========================================

    const rideData = {
      pickup: pickup.trim(),
      destination: destination.trim(),
      distance: numericDistance,
      seats: numericSeats,
      departureDate,
      departureTime,

      basePrice: expectedBasePrice,
      serviceFee: expectedServiceFee,
      totalPrice: expectedTotalPrice,

      // Driver identity from verified Firebase token.
      userId: req.user.uid,
      userEmail: req.user.email || "",
      userName: req.user.name || "",

      // Filled in during Step 2 (RideDetails.jsx).
      carName: "",
      carImage: "",
      driverName: "",
      driverContact: "",
      driverLicense: "",

      createdAt: new Date(),
    };

    const rideRef = await db.collection("rides").add(rideData);

    console.log(
      "Ride created:",
      rideRef.id,
      "Driver:",
      req.user.uid
    );

    return res.status(201).json({
      success: true,
      message: "Ride created successfully",
      rideId: rideRef.id,
    });
  } catch (error) {
    console.error("Create ride error:", error);

    return res.status(500).json({
      success: false,
      error: "Failed to create ride",
    });
  }
});

// ========================================
// EXPORT ROUTER
// ========================================

module.exports = router;