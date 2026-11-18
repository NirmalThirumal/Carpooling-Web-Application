
const express = require("express");
const mongoose = require("mongoose");

const router = express.Router();

const Notification = require("../models/Notification");
const verifyToken = require("../middleware/verifyToken");

router.use(verifyToken);

// GET /api/notifications
// Retrieve notifications belonging to the logged-in user.
router.get("/", async (req, res) => {
  try {
    const notifications = await Notification.find({
      recipientId: req.user.uid
    })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    const formattedNotifications = notifications.map((notification) => ({
      ...notification,
      id: String(notification._id)
    }));

    return res.json({
      success: true,
      notifications: formattedNotifications
    });
  } catch (error) {
    console.error("Fetch notifications error:", error);

    return res.status(500).json({
      success: false,
      error: "Unable to load notifications."
    });
  }
});

// PATCH /api/notifications/read-all
// Mark all notifications belonging to the user as read.
router.patch("/read-all", async (req, res) => {
  try {
    const result = await Notification.updateMany(
      {
        recipientId: req.user.uid,
        read: false
      },
      {
        $set: { read: true }
      }
    );

    return res.json({
      success: true,
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    console.error("Mark all notifications as read error:", error);

    return res.status(500).json({
      success: false,
      error: "Unable to update notifications."
    });
  }
});

// PATCH /api/notifications/:id/read
// Mark one notification as read.
router.patch("/:id/read", async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: "Invalid notification ID."
      });
    }

    const notification = await Notification.findOneAndUpdate(
      {
        _id: id,
        recipientId: req.user.uid
      },
      {
        $set: { read: true }
      },
      {
        new: true
      }
    );

    if (!notification) {
      return res.status(404).json({
        success: false,
        error: "Notification not found."
      });
    }

    return res.json({
      success: true,
      message: "Notification marked as read."
    });
  } catch (error) {
    console.error("Mark notification as read error:", error);

    return res.status(500).json({
      success: false,
      error: "Unable to update notification."
    });
  }
});

module.exports = router;
