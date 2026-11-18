
const express = require("express");
const mongoose = require("mongoose");

const router = express.Router();

const verifyToken = require("../middleware/verifyToken");
const Booking = require("../models/Booking");
const Message = require("../models/Message");

router.use(verifyToken);

// ==========================================
// GET UNREAD MESSAGE COUNTS
// GET /api/chats/unread-counts
// ==========================================

router.get("/unread-counts", async (req, res) => {
  try {
    const userId = req.user.uid;

    // Find all accepted bookings where the logged-in user
    // is either the passenger or the driver.
    const bookings = await Booking.find({
      status: "accepted",
      $or: [
        { userId },
        { driverId: userId }
      ]
    })
      .select("_id")
      .lean();

    const bookingIds = bookings.map((booking) => booking._id);

    if (bookingIds.length === 0) {
      return res.json({
        success: true,
        unreadCounts: {}
      });
    }

    // Count unread messages for each booking.
    const unreadMessages = await Message.aggregate([
      {
        $match: {
          bookingId: { $in: bookingIds },
          senderId: { $ne: userId },
          seenBy: { $ne: userId }
        }
      },
      {
        $group: {
          _id: "$bookingId",
          count: { $sum: 1 }
        }
      }
    ]);

    const unreadCounts = {};

    unreadMessages.forEach((item) => {
      unreadCounts[String(item._id)] = item.count;
    });

    return res.json({
      success: true,
      unreadCounts
    });

  } catch (error) {
    console.error("Unread message count error:", error);

    return res.status(500).json({
      success: false,
      error: "Unable to retrieve unread message counts."
    });
  }
});

// ==========================================
// VERIFY BOOKING PARTICIPANT
// ==========================================

const getAuthorizedBooking = async (bookingId, userId) => {
  if (!mongoose.Types.ObjectId.isValid(bookingId)) {
    const error = new Error("Invalid booking ID.");
    error.status = 400;
    throw error;
  }

  const booking = await Booking.findById(bookingId);

  if (!booking) {
    const error = new Error("Booking not found.");
    error.status = 404;
    throw error;
  }

  const isDriver = booking.driverId === userId;
  const isPassenger = booking.userId === userId;

  if (!isDriver && !isPassenger) {
    const error = new Error("You are not authorized to access this chat.");
    error.status = 403;
    throw error;
  }

  if (booking.status !== "accepted") {
    const error = new Error("Chat is available only for accepted bookings.");
    error.status = 403;
    throw error;
  }

  return booking;
};

// ==========================================
// GET MESSAGES AND MARK RECEIVED MESSAGES READ
// GET /api/chats/:bookingId/messages
// ==========================================

router.get("/:bookingId/messages", async (req, res) => {
  try {
    const { bookingId } = req.params;
    const userId = req.user.uid;

    await getAuthorizedBooking(bookingId, userId);

    // Mark messages sent by the other participant as read.
    await Message.updateMany(
      {
        bookingId,
        senderId: { $ne: userId },
        seenBy: { $ne: userId }
      },
      {
        $addToSet: { seenBy: userId }
      }
    );

    const messages = await Message.find({ bookingId })
      .sort({ createdAt: 1 })
      .lean();

    const formattedMessages = messages.map((message) => ({
      ...message,
      id: String(message._id)
    }));

    return res.json({
      success: true,
      messages: formattedMessages
    });

  } catch (error) {
    console.error("Fetch chat messages error:", error);

    return res.status(error.status || 500).json({
      success: false,
      error: error.message || "Unable to retrieve chat messages."
    });
  }
});

// ==========================================
// SEND A MESSAGE
// POST /api/chats/:bookingId/messages
// ==========================================

router.post("/:bookingId/messages", async (req, res) => {
  try {
    const { bookingId } = req.params;
    const userId = req.user.uid;

    const text = String(req.body.text || "").trim();

    await getAuthorizedBooking(bookingId, userId);

    if (!text) {
      return res.status(400).json({
        success: false,
        error: "Message cannot be empty."
      });
    }

    if (text.length > 5000) {
      return res.status(400).json({
        success: false,
        error: "Message cannot exceed 5000 characters."
      });
    }

    const message = await Message.create({
      bookingId,
      senderId: userId,
      senderName: req.user.name || req.user.email || "User",
      senderEmail: req.user.email || "",
      text,
      seenBy: [userId]
    });

    return res.status(201).json({
      success: true,
      message: {
        ...message.toObject(),
        id: String(message._id)
      }
    });

  } catch (error) {
    console.error("Send chat message error:", error);

    return res.status(error.status || 500).json({
      success: false,
      error: error.message || "Unable to send message."
    });
  }
});

module.exports = router;
