const express = require("express");
const router = express.Router();

const admin = require("firebase-admin");
const db = require("../config/firebase");

// ========================================
// User Signup
// ========================================

// Store user profile in Firestore.
router.post("/signup", async (req, res) => {
  try {
    const { uid, email, name } = req.body;

    await db.collection("users").doc(uid).set({
      email,
      name,
      createdAt: new Date(),
    });

    res.json({ success: true });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: "Signup failed",
    });
  }
});

// ========================================
// User Login
// ========================================

// Verify that the user exists in Firestore.
router.post("/login", async (req, res) => {
  try {
    const { uid } = req.body;

    const userDoc = await db.collection("users").doc(uid).get();

    if (!userDoc.exists) {
      return res.status(404).json({
        error: "User not found",
      });
    }

    res.json({
      success: true,
      user: userDoc.data(),
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: "Login failed",
    });
  }
});

// ========================================
// Export Router
// ========================================

module.exports = router;