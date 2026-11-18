const express = require("express");
const mongoose = require("mongoose");
const crypto = require("crypto");

const router = express.Router();

const Ride = require("../models/Ride");
const Booking = require("../models/Booking");
const Review = require("../models/Review");
const Notification = require("../models/Notification");
const verifyToken = require("../middleware/verifyToken");

router.use(verifyToken);

// ========================================
// HELPERS
// ========================================

const sendError = (res, status, message) =>
  res.status(status).json({
    success: false,
    error: message,
  });

const isValidObjectId = (id) =>
  mongoose.Types.ObjectId.isValid(id);

const getRefundStatus = (booking) => {
  if (booking.paymentProvider === "mock") {
    return "not_required";
  }

  if (
    booking.paymentMethod === "online" &&
    booking.paymentStatus === "paid"
  ) {
    return "refund_pending";
  }

  return "not_required";
};

// Save notifications in MongoDB.
const createNotification = async ({
  recipientId,
  senderId,
  type,
  title,
  message,
  rideId,
  bookingId,
}) => {
  try {
    await Notification.create({
      recipientId,
      senderId,
      type,
      title,
      message,
      rideId: rideId || null,
      bookingId: bookingId || null,
      read: false,
    });
  } catch (error) {
    console.error("Notification creation error:", error);
  }
};

const notifyMany = async (notifications) => {
  await Promise.all(
    notifications.map((notification) =>
      createNotification(notification)
    )
  );
};

const getDepartureDateTime = (ride) => {
  if (!ride.departureDate || !ride.departureTime) {
    throw new Error("DEPARTURE_DETAILS_MISSING");
  }

  const dateTime = new Date(
    `${ride.departureDate}T${ride.departureTime}:00+05:30`
  );

  if (Number.isNaN(dateTime.getTime())) {
    throw new Error("INVALID_DEPARTURE_DETAILS");
  }

  return dateTime;
};


// ========================================
// GET SINGLE BOOKING FOR CHAT
// GET /api/bookings/:bookingId
// ========================================

router.get("/bookings/:bookingId", async (req, res) => {
  try {
    const { bookingId } = req.params;

    if (!isValidObjectId(bookingId)) {
      return sendError(res, 400, "Invalid booking ID.");
    }

    const booking = await Booking.findById(bookingId).lean();

    if (!booking) {
      return sendError(res, 404, "Booking not found.");
    }

    // Only the passenger or driver can access this booking.
    if (
      booking.userId !== req.user.uid &&
      booking.driverId !== req.user.uid
    ) {
      return sendError(
        res,
        403,
        "You are not authorized to access this booking."
      );
    }

    // Fetch the associated ride from MongoDB.
    const ride = booking.rideId && isValidObjectId(booking.rideId)
      ? await Ride.findById(booking.rideId).lean()
      : null;

    // Check whether a review already exists for this booking.
    const existingReview = await Review.findOne({
      bookingId: String(booking._id)
    })
      .select("_id")
      .lean();

    return res.status(200).json({
      success: true,

      booking: {
        ...booking,
        id: booking._id.toString()
      },

      ride: ride
        ? {
            ...ride,
            id: ride._id.toString()
          }
        : null,

      alreadyReviewed: Boolean(existingReview)
    });

  } catch (error) {
    console.error("Fetch single booking error:", error);

    return sendError(res, 500, "Failed to fetch booking.");
  }
});

// ========================================
// GET BOOKINGS MADE BY LOGGED-IN PASSENGER
// GET /api/my-bookings
// ========================================

router.get("/my-bookings", async (req, res) => {
  try {
    const bookings = await Booking.find({
      userId: req.user.uid,
    })
      .sort({ createdAt: -1 })
      .lean();

    const rideIds = [
      ...new Set(
        bookings
          .map((booking) => booking.rideId)
          .filter((id) => id && isValidObjectId(id))
          .map(String)
      ),
    ];

    const rides = rideIds.length
      ? await Ride.find({
          _id: { $in: rideIds },
        }).lean()
      : [];

    const bookingIds = bookings.map((booking) =>
      String(booking._id)
    );

    const reviews = bookingIds.length
      ? await Review.find({
          bookingId: { $in: bookingIds },
        })
          .select("bookingId")
          .lean()
      : [];

    return res.status(200).json({
      success: true,
      bookings: bookings.map((booking) => ({
        ...booking,
        id: booking._id.toString(),
      })),
      rides: rides.map((ride) => ({
        ...ride,
        id: ride._id.toString(),
      })),
      reviewedBookingIds: reviews.map((review) =>
        String(review.bookingId)
      ),
    });
  } catch (error) {
    console.error("Fetch passenger bookings error:", error);

    return res.status(500).json({
      success: false,
      error: "Failed to fetch your bookings",
    });
  }
});


// ========================================
// GET BOOKINGS RECEIVED BY LOGGED-IN DRIVER
// GET /api/driver-bookings
// ========================================

router.get("/driver-bookings", async (req, res) => {
  try {
    const bookings = await Booking.find({
      driverId: req.user.uid,
    })
      .sort({ createdAt: -1 })
      .lean();

    const rideIds = [
      ...new Set(
        bookings
          .map((booking) => booking.rideId)
          .filter((id) => id && isValidObjectId(id))
          .map(String)
      ),
    ];

    const rides = rideIds.length
      ? await Ride.find({
          _id: { $in: rideIds },
        }).lean()
      : [];

    return res.status(200).json({
      success: true,
      bookings: bookings.map((booking) => ({
        ...booking,
        id: booking._id.toString(),
      })),
      rides: rides.map((ride) => ({
        ...ride,
        id: ride._id.toString(),
      })),
    });
  } catch (error) {
    console.error("Fetch driver bookings error:", error);

    return res.status(500).json({
      success: false,
      error: "Failed to fetch driver bookings",
    });
  }
});


// ========================================
// 1. CREATE BOOKING
// POST /api/book-ride
// ========================================

router.post("/book-ride", async (req, res) => {
  let session;

  try {
    const {
      rideId,
      passengerCount,
      passengerNames,
      contact,
      luggage,
      bags,
      seatType,
      paymentMethod,
    } = req.body;

    const passengerId = req.user.uid;

    if (
      !rideId ||
      !isValidObjectId(rideId) ||
      !Number.isInteger(passengerCount) ||
      passengerCount < 1
    ) {
      return sendError(res, 400, "Invalid ride or passenger count.");
    }

    if (!contact || !/^[6-9]\d{9}$/.test(String(contact))) {
      return sendError(res, 400, "Enter a valid 10-digit mobile number.");
    }

    if (!["yes", "no"].includes(luggage)) {
      return sendError(res, 400, "Invalid luggage selection.");
    }

    const bagCount = luggage === "yes" ? Number(bags) : 0;

    if (
      !Number.isInteger(bagCount) ||
      bagCount < 0 ||
      (luggage === "yes" && (bagCount < 1 || bagCount > 20))
    ) {
      return sendError(res, 400, "Enter a valid number of bags.");
    }

    if (!["cash", "online"].includes(paymentMethod)) {
      return sendError(res, 400, "Invalid payment method.");
    }

    if (
      !Array.isArray(passengerNames) ||
      passengerNames.length !== passengerCount ||
      passengerNames.some(
        (name) => typeof name !== "string" || !name.trim()
      )
    ) {
      return sendError(res, 400, "Enter the name of every passenger.");
    }

    if (
      !["window", "middle", "aisle", "standard"].includes(
        seatType || "standard"
      )
    ) {
      return sendError(res, 400, "Invalid seat preference.");
    }

    session = await mongoose.startSession();

    let createdBooking;
    let bookingAmount = 0;
    let driverId;
    let pickup;
    let destination;

    await session.withTransaction(async () => {
      const ride = await Ride.findById(rideId).session(session);

      if (!ride) throw new Error("RIDE_NOT_FOUND");
      if (ride.status !== "published") {
        throw new Error("RIDE_NOT_AVAILABLE");
      }
      if (ride.userId === passengerId) {
        throw new Error("CANNOT_BOOK_OWN_RIDE");
      }

      if (
        !Number.isInteger(Number(ride.seats)) ||
        Number(ride.seats) < passengerCount
      ) {
        throw new Error("NOT_ENOUGH_SEATS");
      }

      const totalPrice = Number(ride.totalPrice);
      const basePrice = Number(ride.basePrice);
      const serviceFee = Number(ride.serviceFee);

      if (
        !Number.isFinite(totalPrice) ||
        !Number.isFinite(basePrice) ||
        !Number.isFinite(serviceFee)
      ) {
        throw new Error("INVALID_RIDE_PRICE");
      }

      bookingAmount = Number(
        (totalPrice * passengerCount).toFixed(2)
      );

      driverId = ride.userId;
      pickup = ride.pickup;
      destination = ride.destination;

      const booking = new Booking({
        rideId: ride._id.toString(),
        driverId: ride.userId,
        userId: passengerId,
        userEmail: req.user.email || "",
        userName: req.user.name || req.user.email || "Passenger",
        passengerCount,
        passengerNames: passengerNames.map((name) => name.trim()),
        contact: String(contact),
        luggage,
        bags: bagCount,
        seatType: seatType || "standard",
        amount: bookingAmount,
        paymentMethod,
        paymentStatus: paymentMethod === "cash" ? "pending" : "unpaid",
        refundStatus: "not_required",
        driverEarning: Number(
          (basePrice * passengerCount).toFixed(2)
        ),
        platformFee: Number(
          (serviceFee * passengerCount).toFixed(2)
        ),
        status: "pending",
      });

      await booking.save({ session });
      createdBooking = booking;
    });

    await createNotification({
      recipientId: driverId,
      senderId: passengerId,
      type: "booking_request",
      title: "New booking request",
      message: `${req.user.name || req.user.email || "A passenger"} requested ${passengerCount} seat(s) for your ride from ${pickup || "your pickup location"} to ${destination || "your destination"}.`,
      rideId,
      bookingId: createdBooking._id.toString(),
    });

    return res.status(201).json({
      success: true,
      message: "Booking request submitted successfully.",
      bookingId: createdBooking._id.toString(),
      amount: bookingAmount,
    });
  } catch (err) {
    console.error("Create booking error:", err);

    const errors = {
      RIDE_NOT_FOUND: [404, "Ride not found."],
      RIDE_NOT_AVAILABLE: [400, "This ride is not currently available."],
      CANNOT_BOOK_OWN_RIDE: [400, "You cannot book your own ride."],
      NOT_ENOUGH_SEATS: [400, "Not enough seats available."],
      INVALID_RIDE_PRICE: [400, "Ride pricing is invalid."],
    };

    if (errors[err.message]) {
      return sendError(res, ...errors[err.message]);
    }

    return sendError(res, 500, "Unable to create booking.");
  } finally {
    if (session) await session.endSession();
  }
});
// ========================================
// 2. ACCEPT BOOKING
// POST /api/accept-booking
// ========================================

router.post("/accept-booking", async (req, res) => {
  let session;

  try {
    const { bookingId } = req.body;
    const driverId = req.user.uid;

    if (!bookingId || !isValidObjectId(bookingId)) {
      return sendError(res, 400, "A valid booking ID is required.");
    }

    session = await mongoose.startSession();

    let passengerId;
    let rideId;

    await session.withTransaction(async () => {
      const booking = await Booking.findById(bookingId).session(session);

      if (!booking) throw new Error("BOOKING_NOT_FOUND");
      if (booking.driverId !== driverId) {
        throw new Error("NOT_BOOKING_DRIVER");
      }
      if (booking.status !== "pending") {
        throw new Error("BOOKING_ALREADY_PROCESSED");
      }

      const ride = await Ride.findOneAndUpdate(
        {
          _id: booking.rideId,
          userId: driverId,
          status: "published",
          seats: { $gte: booking.passengerCount },
        },
        {
          $inc: { seats: -booking.passengerCount },
        },
        {
          new: true,
          session,
          runValidators: true,
        }
      );

      if (!ride) {
        const existingRide = await Ride.findById(
          booking.rideId
        ).session(session);

        if (!existingRide) throw new Error("RIDE_NOT_FOUND");
        if (existingRide.status !== "published") {
          throw new Error("RIDE_NOT_AVAILABLE");
        }

        throw new Error("NOT_ENOUGH_SEATS");
      }

      if (ride.seats === 0) {
        ride.status = "fully_booked";
        await ride.save({ session });
      }

      booking.status = "accepted";
      booking.acceptedAt = new Date();
      await booking.save({ session });

      passengerId = booking.userId;
      rideId = booking.rideId;
    });

    await createNotification({
      recipientId: passengerId,
      senderId: driverId,
      type: "booking_accepted",
      title: "Booking accepted",
      message: "The driver has accepted your ride booking request.",
      rideId,
      bookingId,
    });

    return res.json({
      success: true,
      message: "Booking accepted successfully.",
    });
  } catch (err) {
    console.error("Accept booking error:", err);

    const errors = {
      BOOKING_NOT_FOUND: [404, "Booking not found."],
      NOT_BOOKING_DRIVER: [
        403,
        "You are not authorized to accept this booking.",
      ],
      BOOKING_ALREADY_PROCESSED: [
        400,
        "This booking has already been processed.",
      ],
      RIDE_NOT_FOUND: [404, "Ride not found."],
      RIDE_NOT_AVAILABLE: [400, "This ride is not available."],
      NOT_ENOUGH_SEATS: [400, "Not enough seats available."],
    };

    if (errors[err.message]) {
      return sendError(res, ...errors[err.message]);
    }

    return sendError(res, 500, "Unable to accept booking.");
  } finally {
    if (session) await session.endSession();
  }
});

// ========================================
// 3. REJECT BOOKING
// POST /api/reject-booking
// ========================================

router.post("/reject-booking", async (req, res) => {
  try {
    const { bookingId } = req.body;
    const driverId = req.user.uid;

    if (!bookingId || !isValidObjectId(bookingId)) {
      return sendError(res, 400, "A valid booking ID is required.");
    }

    const booking = await Booking.findOneAndUpdate(
      {
        _id: bookingId,
        driverId,
        status: "pending",
      },
      {
        $set: {
          status: "rejected",
          rejectedAt: new Date(),
        },
      },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!booking) {
      const existing = await Booking.findById(bookingId);

      if (!existing) return sendError(res, 404, "Booking not found.");

      if (existing.driverId !== driverId) {
        return sendError(
          res,
          403,
          "You are not authorized to reject this booking."
        );
      }

      return sendError(
        res,
        400,
        "This booking has already been processed."
      );
    }

    await createNotification({
      recipientId: booking.userId,
      senderId: driverId,
      type: "booking_rejected",
      title: "Booking request rejected",
      message: "The driver has rejected your booking request.",
      rideId: booking.rideId,
      bookingId,
    });

    return res.json({
      success: true,
      message: "Booking rejected successfully.",
    });
  } catch (err) {
    console.error("Reject booking error:", err);
    return sendError(res, 500, "Unable to reject booking.");
  }
});

// ========================================
// 4. CANCEL BOOKING
// POST /api/cancel-booking
// ========================================

router.post("/cancel-booking", async (req, res) => {
  let session;

  try {
    const { bookingId } = req.body;
    const passengerId = req.user.uid;

    if (!bookingId || !isValidObjectId(bookingId)) {
      return sendError(res, 400, "A valid booking ID is required.");
    }

    session = await mongoose.startSession();

    let refundStatus = "not_required";
    let driverId;
    let rideId;
    let userName;

    await session.withTransaction(async () => {
      const booking = await Booking.findById(bookingId).session(session);

      if (!booking) throw new Error("BOOKING_NOT_FOUND");

      if (booking.userId !== passengerId) {
        throw new Error("NOT_BOOKING_PASSENGER");
      }

      if (!["pending", "accepted"].includes(booking.status)) {
        throw new Error("BOOKING_CANNOT_CANCEL");
      }

      if (booking.status === "accepted") {
        const ride = await Ride.findById(
          booking.rideId
        ).session(session);

        if (!ride) throw new Error("RIDE_NOT_FOUND");

        if (["cancelled", "completed"].includes(ride.status)) {
          throw new Error("RIDE_CANNOT_RESTORE_SEATS");
        }

        ride.seats += booking.passengerCount;

        if (ride.status === "fully_booked") {
          ride.status = "published";
        }

        await ride.save({ session });
      }

      refundStatus = getRefundStatus(booking);
      driverId = booking.driverId;
      rideId = booking.rideId;
      userName = booking.userName;

      booking.status = "cancelled";
      booking.cancelledAt = new Date();
      booking.cancelledBy = "passenger";
      booking.refundStatus = refundStatus;

      await booking.save({ session });
    });

    await createNotification({
      recipientId: driverId,
      senderId: passengerId,
      type: "booking_cancelled",
      title: "Passenger cancelled booking",
      message: `${userName || "A passenger"} cancelled their booking.`,
      rideId,
      bookingId,
    });

    return res.json({
      success: true,
      message: "Booking cancelled successfully.",
      refundStatus,
    });
  } catch (err) {
    console.error("Cancel booking error:", err);

    const errors = {
      BOOKING_NOT_FOUND: [404, "Booking not found."],
      NOT_BOOKING_PASSENGER: [
        403,
        "You are not authorized to cancel this booking.",
      ],
      BOOKING_CANNOT_CANCEL: [
        400,
        "This booking cannot be cancelled.",
      ],
      RIDE_NOT_FOUND: [404, "Associated ride not found."],
      RIDE_CANNOT_RESTORE_SEATS: [
        400,
        "This ride can no longer have seats restored.",
      ],
    };

    if (errors[err.message]) {
      return sendError(res, ...errors[err.message]);
    }

    return sendError(res, 500, "Unable to cancel booking.");
  } finally {
    if (session) await session.endSession();
  }
});
// 5. CANCEL RIDE
// POST /api/cancel-ride
// ========================================

router.post("/cancel-ride", async (req, res) => {
  let session;

  try {
    const { rideId } = req.body;
    const driverId = req.user.uid;

    if (!rideId || !isValidObjectId(rideId)) {
      return sendError(res, 400, "A valid ride ID is required.");
    }

    session = await mongoose.startSession();

    let affectedBookings = [];
    let refundCount = 0;
    let pickup;
    let destination;

    await session.withTransaction(async () => {
      const ride = await Ride.findById(rideId).session(session);

      if (!ride) throw new Error("RIDE_NOT_FOUND");

      if (ride.userId !== driverId) {
        throw new Error("NOT_RIDE_DRIVER");
      }

      if (["cancelled", "completed"].includes(ride.status)) {
        throw new Error("RIDE_ALREADY_CLOSED");
      }

      pickup = ride.pickup;
      destination = ride.destination;

      ride.status = "cancelled";
      ride.seats = 0;
      ride.cancelledAt = new Date();
      ride.cancelledBy = "driver";

      await ride.save({ session });

      affectedBookings = await Booking.find({
        rideId: ride._id.toString(),
        status: { $in: ["pending", "accepted"] },
      }).session(session);

      for (const booking of affectedBookings) {
        const refundStatus = getRefundStatus(booking);

        booking.status = "cancelled";
        booking.cancelledAt = new Date();
        booking.cancelledBy = "driver";
        booking.refundStatus = refundStatus;

        if (refundStatus === "refund_pending") {
          refundCount++;
        }

        await booking.save({ session });
      }
    });

    await notifyMany(
      affectedBookings.map((booking) => ({
        recipientId: booking.userId,
        senderId: driverId,
        type: "ride_cancelled",
        title: "Ride cancelled by driver",
        message: `Your ride from ${pickup || "your pickup location"} to ${destination || "your destination"} has been cancelled by the driver.`,
        rideId,
        bookingId: booking._id.toString(),
      }))
    );

    return res.json({
      success: true,
      message: "Ride and its active bookings have been cancelled.",
      affectedBookings: affectedBookings.length,
      refundCount,
    });
  } catch (err) {
    console.error("Cancel ride error:", err);

    const errors = {
      RIDE_NOT_FOUND: [404, "Ride not found."],
      NOT_RIDE_DRIVER: [
        403,
        "You are not authorized to cancel this ride.",
      ],
      RIDE_ALREADY_CLOSED: [
        400,
        "This ride is already cancelled or completed.",
      ],
    };

    if (errors[err.message]) {
      return sendError(res, ...errors[err.message]);
    }

    return sendError(res, 500, "Unable to cancel ride.");
  } finally {
    if (session) await session.endSession();
  }
});

// 6. COMPLETE RIDE
// POST /api/complete-ride
// ========================================

router.post("/complete-ride", async (req, res) => {
  let session;

  try {
    const { rideId } = req.body;
    const driverId = req.user.uid;

    if (!rideId || !isValidObjectId(rideId)) {
      return sendError(res, 400, "A valid ride ID is required.");
    }

    session = await mongoose.startSession();

    let completedBookings = [];
    let closedPendingBookings = [];
    let ridePickup;
    let rideDestination;

    await session.withTransaction(async () => {
      const ride = await Ride.findById(rideId).session(session);

      if (!ride) throw new Error("RIDE_NOT_FOUND");
      if (ride.userId !== driverId) {
        throw new Error("NOT_RIDE_DRIVER");
      }
      if (ride.status === "cancelled") {
        throw new Error("RIDE_CANCELLED");
      }
      if (ride.status === "completed") {
        throw new Error("RIDE_ALREADY_COMPLETED");
      }
      if (!["published", "fully_booked"].includes(ride.status)) {
        throw new Error("RIDE_NOT_AVAILABLE");
      }

      const departureDateTime = getDepartureDateTime(ride);

      if (Date.now() < departureDateTime.getTime()) {
        throw new Error("RIDE_NOT_DEPARTED");
      }

      ride.status = "completed";
      ride.completedAt = new Date();

      await ride.save({ session });

      const activeBookings = await Booking.find({
        rideId: ride._id.toString(),
        status: { $in: ["pending", "accepted"] },
      }).session(session);

      ridePickup = ride.pickup;
      rideDestination = ride.destination;

      for (const booking of activeBookings) {
        if (booking.status === "accepted") {
          booking.status = "completed";
          booking.completedAt = new Date();
          completedBookings.push(booking);
        } else {
          booking.status = "rejected";
          booking.rejectedAt = new Date();
          booking.rejectionReason = "ride_completed";
          closedPendingBookings.push(booking);
        }

        await booking.save({ session });
      }
    });

    await notifyMany(
      closedPendingBookings.map((booking) => ({
        recipientId: booking.userId,
        senderId: driverId,
        type: "booking_rejected",
        title: "Booking request closed",
        message: `The ride from ${ridePickup || "your pickup location"} to ${rideDestination || "your destination"} has been completed. Your pending booking request is now closed.`,
        rideId,
        bookingId: booking._id.toString(),
      }))
    );

    return res.json({
      success: true,
      message: "Ride marked as completed successfully.",
      completedBookings: completedBookings.length,
      closedPendingBookings: closedPendingBookings.length,
    });
  } catch (err) {
    console.error("Complete ride error:", err);

    const errors = {
      RIDE_NOT_FOUND: [404, "Ride not found."],
      NOT_RIDE_DRIVER: [
        403,
        "You are not authorized to complete this ride.",
      ],
      RIDE_CANCELLED: [
        400,
        "A cancelled ride cannot be completed.",
      ],
      RIDE_ALREADY_COMPLETED: [
        400,
        "This ride is already completed.",
      ],
      RIDE_NOT_AVAILABLE: [
        400,
        "This ride cannot be completed in its current status.",
      ],
      DEPARTURE_DETAILS_MISSING: [
        400,
        "Ride departure date or time is missing.",
      ],
      INVALID_DEPARTURE_DETAILS: [
        400,
        "Ride departure date or time is invalid.",
      ],
      RIDE_NOT_DEPARTED: [
        400,
        "You can complete this ride only after its scheduled departure time.",
      ],
    };

    if (errors[err.message]) {
      return sendError(res, ...errors[err.message]);
    }

    return sendError(res, 500, "Unable to complete ride.");
  } finally {
    if (session) await session.endSession();
  }
});
// 7. SUBMIT REVIEW
// POST /api/submit-review
// ========================================

router.post("/submit-review", async (req, res) => {
  try {
    const { bookingId, rating, review } = req.body;
    const passengerId = req.user.uid;

    if (!bookingId || !isValidObjectId(bookingId)) {
      return sendError(res, 400, "A valid booking ID is required.");
    }

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return sendError(
        res,
        400,
        "Rating must be an integer between 1 and 5."
      );
    }

    if (
      typeof review !== "string" ||
      review.trim().length < 3 ||
      review.trim().length > 1000
    ) {
      return sendError(
        res,
        400,
        "Review must contain between 3 and 1000 characters."
      );
    }

    const booking = await Booking.findById(bookingId);

    if (!booking) {
      return sendError(res, 404, "Booking not found.");
    }

    if (booking.userId !== passengerId) {
      return sendError(
        res,
        403,
        "You are not authorized to review this booking."
      );
    }

    if (booking.status !== "completed") {
      return sendError(
        res,
        400,
        "You can review only completed bookings."
      );
    }

    const ride = await Ride.findById(booking.rideId);

    if (!ride) {
      return sendError(res, 404, "Associated ride not found.");
    }

    if (
      ride.status !== "completed" ||
      ride.userId !== booking.driverId
    ) {
      return sendError(
        res,
        400,
        "The associated ride has not been completed."
      );
    }

    const existingReview = await Review.findOne({ bookingId });

    if (existingReview) {
      return sendError(
        res,
        409,
        "You have already reviewed this booking."
      );
    }

    await Review.create({
      bookingId,
      rideId: booking.rideId,
      driverId: booking.driverId,
      reviewerId: passengerId,
      rating,
      review: review.trim(),
    });

    return res.status(201).json({
      success: true,
      message: "Review submitted successfully.",
    });
  } catch (err) {
    if (err.code === 11000) {
      return sendError(
        res,
        409,
        "You have already reviewed this booking."
      );
    }

    console.error("Submit review error:", err);

    return sendError(res, 500, "Unable to submit review.");
  }
});

// ========================================

// 8. MOCK ONLINE PAYMENT (DEMO ONLY)
// POST /api/mock-payment
// ========================================

router.post("/mock-payment", async (req, res) => {
  try {
    const { bookingId, outcome } = req.body;
    const passengerId = req.user.uid;

    if (!bookingId || !isValidObjectId(bookingId)) {
      return sendError(res, 400, "A valid booking ID is required.");
    }

    if (!["success", "failure"].includes(outcome)) {
      return sendError(res, 400, "Invalid demo payment outcome.");
    }

    const transactionId = `MOCK-${crypto.randomUUID()}`;

    const booking = await Booking.findById(bookingId);

    if (!booking) {
      return sendError(res, 404, "Booking not found.");
    }

    if (booking.userId !== passengerId) {
      return sendError(
        res,
        403,
        "You are not authorized to pay for this booking."
      );
    }

    if (booking.paymentMethod !== "online") {
      return sendError(
        res,
        400,
        "This booking does not use online payment."
      );
    }

    if (booking.paymentStatus === "paid") {
      return res.json({
        success: true,
        message: "Demo payment was already completed. No real money was transferred.",
        paymentStatus: "paid",
        transactionId: booking.paymentTransactionId || null,
        alreadyPaid: true,
        demo: true,
      });
    }

    if (!["pending", "accepted"].includes(booking.status)) {
      return sendError(
        res,
        400,
        "This booking is no longer active and cannot be paid."
      );
    }

    if (
      !["unpaid", "failed", undefined, null].includes(
        booking.paymentStatus
      )
    ) {
      return sendError(
        res,
        400,
        "This booking's payment cannot be retried."
      );
    }

    const now = new Date();

    if (outcome === "failure") {
      booking.paymentStatus = "failed";
      booking.paymentProvider = "mock";
      booking.paymentAttemptAt = now;
      booking.refundStatus = "not_required";

      await booking.save();

      return res.json({
        success: true,
        message: "Demo payment failed. The booking remains unpaid.",
        paymentStatus: "failed",
        transactionId: null,
        alreadyPaid: false,
        demo: true,
      });
    }

    booking.paymentStatus = "paid";
    booking.paymentProvider = "mock";
    booking.paymentTransactionId = transactionId;
    booking.paidAt = now;
    booking.paymentAttemptAt = now;
    booking.refundStatus = "not_required";

    await booking.save();

    return res.json({
      success: true,
      message: "Demo payment successful. No real money was transferred.",
      paymentStatus: "paid",
      transactionId,
      alreadyPaid: false,
      demo: true,
    });
  } catch (err) {
    console.error("Mock payment error:", err);

    return sendError(
      res,
      500,
      "Unable to process demo payment."
    );
  }
});

// ========================================
// EXPORT ROUTER
// ========================================

module.exports = router;