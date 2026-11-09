import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import Signup from "./pages/Signup";
import Login from "./pages/Login";
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import Rides from "./pages/Rides";
import AddRide from "./pages/AddRide";
import RideDetails from "./pages/RideDetails";
import YourRides from "./pages/YourRides";
import BookRide from "./pages/BookRide";
import DriverBookings from "./pages/DriverBookings";
import YourBookings from "./pages/YourBookings";
import Chat from "./pages/Chat";
import ReviewRide from "./pages/ReviewRide";
import DriverProfile from "./pages/DriverProfile";
import RideView from "./pages/RideView";
import AdminDashboard from "./pages/AdminDashboard";

import ProtectedRoute from "./components/ProtectedRoute";
import PublicRoute from "./components/PublicRoute";

import { AuthProvider } from "./context/AuthProvider";

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Default Route */}
          <Route
            path="/"
            element={<Navigate to="/signup" replace />}
          />

          {/* Public Routes */}
          <Route
            path="/signup"
            element={
              <PublicRoute>
                <Signup />
              </PublicRoute>
            }
          />

          <Route
            path="/login"
            element={
              <PublicRoute>
                <Login />
              </PublicRoute>
            }
          />

          {/* Protected Routes */}
          <Route
            path="/home"
            element={
              <ProtectedRoute>
                <Home />
              </ProtectedRoute>
            }
          />

          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />

          <Route
            path="/rides"
            element={
              <ProtectedRoute>
                <Rides />
              </ProtectedRoute>
            }
          />

          <Route
            path="/add-ride"
            element={
              <ProtectedRoute>
                <AddRide />
              </ProtectedRoute>
            }
          />

          <Route
            path="/ride-details/:rideId"
            element={
              <ProtectedRoute>
                <RideDetails />
              </ProtectedRoute>
            }
          />

          <Route
            path="/your-rides"
            element={
              <ProtectedRoute>
                <YourRides />
              </ProtectedRoute>
            }
          />

          <Route
            path="/book-ride/:rideId"
            element={
              <ProtectedRoute>
                <BookRide />
              </ProtectedRoute>
            }
          />

          <Route
            path="/driver-bookings"
            element={
              <ProtectedRoute>
                <DriverBookings />
              </ProtectedRoute>
            }
          />

          <Route
            path="/your-bookings"
            element={
              <ProtectedRoute>
                <YourBookings />
              </ProtectedRoute>
            }
          />

          <Route
            path="/chat/:bookingId"
            element={
              <ProtectedRoute>
                <Chat />
              </ProtectedRoute>
            }
          />

          {/* Other Routes */}
          <Route
            path="/review/:bookingId"
            element={<ReviewRide />}
          />

          <Route
            path="/driver/:driverId"
            element={<DriverProfile />}
          />

          <Route
            path="/ride/:rideId"
            element={<RideView />}
          />

          <Route
            path="/admin"
            element={
              <ProtectedRoute>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;