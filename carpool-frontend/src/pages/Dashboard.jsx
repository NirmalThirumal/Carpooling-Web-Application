import { useCallback, useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  where
} from "firebase/firestore";

import { AuthContext } from "../context/AuthContext";
import { logout } from "../firebase/auth";
import app from "../firebase/config";
import authenticatedFetch from "../services/authenticatedFetch";

import "../styles/dashboard.css";

const db = getFirestore(app);

function Dashboard() {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();

  const [bookings, setBookings] = useState([]);
  const [activeFilter, setActiveFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState("");

  // Fetch driver bookings.
  const fetchBookings = useCallback(async () => {
    if (!user) {
      setBookings([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError("");

      // Get bookings where the logged-in user is the driver.
      const bookingsQuery = query(
        collection(db, "bookings"),
        where("driverId", "==", user.uid)
      );

      const snapshot = await getDocs(bookingsQuery);

      // Fetch the corresponding ride details.
      const results = await Promise.all(
        snapshot.docs.map(async (bookingDoc) => {
          const booking = {
            id: bookingDoc.id,
            ...bookingDoc.data()
          };

          let ride = null;

          if (booking.rideId) {
            const rideSnapshot = await getDoc(
              doc(db, "rides", booking.rideId)
            );

            if (rideSnapshot.exists()) {
              ride = rideSnapshot.data();
            }
          }

          return { ...booking, ride };
        })
      );

      results.sort((a, b) => {
        const dateA = a.createdAt?.toDate?.()?.getTime?.() || 0;
        const dateB = b.createdAt?.toDate?.()?.getTime?.() || 0;

        return dateB - dateA;
      });

      setBookings(results);
    } catch (err) {
      console.error("Error fetching driver bookings:", err);
      setError("Unable to load your bookings. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Load bookings when the component mounts.
  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  // Accept or reject a booking.
  const handleBookingAction = async (bookingId, action) => {
    const actionLabel = action === "accept-booking" ? "accept" : "reject";

    const confirmed = window.confirm(
      `Are you sure you want to ${actionLabel} this booking?`
    );

    if (!confirmed) return;

    try {
      setActionLoading(bookingId);
      setError("");

      const response = await authenticatedFetch(`/api/${action}`, {
        method: "POST",
        body: JSON.stringify({ bookingId })
      });

      const data = await response.json();

      if (!response.ok || data.success === false) {
        throw new Error(
          data.message || `Unable to ${actionLabel} booking.`
        );
      }

      await fetchBookings();
    } catch (err) {
      console.error(`Error trying to ${actionLabel} booking:`, err);
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setActionLoading("");
    }
  };

  // Filter bookings.
  const filteredBookings = bookings.filter((booking) => {
    if (activeFilter === "all") return true;

    return booking.status === activeFilter;
  });

  // Calculate booking statistics.
  const pendingCount = bookings.filter(
    (booking) => booking.status === "pending"
  ).length;

  const acceptedCount = bookings.filter(
    (booking) => booking.status === "accepted"
  ).length;

  const rejectedCount = bookings.filter(
    (booking) => booking.status === "rejected"
  ).length;

  // Format booking dates.
  const formatDate = (value) => {
    if (!value) return "Not available";

    try {
      const date = value.toDate ? value.toDate() : new Date(value);

      if (Number.isNaN(date.getTime())) {
        return "Not available";
      }

      return date.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric"
      });
    } catch {
      return "Not available";
    }
  };

  // Handle logout.
  const handleLogout = async () => {
    try {
      await logout();
      navigate("/login");
    } catch (err) {
      console.error("Logout failed:", err);
      setError("Unable to log out. Please try again.");
    }
  };

  return (
    <div className="driver-dashboard">
      {/* Dashboard Header */}
      <header className="dashboard-header">
        <div>
          <h1>Driver Dashboard</h1>
          <p>Manage your rides and passenger booking requests.</p>
        </div>

        <button
          className="dashboard-logout"
          onClick={handleLogout}
        >
          Logout
        </button>
      </header>

      <main className="dashboard-content">
        {/* Welcome Section */}
        <section className="dashboard-welcome">
          <div>
            <h2>
              Welcome, {user?.displayName || user?.email || "Driver"}!
            </h2>
            <p>Here is an overview of your ride bookings.</p>
          </div>

          <div className="dashboard-quick-actions">
            <button onClick={() => navigate("/add-ride")}>
              + Offer a Ride
            </button>

            <button
              className="secondary-action"
              onClick={() => navigate("/rides")}
            >
              View Your Rides
            </button>
          </div>
        </section>

        {/* Booking Statistics */}
        <section className="dashboard-stats">
          <div className="dashboard-stat-card">
            <span>Total Requests</span>
            <strong>{bookings.length}</strong>
          </div>

          <div className="dashboard-stat-card pending-stat">
            <span>Pending</span>
            <strong>{pendingCount}</strong>
          </div>

          <div className="dashboard-stat-card accepted-stat">
            <span>Accepted</span>
            <strong>{acceptedCount}</strong>
          </div>

          <div className="dashboard-stat-card rejected-stat">
            <span>Rejected</span>
            <strong>{rejectedCount}</strong>
          </div>
        </section>

        {/* Booking Management */}
        <section className="dashboard-bookings">
          <div className="dashboard-bookings-heading">
            <div>
              <h2>Incoming Booking Requests</h2>
              <p>
                Review and manage passengers who want to join your rides.
              </p>
            </div>

            <button
              className="refresh-button"
              onClick={fetchBookings}
              disabled={loading}
            >
              ↻ Refresh
            </button>
          </div>

          {/* Booking Filters */}
          <div className="booking-filters">
            {["all", "pending", "accepted", "rejected", "cancelled"].map(
              (filter) => (
                <button
                  key={filter}
                  className={activeFilter === filter ? "selected" : ""}
                  onClick={() => setActiveFilter(filter)}
                >
                  {filter
                    .replace("_", " ")
                    .replace(/^./, (c) => c.toUpperCase())}
                </button>
              )
            )}
          </div>

          {error && (
            <div className="dashboard-error">
              {error}
            </div>
          )}

          {/* Booking Results */}
          {loading ? (
            <div className="dashboard-message">
              Loading your bookings...
            </div>
          ) : filteredBookings.length === 0 ? (
            <div className="dashboard-empty">
              <div className="empty-icon">🎟️</div>
              <h3>No bookings found</h3>

              <p>
                {activeFilter === "all"
                  ? "You haven't received any booking requests yet."
                  : `There are no ${activeFilter} bookings at the moment.`}
              </p>
            </div>
          ) : (
            <div className="booking-list">
              {filteredBookings.map((booking) => (
                <article
                  className="driver-booking-card"
                  key={booking.id}
                >
                  {/* Booking Header */}
                  <div className="booking-card-top">
                    <div>
                      <span className="booking-id">
                        Booking ID: {booking.id}
                      </span>

                      <h3>
                        {booking.ride?.pickup || "Pickup unavailable"}
                        {" → "}
                        {booking.ride?.destination ||
                          "Destination unavailable"}
                      </h3>
                    </div>

                    <span
                      className={`driver-status ${
                        booking.status || "pending"
                      }`}
                    >
                      {booking.status || "pending"}
                    </span>
                  </div>

                  {/* Passenger Details */}
                  <div className="booking-passenger-details">
                    <div>
                      <span>Passenger</span>
                      <strong>
                        {booking.userName || "Not provided"}
                      </strong>
                    </div>

                    <div>
                      <span>Passenger email</span>
                      <strong>
                        {booking.userEmail || "Not provided"}
                      </strong>
                    </div>

                    <div>
                      <span>Passengers</span>
                      <strong>{booking.passengerCount || 1}</strong>
                    </div>

                    <div>
                      <span>Contact</span>
                      <strong>
                        {booking.contact || "Not provided"}
                      </strong>
                    </div>

                    <div>
                      <span>Seat preference</span>
                      <strong>
                        {booking.seatType || "Not specified"}
                      </strong>
                    </div>

                    <div>
                      <span>Luggage</span>
                      <strong>
                        {booking.luggage || "Not specified"}
                        {booking.bags !== undefined
                          ? ` (${booking.bags} bags)`
                          : ""}
                      </strong>
                    </div>

                    <div>
                      <span>Booking date</span>
                      <strong>
                        {formatDate(booking.createdAt)}
                      </strong>
                    </div>

                    <div>
                      <span>Booking amount</span>
                      <strong>
                        ₹{Number(booking.amount || 0).toFixed(2)}
                      </strong>
                    </div>
                  </div>

                  {/* Passenger Names */}
                  {Array.isArray(booking.passengerNames) &&
                    booking.passengerNames.length > 0 && (
                      <div className="passenger-names">
                        <span>Passenger names:</span>{" "}
                        {booking.passengerNames.join(", ")}
                      </div>
                    )}

                  {/* Payment Information */}
                  <div className="booking-payment-info">
                    Payment status:{" "}
                    <strong>
                      {booking.paymentStatus || "Not available"}
                    </strong>
                  </div>

                  {/* Booking Actions */}
                  {booking.status === "pending" && (
                    <div className="booking-actions">
                      <button
                        className="accept-booking-button"
                        onClick={() =>
                          handleBookingAction(
                            booking.id,
                            "accept-booking"
                          )
                        }
                        disabled={actionLoading === booking.id}
                      >
                        {actionLoading === booking.id
                          ? "Processing..."
                          : "✓ Accept Booking"}
                      </button>

                      <button
                        className="reject-booking-button"
                        onClick={() =>
                          handleBookingAction(
                            booking.id,
                            "reject-booking"
                          )
                        }
                        disabled={actionLoading === booking.id}
                      >
                        ✕ Reject Booking
                      </button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default Dashboard;