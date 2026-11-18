
require("dotenv").config();

const connectMongoDB = require("./config/mongodb");

const testConnection = async () => {
  try {
    await connectMongoDB();
    console.log("MongoDB connection test completed!");
    process.exit(0);
  } catch (error) {
    console.error("Test failed:", error.message);
    process.exit(1);
  }
};

testConnection();
