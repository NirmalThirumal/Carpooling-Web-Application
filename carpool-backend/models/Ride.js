
const mongoose = require("mongoose");

const rideSchema = new mongoose.Schema(
  {
    pickup: {
      type: String,
      required: true,
      trim: true,
    },

    destination: {
      type: String,
      required: true,
      trim: true,
    },

    distance: {
      type: Number,
      required: true,
    },

    seats: {
      type: Number,
      required: true,
      min: 0,
    },

    departureDate: {
      type: String,
      required: true,
    },

    departureTime: {
      type: String,
      required: true,
    },

    basePrice: {
      type: Number,
      required: true,
    },

    serviceFee: {
      type: Number,
      required: true,
    },

    totalPrice: {
      type: Number,
      required: true,
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

    carName: {
      type: String,
      default: "",
    },

    carImage: {
      type: String,
      default: "",
    },

    driverName: {
      type: String,
      default: "",
    },

    driverContact: {
      type: String,
      default: "",
    },

    driverLicense: {
      type: String,
      default: "",
    },

    status: {
    type: String,
    enum: [
        "draft",
        "published",
        "fully_booked",
        "cancelled",
        "completed",
    ],
    default: "draft",
    },
    cancelledAt: {
        type: Date,
        default: null,
    },

    cancelledBy: {
        type: String,
        enum: ["driver"],
        default: null,
    },

    completedAt: {
        type: Date,
        default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Ride", rideSchema);
