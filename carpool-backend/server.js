const express = require("express");
const cors = require("cors");

// ========================================
// Application Initialization
// ========================================

const app = express();

// ========================================
// Middleware Configuration
// ========================================

app.use(cors());
app.use(express.json());

// ========================================
// Database Configuration
// ========================================

const db = require("./config/firebase");

// ========================================
// Route Imports
// ========================================

const bookingRoutes = require("./routes/booking");
const rideRoutes = require("./routes/ride");
const authRoutes = require("./routes/auth");
const adminRoutes = require("./routes/admin");
const mapRoutes = require("./routes/maps");

// ========================================
// API Route Registration
// ========================================

app.use("/api/admin", adminRoutes);
app.use("/api/auth", authRoutes);
app.use("/api", rideRoutes);
app.use("/api", bookingRoutes);
app.use("/api/maps", mapRoutes);

// ========================================
// Firestore Connection Test
// ========================================

app.get("/test-db", async (req, res) => {
  try {
    const snapshot = await db.collection("rides").get();

    const data = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error connecting to DB");
  }
});

// ========================================
// Basic Health Check Route
// ========================================

app.get("/", (req, res) => {
  res.send("Backend running 🚀");
});

// ========================================
// Start Express Server
// ========================================

const PORT = 5000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});