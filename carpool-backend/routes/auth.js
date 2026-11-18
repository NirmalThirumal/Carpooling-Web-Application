
const express = require("express");
const router = express.Router();

const User = require("../models/User");
const verifyToken = require("../middleware/verifyToken");

// Save or update user profile in MongoDB.
router.post("/profile", verifyToken, async (req, res) => {
  try {
    const { name, photo, authProvider } = req.body;

    const user = await User.findOneAndUpdate(
      { uid: req.user.uid },
      {
        $set: {
          name: name || req.user.name || "",
          email: req.user.email,
          photo: photo || "",
          authProvider: authProvider || "password",
        },
      },
      {
        returnDocument: "after",
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      }
    );

    res.json({
      success: true,
      message: "User profile saved successfully",
      user,
    });
  } catch (error) {
    console.error("Save user profile error:", error);

    res.status(500).json({
      success: false,
      error: "Failed to save user profile",
    });
  }
});

// Get logged-in user's profile.
router.get("/profile", verifyToken, async (req, res) => {
  try {
    const user = await User.findOne({
      uid: req.user.uid,
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User profile not found",
      });
    }

    res.json({
      success: true,
      user,
    });
  } catch (error) {
    console.error("Get user profile error:", error);

    res.status(500).json({
      success: false,
      error: "Failed to fetch user profile",
    });
  }
});

module.exports = router;
