// ========================================
// Environment Configuration
// ========================================

require("dotenv").config();

const admin = require("firebase-admin");

// ========================================
// Firebase Admin Initialization
// ========================================

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}

// ========================================
// Firestore Database
// ========================================

const db = admin.firestore();

module.exports = db;