
const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema(
  {
    rideId: {
      type: String,
      required: true,
      index: true,
    },

    driverId: {
      type: String,
      required: true,
      index: true,
    },

    userId: {
      type: String,
      required: true,
      index: true,
    },

    userEmail: {
      type: String,
      default: "",
    },

    userName: {
      type: String,
      default: "",
    },

    passengerCount: {
      type: Number,
      required: true,
      min: 1,
    },

    passengerNames: {
      type: [String],
      required: true,
    },

    contact: {
      type: String,
      required: true,
    },

    luggage: {
      type: String,
      enum: ["yes", "no"],
      required: true,
    },

    bags: {
      type: Number,
      default: 0,
    },

    seatType: {
      type: String,
      default: "standard",
    },

    amount: {
      type: Number,
      required: true,
    },

    paymentMethod: {
      type: String,
      enum: ["cash", "online"],
      required: true,
    },

    paymentStatus: {
      type: String,
      default: "pending",
    },

    paymentProvider: {
      type: String,
      default: "",
    },

    paymentTransactionId: {
      type: String,
      default: "",
    },

    paymentAttemptAt: {
      type: Date,
      default: null,
    },

    paidAt: {
      type: Date,
      default: null,
    },

    refundStatus: {
      type: String,
      default: "not_required",
    },

    driverEarning: {
      type: Number,
      default: 0,
    },

    platformFee: {
      type: Number,
      default: 0,
    },

    status: {
      type: String,
      enum: [
        "pending",
        "accepted",
        "rejected",
        "cancelled",
        "completed",
      ],
      default: "pending",
    },

    rejectionReason: {
      type: String,
      default: "",
    },

    cancelledBy: {
      type: String,
      enum: ["passenger", "driver"],
      default: null,
    },

    acceptedAt: Date,
    rejectedAt: Date,
    cancelledAt: Date,
    completedAt: Date,
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Booking", bookingSchema);
