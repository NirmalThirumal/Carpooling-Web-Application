
const express = require("express");
const cors = require("cors");

require("dotenv").config();

const connectMongoDB = require("./config/mongodb");

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
// Route Imports
// ========================================

const bookingRoutes = require("./routes/booking");
const rideRoutes = require("./routes/ride");
const authRoutes = require("./routes/auth");
const adminRoutes = require("./routes/admin");
const mapRoutes = require("./routes/maps");
const chatRoutes = require("./routes/chat");
const notificationRoutes = require("./routes/notifications");

// ========================================
// API Route Registration
// ========================================

app.use("/api/admin", adminRoutes);
app.use("/api/auth", authRoutes);
app.use("/api", rideRoutes);
app.use("/api", bookingRoutes);
app.use("/api/maps", mapRoutes);
app.use("/api/chats", chatRoutes);
app.use("/api/notifications", notificationRoutes);

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

const startServer = async () => {
  try {
    // Connect to MongoDB before starting Express.
    await connectMongoDB();

    // Start Express server only after successful connection.
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error.message);
    process.exit(1);
  }
};

startServer();
