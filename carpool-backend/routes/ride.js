const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

const Ride = require("../models/Ride");
const User = require("../models/User");
const Review = require("../models/Review");
const verifyToken = require("../middleware/verifyToken");

// ========================================
// CREATE RIDE
// POST /api/create-ride
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

    const datePattern = /^\d{4}-\d{2}-\d{2}$/;

    if (!datePattern.test(departureDate)) {
      return res.status(400).json({
        success: false,
        error: "Invalid departure date. Use YYYY-MM-DD.",
      });
    }

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

    const todayInIndia = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    if (departureDate < todayInIndia) {
      return res.status(400).json({
        success: false,
        error: "Departure date cannot be in the past.",
      });
    }

    const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

    if (!timePattern.test(departureTime)) {
      return res.status(400).json({
        success: false,
        error: "Invalid departure time. Use HH:mm format.",
      });
    }

    const departureDateTime = new Date(
      `${departureDate}T${departureTime}:00+05:30`
    );

    if (
      Number.isNaN(departureDateTime.getTime()) ||
      departureDateTime <= new Date()
    ) {
      return res.status(400).json({
        success: false,
        error: "Departure date and time must be in the future.",
      });
    }

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

    const ride = await Ride.create({
      pickup: pickup.trim(),
      destination: destination.trim(),
      distance: numericDistance,
      seats: numericSeats,
      departureDate,
      departureTime,
      basePrice: expectedBasePrice,
      serviceFee: expectedServiceFee,
      totalPrice: expectedTotalPrice,
      userId: req.user.uid,
      userEmail: req.user.email || "",
      userName: req.user.name || "",
      carName: "",
      carImage: "",
      driverName: "",
      driverContact: "",
      driverLicense: "",
      status: "draft",
    });

    console.log(
      "Ride created in MongoDB:",
      ride._id,
      "Driver:",
      req.user.uid
    );

    return res.status(201).json({
      success: true,
      message: "Ride created successfully",
      rideId: ride._id.toString(),
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
// UPDATE DRIVER AND CAR DETAILS
// PUT /api/rides/:rideId/details
// ========================================

router.put(
  "/rides/:rideId/details",
  verifyToken,
  async (req, res) => {
    try {
      const { rideId } = req.params;

      const {
        carName,
        carImage,
        driverName,
        driverContact,
        driverLicense,
      } = req.body;

      if (!mongoose.Types.ObjectId.isValid(rideId)) {
        return res.status(400).json({
          success: false,
          error: "Invalid ride ID",
        });
      }

      if (
        typeof carName !== "string" ||
        !carName.trim() ||
        typeof carImage !== "string" ||
        !carImage.trim() ||
        typeof driverName !== "string" ||
        !driverName.trim() ||
        typeof driverContact !== "string" ||
        !/^[6-9]\d{9}$/.test(driverContact) ||
        typeof driverLicense !== "string" ||
        !driverLicense.trim()
      ) {
        return res.status(400).json({
          success: false,
          error: "Please provide valid driver and car details",
        });
      }

      const ride = await Ride.findOneAndUpdate(
        {
          _id: rideId,
          userId: req.user.uid,
          status: "draft",
        },
        {
          $set: {
            carName: carName.trim(),
            carImage: carImage.trim(),
            driverName: driverName.trim(),
            driverContact,
            driverLicense: driverLicense.trim(),
            status: "published",
          },
        },
        {
          returnDocument: "after",
          runValidators: true,
        }
      );

      if (!ride) {
        return res.status(404).json({
          success: false,
          error: "Ride not found or you are not authorized to update it",
        });
      }

      console.log(
        "Ride published in MongoDB:",
        ride._id,
        "Driver:",
        req.user.uid
      );

      return res.json({
        success: true,
        message: "Ride details saved and published successfully",
        rideId: ride._id.toString(),
      });
    } catch (error) {
      console.error("Update ride details error:", error);

      return res.status(500).json({
        success: false,
        error: "Failed to update ride details",
      });
    }
  }
);

// ========================================
// GET ALL PUBLISHED RIDES
// GET /api/rides
// ========================================

router.get("/rides", verifyToken, async (req, res) => {
  try {
    const todayInIndia = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    const rides = await Ride.find({
      status: "published",
      seats: { $gt: 0 },
      departureDate: { $gte: todayInIndia },
    }).sort({
      departureDate: 1,
      departureTime: 1,
    });

    return res.status(200).json({
      success: true,
      count: rides.length,
      rides: rides.map((ride) => ({
        ...ride.toObject(),
        id: ride._id.toString(),
      })),
    });
  } catch (error) {
    console.error("Fetch published rides error:", error);

    return res.status(500).json({
      success: false,
      error: "Failed to fetch published rides",
    });
  }
});

// ========================================
// GET RIDES POSTED BY LOGGED-IN USER
// GET /api/my-rides
// ========================================

router.get("/my-rides", verifyToken, async (req, res) => {
  try {
    const rides = await Ride.find({
      userId: req.user.uid,
    }).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: rides.length,
      rides: rides.map((ride) => ({
        ...ride.toObject(),
        id: ride._id.toString(),
      })),
    });
  } catch (error) {
    console.error("Fetch user rides error:", error);

    return res.status(500).json({
      success: false,
      error: "Failed to fetch your rides",
    });
  }
});

// ========================================
// GET SINGLE RIDE DETAILS
// GET /api/rides/:rideId
// ========================================

router.get("/rides/:rideId", verifyToken, async (req, res) => {
  try {
    const { rideId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(rideId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid ride ID",
      });
    }

    const ride = await Ride.findOne({
      _id: rideId,
      status: { $in: ["published", "fully_booked"] },
    }).lean();

    if (!ride) {
      return res.status(404).json({
        success: false,
        error: "Ride not found",
      });
    }

    const driverProfile = await User.findOne({
      uid: ride.userId,
    })
      .select("name email photo")
      .lean();

    const driver = {
      name: ride.driverName || driverProfile?.name || "",
      email: driverProfile?.email || ride.userEmail || "",
      photo: driverProfile?.photo || "",
    };

    return res.status(200).json({
      success: true,
      ride: {
        ...ride,
        id: ride._id.toString(),
      },
      driver,
    });
  } catch (error) {
    console.error("Fetch single ride error:", error);

    return res.status(500).json({
      success: false,
      error: "Failed to fetch ride details",
    });
  }
});

// ========================================
// EXPORT ROUTER
// ========================================


// ========================================
// GET DRIVER PROFILE AND REVIEWS
// GET /api/drivers/:driverId
// ========================================

router.get("/drivers/:driverId", verifyToken, async (req, res) => {
  try {
    const { driverId } = req.params;

    // Find the driver in the MongoDB users collection.
    const userProfile = await User.findOne({ uid: driverId })
      .select("uid name email photo")
      .lean();

    // Use the driver's ride records as a fallback
    // if a user profile document is unavailable.
    const driverRide = await Ride.findOne({
      userId: driverId
    })
      .sort({ createdAt: -1 })
      .lean();

    if (!userProfile && !driverRide) {
      return res.status(404).json({
        success: false,
        error: "Driver profile not found."
      });
    }

    const driver = {
      id: driverId,
      uid: driverId,
      name:
        userProfile?.name ||
        driverRide?.driverName ||
        "Driver",
      email:
        userProfile?.email ||
        driverRide?.userEmail ||
        "",
      photo: userProfile?.photo || ""
    };

    // Fetch reviews stored in MongoDB.
    const reviewsData = await Review.find({
      driverId
    })
      .sort({ createdAt: -1 })
      .lean();

    // Get reviewer names from MongoDB user records.
    const reviewerIds = [
      ...new Set(
        reviewsData
          .map((review) => review.reviewerId)
          .filter(Boolean)
      )
    ];

    const reviewers = reviewerIds.length
      ? await User.find({
          uid: { $in: reviewerIds }
        })
          .select("uid name")
          .lean()
      : [];

    const reviewerMap = Object.fromEntries(
      reviewers.map((reviewer) => [
        reviewer.uid,
        reviewer.name
      ])
    );

    const reviews = reviewsData.map((review) => ({
      ...review,
      id: review._id.toString(),
      passengerName:
        reviewerMap[review.reviewerId] || "Passenger"
    }));

    const validRatings = reviews.filter(
      (review) =>
        Number.isFinite(review.rating) &&
        review.rating >= 1 &&
        review.rating <= 5
    );

    const averageRating = validRatings.length
      ? Number(
          (
            validRatings.reduce(
              (sum, review) => sum + review.rating,
              0
            ) / validRatings.length
          ).toFixed(1)
        )
      : null;

    return res.status(200).json({
      success: true,
      driver,
      reviews,
      averageRating
    });
  } catch (error) {
    console.error("Fetch driver profile error:", error);

    return res.status(500).json({
      success: false,
      error: "Failed to fetch driver profile."
    });
  }
});


module.exports = router;