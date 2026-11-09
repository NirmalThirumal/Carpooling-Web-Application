import { useEffect, useState } from "react";
import auth from "../firebase/auth";
import "../styles/admindashboard.css";

const API_URL = "http://localhost:5000/api/admin";

// Reusable authenticated admin API request
const adminRequest = async (endpoint, body = {}) => {
  const currentUser = auth.currentUser;

  if (!currentUser) {
    throw new Error("Please log in to access the admin dashboard.");
  }

  // Get Firebase ID token
  const token = await currentUser.getIdToken();

  const response = await fetch(`${API_URL}/${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(body)
  });

  const data = await response.json().catch(() => ({}));

  if (response.status === 401) {
    throw new Error("Your session has expired. Please log in again.");
  }

  if (response.status === 403) {
    throw new Error("Access denied. You are not authorized as an admin.");
  }

  if (!response.ok) {
    throw new Error(data.error || "Something went wrong.");
  }

  return data;
};

function AdminDashboard() {
  const [stats, setStats] = useState({});
  const [rides, setRides] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [users, setUsers] = useState([]);

  const [activeView, setActiveView] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");

  // Fetch Dashboard Statistics
  useEffect(() => {
    let isMounted = true;

    const fetchStats = async () => {
      try {
        setError("");

        const data = await adminRequest("stats");

        if (isMounted) {
          setStats(data);
        }
      } catch (err) {
        console.error("Admin stats error:", err);

        if (isMounted) {
          setError(err.message);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchStats();

    return () => {
      isMounted = false;
    };
  }, []);

  // Common error handler
  const handleError = (err) => {
    console.error("Admin dashboard error:", err);
    setError(err.message || "Something went wrong.");
  };

  // Fetch All Rides
  const fetchRides = async () => {
    try {
      setActionLoading(true);
      setError("");
      setActiveView("rides");

      const data = await adminRequest("rides");

      if (data.success) {
        setRides(data.data || []);
      }
    } catch (err) {
      handleError(err);
    } finally {
      setActionLoading(false);
    }
  };

  // Fetch All Bookings
  const fetchBookings = async () => {
    try {
      setActionLoading(true);
      setError("");
      setActiveView("bookings");

      const data = await adminRequest("bookings");

      if (data.success) {
        setBookings(data.data || []);
      }
    } catch (err) {
      handleError(err);
    } finally {
      setActionLoading(false);
    }
  };

  // Fetch All Users
  const fetchUsers = async () => {
    try {
      setActionLoading(true);
      setError("");
      setActiveView("users");

      const data = await adminRequest("users");

      if (data.success) {
        setUsers(data.data || []);
      }
    } catch (err) {
      handleError(err);
    } finally {
      setActionLoading(false);
    }
  };

  // Delete Ride
  const deleteRide = async (rideId) => {
    const confirmed = window.confirm(
      "Are you sure you want to delete this ride?"
    );

    if (!confirmed) return;

    try {
      setActionLoading(true);
      setError("");

      await adminRequest("delete-ride", { rideId });

      await fetchRides();

      const updatedStats = await adminRequest("stats");
      setStats(updatedStats);

      alert("Ride deleted successfully.");
    } catch (err) {
      handleError(err);
    } finally {
      setActionLoading(false);
    }
  };

  // Delete Booking
  const deleteBooking = async (bookingId) => {
    const confirmed = window.confirm(
      "Are you sure you want to delete this booking?"
    );

    if (!confirmed) return;

    try {
      setActionLoading(true);
      setError("");

      await adminRequest("delete-booking", { bookingId });

      await fetchBookings();

      const updatedStats = await adminRequest("stats");
      setStats(updatedStats);

      alert("Booking deleted successfully.");
    } catch (err) {
      handleError(err);
    } finally {
      setActionLoading(false);
    }
  };

  // Delete User Profile
  const deleteUser = async (userId) => {
    const confirmed = window.confirm(
      "Are you sure you want to delete this user's Firestore profile?"
    );

    if (!confirmed) return;

    try {
      setActionLoading(true);
      setError("");

      await adminRequest("delete-user", { userId });

      await fetchUsers();

      const updatedStats = await adminRequest("stats");
      setStats(updatedStats);

      alert("User profile deleted successfully.");
    } catch (err) {
      handleError(err);
    } finally {
      setActionLoading(false);
    }
  };

  // Edit Ride Seats
  const editRide = async (ride) => {
    const newSeats = window.prompt(
      "Enter the new number of available seats:",
      ride.seats
    );

    if (newSeats === null || newSeats.trim() === "") return;

    const seats = Number(newSeats);

    if (!Number.isInteger(seats) || seats < 0 || seats > 100) {
      alert("Please enter a whole number between 0 and 100.");
      return;
    }

    try {
      setActionLoading(true);
      setError("");

      await adminRequest("update-ride", {
        rideId: ride.id,
        updates: { seats }
      });

      await fetchRides();

      alert("Ride seats updated successfully.");
    } catch (err) {
      handleError(err);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return <div className="admin-loading">Loading Dashboard...</div>;
  }

  return (
    <div className="admin-container">
      {/* Header */}
      <div className="admin-header">
        <h1>📊 Admin Dashboard</h1>
      </div>

      {/* Error Message */}
      {error && (
        <div className="admin-error-message" role="alert">
          {error}
        </div>
      )}

      {/* Statistics */}
      <div className="admin-stats">
        <div className="stat-card">
          <h3>Total Users</h3>
          <p>{stats.users || 0}</p>
        </div>

        <div className="stat-card">
          <h3>Total Rides</h3>
          <p>{stats.rides || 0}</p>
        </div>

        <div className="stat-card">
          <h3>Total Bookings</h3>
          <p>{stats.bookings || 0}</p>
        </div>
      </div>

      {/* Navigation Buttons */}
      <div className="admin-nav">
        <button
          className={`admin-nav-btn ${
            activeView === "rides" ? "active" : ""
          }`}
          onClick={fetchRides}
          disabled={actionLoading}
        >
          🚗 View Rides
        </button>

        <button
          className={`admin-nav-btn ${
            activeView === "bookings" ? "active" : ""
          }`}
          onClick={fetchBookings}
          disabled={actionLoading}
        >
          🎟️ View Bookings
        </button>

        <button
          className={`admin-nav-btn ${
            activeView === "users" ? "active" : ""
          }`}
          onClick={fetchUsers}
          disabled={actionLoading}
        >
          👥 View Users
        </button>
      </div>

      {/* Data Section */}
      <div className="admin-section">
        {actionLoading && (
          <p className="admin-loading">Processing...</p>
        )}

        {/* Rides */}
        {activeView === "rides" && !actionLoading && (
          <>
            <div className="admin-section-title">All Rides</div>

            {rides.length === 0 ? (
              <p>No rides found.</p>
            ) : (
              rides.map((ride) => (
                <div key={ride.id} className="admin-card">
                  <div className="admin-card-meta">
                    <p>
                      <b>{ride.pickup} → {ride.destination}</b>
                    </p>
                    <p><b>Driver:</b> {ride.userName || "Unknown"}</p>
                    <p><b>Seats:</b> {ride.seats ?? 0}</p>
                    <p><b>Price:</b> ₹{ride.totalPrice ?? 0}</p>
                  </div>

                  <div className="admin-card-actions">
                    <button
                      className="admin-btn edit"
                      onClick={() => editRide(ride)}
                      disabled={actionLoading}
                    >
                      ✏️ Edit Seats
                    </button>

                    <button
                      className="admin-btn delete"
                      onClick={() => deleteRide(ride.id)}
                      disabled={actionLoading}
                    >
                      🗑️ Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </>
        )}

        {/* Bookings */}
        {activeView === "bookings" && !actionLoading && (
          <>
            <div className="admin-section-title">All Bookings</div>

            {bookings.length === 0 ? (
              <p>No bookings found.</p>
            ) : (
              bookings.map((booking) => (
                <div key={booking.id} className="admin-card">
                  <div className="admin-card-meta">
                    <p><b>Ride ID:</b> {booking.rideId}</p>
                    <p><b>User:</b> {booking.userName || "Unknown"}</p>

                    <p>
                      <b>Status:</b>
                      <span
                        className={`status-badge ${booking.status}`}
                      >
                        {booking.status}
                      </span>
                    </p>

                    <p><b>Amount:</b> ₹{booking.amount ?? 0}</p>
                  </div>

                  <div className="admin-card-actions">
                    <button
                      className="admin-btn delete"
                      onClick={() => deleteBooking(booking.id)}
                      disabled={actionLoading}
                    >
                      🗑️ Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </>
        )}

        {/* Users */}
        {activeView === "users" && !actionLoading && (
          <>
            <div className="admin-section-title">All Users</div>

            {users.length === 0 ? (
              <p>No users found.</p>
            ) : (
              users.map((user) => (
                <div key={user.id} className="admin-card">
                  <div className="admin-card-meta">
                    <p><b>{user.name || "No Name"}</b></p>
                    <p>{user.email || "No Email"}</p>
                    <p><b>User ID:</b> {user.id}</p>
                  </div>

                  <div className="admin-card-actions">
                    <button
                      className="admin-btn delete"
                      onClick={() => deleteUser(user.id)}
                      disabled={actionLoading}
                    >
                      🗑️ Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default AdminDashboard;
