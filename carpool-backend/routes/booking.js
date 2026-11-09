const express = require("express");
const crypto = require("crypto");
const router = express.Router();

const db = require("../config/firebase");
const verifyToken = require("../middleware/verifyToken");

// ========================================
// Authentication Middleware
// ========================================

// All booking and cancellation routes require Firebase authentication.
router.use(verifyToken);

// ========================================
// Helper Functions
// ========================================

// Standardized API error response.
const sendError = (res, status, message) => {
  return res.status(status).json({
    success: false,
    error: message,
  });
};

// Determine refund status.
// Actual refunds must be processed by a payment gateway.
const getRefundStatus = (booking) => {
  // Mock/demo payments do not transfer real money.
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

// Create a notification document for a user.
const createNotification = ({
  recipientId,
  senderId,
  type,
  title,
  message,
  rideId,
  bookingId,
}) => {
  const notificationRef = db.collection("notifications").doc();

  return {
    ref: notificationRef,
    data: {
      recipientId,
      senderId,
      type,
      title,
      message,
      rideId: rideId || null,
      bookingId: bookingId || null,
      read: false,
      createdAt: new Date(),
    },
  };
};

// ========================================
// 1. Create Booking
// POST /api/book-ride
// ========================================

router.post("/book-ride", async (req, res) => {
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

    // Validate ride and passenger count.
    if (
      !rideId ||
      !Number.isInteger(passengerCount) ||
      passengerCount < 1
    ) {
      return sendError(res, 400, "Invalid ride or passenger count.");
    }

    // Validate contact number.
    if (!contact || !/^[6-9]\d{9}$/.test(String(contact))) {
      return sendError(res, 400, "Enter a valid 10-digit mobile number.");
    }

    // Validate luggage selection.
    if (!["yes", "no"].includes(luggage)) {
      return sendError(res, 400, "Invalid luggage selection.");
    }

    const bagCount = luggage === "yes" ? Number(bags) : 0;

    if (
      !Number.isInteger(bagCount) ||
      bagCount < 0 ||
      (luggage === "yes" && bagCount < 1)
    ) {
      return sendError(res, 400, "Enter a valid number of bags.");
    }

    // Validate payment method.
    if (!["cash", "online"].includes(paymentMethod)) {
      return sendError(res, 400, "Invalid payment method.");
    }

    // Validate passenger names.
    if (
      !Array.isArray(passengerNames) ||
      passengerNames.length !== passengerCount ||
      passengerNames.some(
        (name) => typeof name !== "string" || !name.trim()
      )
    ) {
      return sendError(res, 400, "Enter the name of every passenger.");
    }

    const rideRef = db.collection("rides").doc(rideId);
    const bookingRef = db.collection("bookings").doc();

    let bookingAmount = 0;

    await db.runTransaction(async (transaction) => {
      const rideSnap = await transaction.get(rideRef);

      if (!rideSnap.exists) {
        throw new Error("RIDE_NOT_FOUND");
      }

      const ride = rideSnap.data();

      if (ride.status !== "published") {
        throw new Error("RIDE_NOT_AVAILABLE");
      }

      if (ride.userId === passengerId) {
        throw new Error("CANNOT_BOOK_OWN_RIDE");
      }

      if (
        !Number.isInteger(ride.seats) ||
        ride.seats < passengerCount
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

      transaction.create(bookingRef, {
        rideId,
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
        createdAt: new Date(),
      });

      // Notify the driver about the booking request.
      const notification = createNotification({
        recipientId: ride.userId,
        senderId: passengerId,
        type: "booking_request",
        title: "New booking request",
        message: `${req.user.name || req.user.email || "A passenger"} requested ${passengerCount} seat(s) for your ride from ${ride.pickup || "your pickup location"} to ${ride.destination || "your destination"}.`,
        rideId,
        bookingId: bookingRef.id,
      });

      transaction.create(notification.ref, notification.data);
    });

    return res.status(201).json({
      success: true,
      message: "Booking request submitted successfully.",
      bookingId: bookingRef.id,
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
  }
});

// ========================================
// 2. Accept Booking
// POST /api/accept-booking
// ========================================

router.post("/accept-booking", async (req, res) => {
  try {
    const { bookingId } = req.body;
    const driverId = req.user.uid;

    if (!bookingId) {
      return sendError(res, 400, "Booking ID is required.");
    }

    const bookingRef = db.collection("bookings").doc(bookingId);

    await db.runTransaction(async (transaction) => {
      const bookingSnap = await transaction.get(bookingRef);

      if (!bookingSnap.exists) {
        throw new Error("BOOKING_NOT_FOUND");
      }

      const booking = bookingSnap.data();

      if (booking.driverId !== driverId) {
        throw new Error("NOT_BOOKING_DRIVER");
      }

      if (booking.status !== "pending") {
        throw new Error("BOOKING_ALREADY_PROCESSED");
      }

      const rideRef = db.collection("rides").doc(booking.rideId);
      const rideSnap = await transaction.get(rideRef);

      if (!rideSnap.exists) {
        throw new Error("RIDE_NOT_FOUND");
      }

      const ride = rideSnap.data();

      if (ride.status !== "published") {
        throw new Error("RIDE_NOT_AVAILABLE");
      }

      if (ride.seats < booking.passengerCount) {
        throw new Error("NOT_ENOUGH_SEATS");
      }

      const remainingSeats = ride.seats - booking.passengerCount;

      transaction.update(rideRef, {
        seats: remainingSeats,
        status: remainingSeats === 0 ? "fully_booked" : "published",
      });

      transaction.update(bookingRef, {
        status: "accepted",
        acceptedAt: new Date(),
      });

      // Notify the passenger that the driver accepted the booking.
      const notification = createNotification({
        recipientId: booking.userId,
        senderId: driverId,
        type: "booking_accepted",
        title: "Booking accepted",
        message: "The driver has accepted your ride booking request.",
        rideId: booking.rideId,
        bookingId,
      });

      transaction.create(notification.ref, notification.data);
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
  }
});

// ========================================
// 3. Reject Booking
// POST /api/reject-booking
// ========================================

router.post("/reject-booking", async (req, res) => {
  try {
    const { bookingId } = req.body;
    const driverId = req.user.uid;

    if (!bookingId) {
      return sendError(res, 400, "Booking ID is required.");
    }

    const bookingRef = db.collection("bookings").doc(bookingId);

    await db.runTransaction(async (transaction) => {
      const bookingSnap = await transaction.get(bookingRef);

      if (!bookingSnap.exists) {
        throw new Error("BOOKING_NOT_FOUND");
      }

      const booking = bookingSnap.data();

      if (booking.driverId !== driverId) {
        throw new Error("NOT_BOOKING_DRIVER");
      }

      if (booking.status !== "pending") {
        throw new Error("BOOKING_ALREADY_PROCESSED");
      }

      const notification = createNotification({
        recipientId: booking.userId,
        senderId: driverId,
        type: "booking_rejected",
        title: "Booking request rejected",
        message: "The driver has rejected your booking request.",
        rideId: booking.rideId,
        bookingId,
      });

      transaction.update(bookingRef, {
        status: "rejected",
        rejectedAt: new Date(),
      });

      transaction.create(notification.ref, notification.data);
    });

    return res.json({
      success: true,
      message: "Booking rejected successfully.",
    });
  } catch (err) {
    console.error("Reject booking error:", err);

    const errors = {
      BOOKING_NOT_FOUND: [404, "Booking not found."],
      NOT_BOOKING_DRIVER: [
        403,
        "You are not authorized to reject this booking.",
      ],
      BOOKING_ALREADY_PROCESSED: [
        400,
        "This booking has already been processed.",
      ],
    };

    if (errors[err.message]) {
      return sendError(res, ...errors[err.message]);
    }

    return sendError(res, 500, "Unable to reject booking.");
  }
});

// ========================================
// 4. Cancel Booking
// POST /api/cancel-booking
// Only the passenger who made the booking can cancel.
// ========================================

router.post("/cancel-booking", async (req, res) => {
  try {
    const { bookingId } = req.body;
    const passengerId = req.user.uid;

    if (!bookingId) {
      return sendError(res, 400, "Booking ID is required.");
    }

    const bookingRef = db.collection("bookings").doc(bookingId);

    let refundStatus = "not_required";

    await db.runTransaction(async (transaction) => {
      const bookingSnap = await transaction.get(bookingRef);

      if (!bookingSnap.exists) {
        throw new Error("BOOKING_NOT_FOUND");
      }

      const booking = bookingSnap.data();

      if (booking.userId !== passengerId) {
        throw new Error("NOT_BOOKING_PASSENGER");
      }

      if (!["pending", "accepted"].includes(booking.status)) {
        throw new Error("BOOKING_CANNOT_CANCEL");
      }

      let rideRef = null;
      let ride = null;

      if (booking.status === "accepted") {
        rideRef = db.collection("rides").doc(booking.rideId);
        const rideSnap = await transaction.get(rideRef);

        if (!rideSnap.exists) {
          throw new Error("RIDE_NOT_FOUND");
        }

        ride = rideSnap.data();

        if (["cancelled", "completed"].includes(ride.status)) {
          throw new Error("RIDE_CANNOT_RESTORE_SEATS");
        }
      }

      refundStatus = getRefundStatus(booking);

      const notification = createNotification({
        recipientId: booking.driverId,
        senderId: passengerId,
        type: "booking_cancelled",
        title: "Passenger cancelled booking",
        message: `${booking.userName || "A passenger"} cancelled their booking.`,
        rideId: booking.rideId,
        bookingId,
      });

      // Restore seats only when the booking had already been accepted.
      if (booking.status === "accepted" && rideRef && ride) {
        const restoredSeats = ride.seats + booking.passengerCount;

        transaction.update(rideRef, {
          seats: restoredSeats,
          status:
            ride.status === "fully_booked" ? "published" : ride.status,
        });
      }

      transaction.update(bookingRef, {
        status: "cancelled",
        cancelledAt: new Date(),
        cancelledBy: "passenger",
        refundStatus,
      });

      transaction.create(notification.ref, notification.data);
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
      BOOKING_CANNOT_CANCEL: [400, "This booking cannot be cancelled."],
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
  }
});

// ========================================
// 5. Cancel Ride
// POST /api/cancel-ride
// Only the driver who created the ride can cancel it.
// Cancels pending and accepted bookings as well.
// ========================================

router.post("/cancel-ride", async (req, res) => {
  try {
    const { rideId } = req.body;
    const driverId = req.user.uid;

    if (!rideId) {
      return sendError(res, 400, "Ride ID is required.");
    }

    const rideRef = db.collection("rides").doc(rideId);

    let affectedBookings = 0;
    let refundCount = 0;

    await db.runTransaction(async (transaction) => {
      const rideSnap = await transaction.get(rideRef);

      if (!rideSnap.exists) {
        throw new Error("RIDE_NOT_FOUND");
      }

      const ride = rideSnap.data();

      if (ride.userId !== driverId) {
        throw new Error("NOT_RIDE_DRIVER");
      }

      if (["cancelled", "completed"].includes(ride.status)) {
        throw new Error("RIDE_ALREADY_CLOSED");
      }

      // Read all bookings for this ride before performing any writes.
      const bookingsQuery = db
        .collection("bookings")
        .where("rideId", "==", rideId);

      const bookingsSnap = await transaction.get(bookingsQuery);

      const activeBookings = bookingsSnap.docs.filter((bookingDoc) => {
        const status = bookingDoc.data().status;
        return ["pending", "accepted"].includes(status);
      });

      // Each active booking requires one update and one notification.
      if (activeBookings.length > 240) {
        throw new Error("TOO_MANY_ACTIVE_BOOKINGS");
      }

      const now = new Date();

      transaction.update(rideRef, {
        status: "cancelled",
        seats: 0,
        cancelledAt: now,
        cancelledBy: "driver",
      });

      for (const bookingDoc of activeBookings) {
        const booking = bookingDoc.data();
        const bookingId = bookingDoc.id;
        const refundStatus = getRefundStatus(booking);

        const notification = createNotification({
          recipientId: booking.userId,
          senderId: driverId,
          type: "ride_cancelled",
          title: "Ride cancelled by driver",
          message: `Your ride from ${ride.pickup || "your pickup location"} to ${ride.destination || "your destination"} has been cancelled by the driver.`,
          rideId,
          bookingId,
        });

        transaction.update(bookingDoc.ref, {
          status: "cancelled",
          cancelledAt: now,
          cancelledBy: "driver",
          refundStatus,
        });

        transaction.create(notification.ref, notification.data);

        affectedBookings++;

        if (refundStatus === "refund_pending") {
          refundCount++;
        }
      }
    });

    return res.json({
      success: true,
      message: "Ride and its active bookings have been cancelled.",
      affectedBookings,
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
      TOO_MANY_ACTIVE_BOOKINGS: [
        400,
        "This ride has too many active bookings to cancel in one operation. Contact support.",
      ],
    };

    if (errors[err.message]) {
      return sendError(res, ...errors[err.message]);
    }

    return sendError(res, 500, "Unable to cancel ride.");
  }
});

// ========================================
// 6. Complete Ride
// POST /api/complete-ride
// Only the ride's driver can complete the ride.
// Accepted bookings become completed.
// Pending bookings are rejected and passengers notified.
// ========================================

router.post("/complete-ride", async (req, res) => {
  try {
    const { rideId } = req.body;
    const driverId = req.user.uid;

    if (!rideId) {
      return sendError(res, 400, "Ride ID is required.");
    }

    const rideRef = db.collection("rides").doc(rideId);

    let completedBookings = 0;
    let closedPendingBookings = 0;

    await db.runTransaction(async (transaction) => {
      const rideSnap = await transaction.get(rideRef);

      if (!rideSnap.exists) {
        throw new Error("RIDE_NOT_FOUND");
      }

      const ride = rideSnap.data();

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

      // Verify the scheduled departure time has passed.
      if (!ride.departureDate || !ride.departureTime) {
        throw new Error("DEPARTURE_DETAILS_MISSING");
      }

      const departureDateTime = new Date(
        `${ride.departureDate}T${ride.departureTime}:00+05:30`
      );

      if (Number.isNaN(departureDateTime.getTime())) {
        throw new Error("INVALID_DEPARTURE_DETAILS");
      }

      if (Date.now() < departureDateTime.getTime()) {
        throw new Error("RIDE_NOT_DEPARTED");
      }

      // Read all bookings before performing transaction writes.
      const bookingsQuery = db
        .collection("bookings")
        .where("rideId", "==", rideId);

      const bookingsSnap = await transaction.get(bookingsQuery);

      const activeBookings = bookingsSnap.docs.filter((bookingDoc) =>
        ["pending", "accepted"].includes(bookingDoc.data().status)
      );

      if (activeBookings.length > 240) {
        throw new Error("TOO_MANY_ACTIVE_BOOKINGS");
      }

      const now = new Date();

      transaction.update(rideRef, {
        status: "completed",
        completedAt: now,
      });

      for (const bookingDoc of activeBookings) {
        const booking = bookingDoc.data();

        if (booking.status === "accepted") {
          transaction.update(bookingDoc.ref, {
            status: "completed",
            completedAt: now,
          });

          completedBookings++;
        } else if (booking.status === "pending") {
          const notification = createNotification({
            recipientId: booking.userId,
            senderId: driverId,
            type: "booking_rejected",
            title: "Booking request closed",
            message:
              "This ride has been completed. Your pending booking request is now closed.",
            rideId,
            bookingId: bookingDoc.id,
          });

          transaction.update(bookingDoc.ref, {
            status: "rejected",
            rejectedAt: now,
            rejectionReason: "ride_completed",
          });

          transaction.create(notification.ref, notification.data);

          closedPendingBookings++;
        }
      }
    });

    return res.json({
      success: true,
      message: "Ride marked as completed successfully.",
      completedBookings,
      closedPendingBookings,
    });
  } catch (err) {
    console.error("Complete ride error:", err);

    const errors = {
      RIDE_NOT_FOUND: [404, "Ride not found."],
      NOT_RIDE_DRIVER: [
        403,
        "You are not authorized to complete this ride.",
      ],
      RIDE_CANCELLED: [400, "A cancelled ride cannot be completed."],
      RIDE_ALREADY_COMPLETED: [400, "This ride is already completed."],
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
      TOO_MANY_ACTIVE_BOOKINGS: [
        400,
        "This ride has too many active bookings to complete in one operation. Contact support.",
      ],
    };

    if (errors[err.message]) {
      return sendError(res, ...errors[err.message]);
    }

    return sendError(res, 500, "Unable to complete ride.");
  }
});

// ========================================
// 7. Submit Review
// POST /api/submit-review
// Only passengers with completed bookings can review.
// One review per booking.
// ========================================

router.post("/submit-review", async (req, res) => {
  try {
    const { bookingId, rating, review } = req.body;
    const passengerId = req.user.uid;

    if (!bookingId) {
      return sendError(res, 400, "Booking ID is required.");
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

    // Booking ID is also the review document ID.
    // This prevents multiple reviews for the same booking.
    const bookingRef = db.collection("bookings").doc(bookingId);
    const reviewRef = db.collection("reviews").doc(bookingId);

    await db.runTransaction(async (transaction) => {
      const bookingSnap = await transaction.get(bookingRef);

      if (!bookingSnap.exists) {
        throw new Error("BOOKING_NOT_FOUND");
      }

      const booking = bookingSnap.data();

      if (booking.userId !== passengerId) {
        throw new Error("NOT_BOOKING_PASSENGER");
      }

      if (booking.status !== "completed") {
        throw new Error("BOOKING_NOT_COMPLETED");
      }

      const rideRef = db.collection("rides").doc(booking.rideId);
      const rideSnap = await transaction.get(rideRef);

      if (!rideSnap.exists) {
        throw new Error("RIDE_NOT_FOUND");
      }

      const ride = rideSnap.data();

      if (
        ride.status !== "completed" ||
        ride.userId !== booking.driverId
      ) {
        throw new Error("RIDE_NOT_COMPLETED");
      }

      const reviewSnap = await transaction.get(reviewRef);

      if (reviewSnap.exists) {
        throw new Error("REVIEW_ALREADY_EXISTS");
      }

      transaction.create(reviewRef, {
        bookingId,
        rideId: booking.rideId,
        driverId: booking.driverId,
        passengerId,
        passengerName:
          booking.userName ||
          req.user.name ||
          req.user.email ||
          "Passenger",
        rating,
        review: review.trim(),
        createdAt: new Date(),
      });
    });

    return res.status(201).json({
      success: true,
      message: "Review submitted successfully.",
    });
  } catch (err) {
    console.error("Submit review error:", err);

    const errors = {
      BOOKING_NOT_FOUND: [404, "Booking not found."],
      NOT_BOOKING_PASSENGER: [
        403,
        "You are not authorized to review this booking.",
      ],
      BOOKING_NOT_COMPLETED: [
        400,
        "You can review only completed bookings.",
      ],
      RIDE_NOT_FOUND: [404, "Associated ride not found."],
      RIDE_NOT_COMPLETED: [
        400,
        "The associated ride has not been completed.",
      ],
      REVIEW_ALREADY_EXISTS: [
        409,
        "You have already reviewed this booking.",
      ],
    };

    if (errors[err.message]) {
      return sendError(res, ...errors[err.message]);
    }

    return sendError(res, 500, "Unable to submit review.");
  }
});

// ========================================
// 8. Mock Online Payment (Demo Only)
// POST /api/mock-payment
//
// This endpoint simulates a payment result for development/demo purposes.
// It does NOT charge a card, process UPI, or transfer real money.
// The passenger can only update their own online booking.
// ========================================

router.post("/mock-payment", async (req, res) => {
  try {
    const { bookingId, outcome } = req.body;
    const passengerId = req.user.uid;

    if (!bookingId) {
      return sendError(res, 400, "Booking ID is required.");
    }

    if (!["success", "failure"].includes(outcome)) {
      return sendError(res, 400, "Invalid demo payment outcome.");
    }

    const bookingRef = db.collection("bookings").doc(bookingId);

    // Generate the transaction ID on the server.
    const transactionId = `MOCK-${crypto.randomUUID()}`;

    let result = null;

    await db.runTransaction(async (transaction) => {
      const bookingSnap = await transaction.get(bookingRef);

      if (!bookingSnap.exists) {
        throw new Error("BOOKING_NOT_FOUND");
      }

      const booking = bookingSnap.data();

      if (booking.userId !== passengerId) {
        throw new Error("NOT_BOOKING_PASSENGER");
      }

      if (booking.paymentMethod !== "online") {
        throw new Error("ONLINE_PAYMENT_NOT_SELECTED");
      }

      // If already paid, return the existing demo transaction ID.
      // This makes repeated success requests safe and prevents duplicate payment.
      if (booking.paymentStatus === "paid") {
        result = {
          paymentStatus: "paid",
          transactionId: booking.paymentTransactionId || null,
          alreadyPaid: true,
        };

        return;
      }

      if (!["pending", "accepted"].includes(booking.status)) {
        throw new Error("BOOKING_NOT_ACTIVE");
      }

      if (
        !["unpaid", "failed", undefined, null].includes(
          booking.paymentStatus
        )
      ) {
        throw new Error("PAYMENT_NOT_RETRYABLE");
      }

      const now = new Date();

      if (outcome === "failure") {
        transaction.update(bookingRef, {
          paymentStatus: "failed",
          paymentProvider: "mock",
          paymentAttemptAt: now,
          refundStatus: "not_required",
        });

        result = {
          paymentStatus: "failed",
          transactionId: null,
          alreadyPaid: false,
        };

        return;
      }

      transaction.update(bookingRef, {
        paymentStatus: "paid",
        paymentProvider: "mock",
        paymentTransactionId: transactionId,
        paidAt: now,
        paymentAttemptAt: now,
        refundStatus: "not_required",
      });

      result = {
        paymentStatus: "paid",
        transactionId,
        alreadyPaid: false,
      };
    });

    return res.json({
      success: true,
      message:
        result.paymentStatus === "paid"
          ? "Demo payment successful. No real money was transferred."
          : "Demo payment failed. The booking remains unpaid.",
      ...result,
      demo: true,
    });
  } catch (err) {
    console.error("Mock payment error:", err);

    const errors = {
      BOOKING_NOT_FOUND: [404, "Booking not found."],
      NOT_BOOKING_PASSENGER: [
        403,
        "You are not authorized to pay for this booking.",
      ],
      ONLINE_PAYMENT_NOT_SELECTED: [
        400,
        "This booking does not use online payment.",
      ],
      BOOKING_NOT_ACTIVE: [
        400,
        "This booking is no longer active and cannot be paid.",
      ],
      PAYMENT_NOT_RETRYABLE: [
        400,
        "This booking's payment cannot be retried.",
      ],
    };

    if (errors[err.message]) {
      return sendError(res, ...errors[err.message]);
    }

    return sendError(res, 500, "Unable to process demo payment.");
  }
});

// ========================================
// Export Router
// ========================================

module.exports = router;