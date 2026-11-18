
const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
      index: true
    },

    senderId: {
      type: String,
      required: true,
      index: true
    },

    senderName: {
      type: String,
      default: "User",
      trim: true
    },

    senderEmail: {
      type: String,
      default: ""
    },

    text: {
      type: String,
      required: true,
      trim: true,
      maxlength: 5000
    },

    seenBy: {
      type: [String],
      default: []
    }
  },
  {
    timestamps: true
  }
);

// Retrieve messages for a booking in chronological order.
messageSchema.index({ bookingId: 1, createdAt: 1 });

module.exports = mongoose.model("Message", messageSchema);
