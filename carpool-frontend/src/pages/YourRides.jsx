
import { useCallback, useContext, useEffect, useState } from "react";
import { AuthContext } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import authenticatedFetch from "../services/authenticatedFetch";
import "../styles/yourrides.css";

// ==========================================
// DATE AND CANCELLATION HELPERS
// ==========================================

function formatDateTime(value) {
  if (!value) return "Not available";

  const date =
    typeof value.toDate === "function"
      ? value.toDate()
      : value instanceof Date
        ? value
        : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not available";
  }

  return date.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function getCancelledByLabel(booking) {
  if (!booking.cancelledBy) return "Not recorded";
  if (booking.cancelledBy === booking.driverId) return "Driver";
  if (booking.cancelledBy === booking.userId) return "Passenger";

  return "Not recorded";
}

function getRefundStatusLabel(booking) {
  if (booking.refundStatus === "refund_pending") {
    return "Refund pending";
  }

  if (booking.refundStatus === "refunded") {
    return "Refunded";
  }

  if (booking.refundStatus === "not_required") {
    return "Not required";
  }

  // Older bookings may not have a refundStatus field.
  if (
    booking.paymentMethod === "cash" ||
    booking.paymentStatus !== "paid"
  ) {
    return "Not required";
  }

  return "Not recorded";
}

// ==========================================
// MAIN COMPONENT
// ==========================================

function YourRides() {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();

  const [rides, setRides] = useState([]);
  const [bookingsMap, setBookingsMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [unreadMap, setUnreadMap] = useState({});
  const [actionLoading, setActionLoading] = useState("");
  const [error, setError] = useState("");

  // ==========================================
  // FETCH DRIVER RIDES AND BOOKING REQUESTS
  // FROM MONGODB
  // ==========================================

  const fetchUserRides = useCallback(async () => {
    if (!user) {
      setRides([]);
      setBookingsMap({});
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError("");

      // Fetch the logged-in driver's rides and bookings from MongoDB.
      const [ridesResponse, bookingsResponse] = await Promise.all([
        authenticatedFetch("/api/my-rides"),
        authenticatedFetch("/api/driver-bookings")
      ]);

      const [ridesData, bookingsData] = await Promise.all([
        ridesResponse.json(),
        bookingsResponse.json()
      ]);

      if (!ridesResponse.ok || ridesData.success === false) {
        throw new Error(
          ridesData.message ||
          ridesData.error ||
          "Unable to fetch your posted rides."
        );
      }

      if (!bookingsResponse.ok || bookingsData.success === false) {
        throw new Error(
          bookingsData.message ||
          bookingsData.error ||
          "Unable to fetch your booking requests."
        );
      }

      const ridesList = Array.isArray(ridesData)
        ? ridesData
        : ridesData.rides || [];

      const bookingsList = Array.isArray(bookingsData)
        ? bookingsData
        : bookingsData.bookings || [];

      // Normalize MongoDB IDs for the existing UI and chat.
      const ridesDataNormalized = ridesList.map((ride) => ({
        ...ride,
        id: String(ride.id || ride._id)
      }));

      const bookingsDataNormalized = bookingsList.map((booking) => ({
        ...booking,
        id: String(booking.id || booking._id),
        rideId: String(booking.rideId)
      }));

      // Group bookings according to their rideId.
      const groupedBookings = {};

      ridesDataNormalized.forEach((ride) => {
        groupedBookings[ride.id] = [];
      });

      bookingsDataNormalized.forEach((booking) => {
        if (groupedBookings[booking.rideId]) {
          groupedBookings[booking.rideId].push(booking);
        }
      });

      // Sort booking requests by newest first.
      Object.keys(groupedBookings).forEach((rideId) => {
        groupedBookings[rideId].sort((a, b) => {
          const dateA = new Date(a.createdAt || 0).getTime();
          const dateB = new Date(b.createdAt || 0).getTime();

          return dateB - dateA;
        });
      });

      setRides(ridesDataNormalized);
      setBookingsMap(groupedBookings);
    } catch (err) {
      console.error("Error fetching rides and bookings:", err);

      setError(
        err.message ||
        "Unable to load your rides and booking requests. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchUserRides();
  }, [fetchUserRides]);

  // ==========================================
  // AUTHENTICATED BACKEND REQUEST
  // ==========================================

  // idField defaults to bookingId.
  // For ride cancellation and completion, pass "rideId".

  const sendBookingRequest = async (
    endpoint,
    id,
    idField = "bookingId"
  ) => {
    const response = await authenticatedFetch(`/api/${endpoint}`, {
      method: "POST",
      body: JSON.stringify({ [idField]: id })
    });

    const data = await response.json();

    if (!response.ok || data.success === false) {
      throw new Error(
        data.message || data.error || "Operation failed."
      );
    }

    return data;
  };

  // ==========================================
  // ACCEPT BOOKING
  // ==========================================

  const handleAccept = async (booking) => {
    const confirmed = window.confirm(
      "Are you sure you want to accept this booking?"
    );

    if (!confirmed) return;

    try {
      setActionLoading(booking.id);
      setError("");

      // Backend verifies driver and updates seats transactionally.
      await sendBookingRequest("accept-booking", booking.id);

      // Chat.jsx creates the chat document using booking.id
      // as its document ID. Do not create another chat here.

      alert("Booking accepted successfully!");

      await fetchUserRides();
    } catch (err) {
      console.error("Error accepting booking:", err);
      setError(err.message || "Unable to accept booking.");
    } finally {
      setActionLoading("");
    }
  };

  // ==========================================
  // REJECT BOOKING
  // ==========================================

  const handleReject = async (bookingId) => {
    const confirmed = window.confirm(
      "Are you sure you want to reject this booking?"
    );

    if (!confirmed) return;

    try {
      setActionLoading(bookingId);
      setError("");

      // Use backend instead of direct Firestore update.
      await sendBookingRequest("reject-booking", bookingId);

      alert("Booking rejected successfully!");

      await fetchUserRides();
    } catch (err) {
      console.error("Error rejecting booking:", err);
      setError(err.message || "Unable to reject booking.");
    } finally {
      setActionLoading("");
    }
  };

  // ==========================================
  // COMPLETE RIDE
  // ==========================================

  const handleCompleteRide = async (rideId) => {
    const confirmed = window.confirm(
      "Are you sure you want to mark this ride as completed?\n\n" +
      "All accepted bookings will be marked as completed. " +
      "Pending booking requests will be closed."
    );

    if (!confirmed) return;

    try {
      setActionLoading(rideId);
      setError("");

      // Backend verifies the driver and completes the ride
      // along with its bookings transactionally.
      const result = await sendBookingRequest(
        "complete-ride",
        rideId,
        "rideId"
      );

      let message = "Ride completed successfully.";

      if (result.completedBookings > 0) {
        message +=
          `\n\n${result.completedBookings} accepted booking(s) marked as completed.`;
      }

      if (result.closedPendingBookings > 0) {
        message +=
          `\n${result.closedPendingBookings} pending booking request(s) closed.`;
      }

      alert(message);

      await fetchUserRides();
    } catch (err) {
      console.error("Error completing ride:", err);
      setError(err.message || "Unable to complete this ride.");
    } finally {
      setActionLoading("");
    }
  };

  // ==========================================
  // CANCEL RIDE
  // ==========================================

  const handleCancelRide = async (rideId) => {
    const confirmed = window.confirm(
      "Are you sure you want to cancel this ride?\n\nAll pending and accepted bookings for this ride will also be cancelled. Affected passengers will receive notifications."
    );

    if (!confirmed) return;

    try {
      setActionLoading(rideId);
      setError("");

      // The backend cancels the ride and its active bookings transactionally.
      const result = await sendBookingRequest(
        "cancel-ride",
        rideId,
        "rideId"
      );

      let message = "Ride cancelled successfully.";

      if (result.affectedBookings > 0) {
        message +=
          `\n\n${result.affectedBookings} booking(s) were also cancelled.`;
      }

      if (result.refundCount > 0) {
        message +=
          `\n\n${result.refundCount} online payment(s) require refund processing.`;
      }

      alert(message);

      await fetchUserRides();
    } catch (err) {
      console.error("Error cancelling ride:", err);
      setError(err.message || "Unable to cancel this ride.");
    } finally {
      setActionLoading("");
    }
  };

  // ==========================================
  // UNREAD CHAT MESSAGES
  // FETCH FROM MONGODB
  // ==========================================

  useEffect(() => {
    if (!user) {
      setUnreadMap({});
      return;
    }

    const allBookings = Object.values(bookingsMap).flat();

    if (allBookings.length === 0) {
      setUnreadMap({});
      return;
    }

    let active = true;

    const fetchUnreadCounts = async () => {
      try {
        const response = await authenticatedFetch(
          "/api/chats/unread-counts"
        );

        const data = await response.json();

        if (!response.ok || data.success === false) {
          throw new Error(
            data.error || "Unable to retrieve unread messages."
          );
        }

        if (active) {
          setUnreadMap(data.unreadCounts || {});
        }
      } catch (err) {
        console.error("Error fetching unread message counts:", err);
      }
    };

    fetchUnreadCounts();

    // Refresh unread counts every 5 seconds.
    const intervalId = setInterval(fetchUnreadCounts, 5000);

    return () => {
      active = false;
      clearInterval(intervalId);
    };
  }, [bookingsMap, user]);

  // ==========================================
  // RENDER
  // ==========================================

  return (
    <div className="yourrides-container">
      {/* Header */}
      <div className="yourrides-header">
        <h1>🚗 Your Rides</h1>

        <button
          className="home-btn ghost"
          onClick={() => navigate("/home")}
        >
          ← Back
        </button>
      </div>

      {/* Section Heading */}
      <div className="section-header">
        <h3>Your Posted Rides</h3>

        <button
          className="home-btn primary"
          onClick={fetchUserRides}
          disabled={loading}
        >
          ↻ Refresh
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="yourrides-error">
          {error}
        </div>
      )}

      {/* Rides Grid */}
      <div className="rides-grid">
        {loading ? (
          <div className="no-results">
            <p>Loading your rides and bookings...</p>
          </div>
        ) : rides.length === 0 ? (
          <div className="no-results">
            <p>You haven't posted any rides yet.</p>

            <button
              className="home-btn primary"
              onClick={() => navigate("/add-ride")}
            >
              + Offer a Ride
            </button>
          </div>
        ) : (
          rides.map((ride) => {
            const rideBookings = bookingsMap[ride.id] || [];

            return (
              <div className="ride-card" key={ride.id}>
                <img
                  src={
                    ride.carImage ||
                    "https://via.placeholder.com/300x165?text=No+Image"
                  }
                  loading="lazy"
                  alt={ride.carName || "Ride vehicle"}
                />

                {ride.carName && (
                  <div className="ride-car-name">
                    🚙 {ride.carName}
                  </div>
                )}

                <div className="ride-card-body">
                  {/* Route */}
                  <div className="ride-card-route">
                    {ride.pickup}
                    <span className="ride-route-arrow"> → </span>
                    {ride.destination}
                  </div>

                  {/* Ride Information */}
                  <div className="ride-card-meta">
                    <p>💺 {ride.seats} seats available</p>
                    <p>📏 {ride.distance} km</p>

                    <p>
                      🗓️ {ride.departureDate}
                      &nbsp; 🕐 {ride.departureTime}
                    </p>

                    <p>
                      <b>Ride status:</b>{" "}
                      <span
                        className={`status-badge ${ride.status || "draft"}`}
                      >
                        {ride.status || "draft"}
                      </span>
                    </p>
                  </div>

                  {/* Ride Cancellation Information */}
                  {ride.status === "cancelled" && (
                    <div className="cancellation-info">
                      <h4>Cancellation Information</h4>

                      <p>
                        <b>Cancelled by:</b>{" "}
                        {ride.cancelledBy
                          ? ride.cancelledBy === ride.userId
                            ? "Driver"
                            : "Not recorded"
                          : "Not recorded"}
                      </p>

                      <p>
                        <b>Cancelled on:</b>{" "}
                        {formatDateTime(ride.cancelledAt)}
                      </p>
                    </div>
                  )}

                  {/* Ride Completion Information */}
                  {ride.status === "completed" && (
                    <div className="cancellation-info">
                      <h4>Ride Completion Information</h4>

                      <p>
                        <b>Completed on:</b>{" "}
                        {formatDateTime(ride.completedAt)}
                      </p>

                      <p>
                        <b>Status:</b> Completed
                      </p>
                    </div>
                  )}

                  {/* Fare */}
                  <div className="ride-card-price">
                    <span className="price-label">Total fare</span>

                    <span className="price-value">
                      ₹{Number(ride.totalPrice || 0).toFixed(2)}
                    </span>
                  </div>

                  {/* Mark Ride as Completed */}
                  {["published", "fully_booked"].includes(ride.status) && (
                    <button
                      className="home-btn primary complete-ride-button"
                      onClick={() => handleCompleteRide(ride.id)}
                      disabled={actionLoading === ride.id}
                    >
                      {actionLoading === ride.id
                        ? "Processing..."
                        : "✓ Mark Ride as Completed"}
                    </button>
                  )}

                  {/* Cancel Ride */}
                  {ride.status !== "cancelled" &&
                    ride.status !== "completed" && (
                      <button
                        className="home-btn ghost cancel-ride-button"
                        onClick={() => handleCancelRide(ride.id)}
                        disabled={actionLoading === ride.id}
                      >
                        {actionLoading === ride.id
                          ? "Processing..."
                          : "Cancel Ride"}
                      </button>
                    )}

                  {/* Booking Requests */}
                  <div className="bookings-section">
                    <h4>
                      Booking Requests ({rideBookings.length})
                    </h4>

                    {rideBookings.length === 0 ? (
                      <p className="bookings-empty">
                        No bookings yet
                      </p>
                    ) : (
                      rideBookings.map((booking) => {
                        const passengerNames = Array.isArray(
                          booking.passengerNames
                        )
                          ? booking.passengerNames
                          : [];

                        return (
                          <div
                            className="booking-item"
                            key={booking.id}
                          >
                            <p>
                              <b>Booking ID:</b> {booking.id}
                            </p>

                            <p>
                              <b>Passenger:</b>{" "}
                              {booking.userName || "Not provided"}
                            </p>

                            <p>
                              <b>Email:</b>{" "}
                              {booking.userEmail || "Not provided"}
                            </p>

                            <p>
                              <b>Passenger names:</b>
                            </p>

                            <div className="booking-passenger-list">
                              {passengerNames.length > 0 ? (
                                passengerNames.map((name, index) => (
                                  <p key={index}>• {name}</p>
                                ))
                              ) : (
                                <p>Not provided</p>
                              )}
                            </div>

                            <p>
                              <b>Contact:</b>{" "}
                              {booking.contact || "Not provided"}
                            </p>

                            <p>
                              <b>Seats:</b>{" "}
                              {booking.passengerCount || 1}
                            </p>

                            <p>
                              <b>Seat Type:</b>{" "}
                              {booking.seatType || "Not specified"}
                            </p>

                            <p>
                              <b>Luggage:</b>{" "}
                              {booking.luggage || "Not specified"}
                            </p>

                            <p>
                              <b>Bags:</b> {booking.bags ?? 0}
                            </p>

                            <p>
                              <b>Amount:</b>{" "}
                              ₹{Number(booking.amount || 0).toFixed(2)}
                            </p>

                            <p>
                              <b>Payment:</b>{" "}
                              {booking.paymentMethod || "Not specified"}
                              {" ("}
                              {booking.paymentStatus || "unknown"}
                              {")"}
                            </p>

                            <p>
                              <b>Status:</b>{" "}
                              <span
                                className={`status-badge ${booking.status}`}
                              >
                                {booking.status}
                              </span>
                            </p>

                            {/* Booking Cancellation Information */}
                            {booking.status === "cancelled" && (
                              <div className="cancellation-info">
                                <h4>Cancellation Information</h4>

                                <p>
                                  <b>Cancelled by:</b>{" "}
                                  {getCancelledByLabel(booking)}
                                </p>

                                <p>
                                  <b>Cancelled on:</b>{" "}
                                  {formatDateTime(booking.cancelledAt)}
                                </p>

                                <p>
                                  <b>Refund status:</b>{" "}
                                  <span
                                    className={`refund-status ${
                                      booking.refundStatus || "not-recorded"
                                    }`}
                                  >
                                    {getRefundStatusLabel(booking)}
                                  </span>
                                </p>
                              </div>
                            )}

                            {/* Pending Booking Actions */}
                            {booking.status === "pending" && (
                              <div className="booking-actions">
                                <button
                                  className="home-btn primary"
                                  onClick={() => handleAccept(booking)}
                                  disabled={actionLoading === booking.id}
                                >
                                  {actionLoading === booking.id
                                    ? "Processing..."
                                    : "✓ Accept"}
                                </button>

                                <button
                                  className="home-btn ghost"
                                  onClick={() => handleReject(booking.id)}
                                  disabled={actionLoading === booking.id}
                                >
                                  ✕ Reject
                                </button>
                              </div>
                            )}

                            {/* Accepted Booking Chat */}
                            {booking.status === "accepted" && (
                              <div className="chat-btn-wrapper">
                                <button
                                  className="home-btn primary"
                                  onClick={() =>
                                    navigate(`/chat/${booking.id}`)
                                  }
                                >
                                  💬 Chat
                                </button>

                                {unreadMap[booking.id] > 0 && (
                                  <span className="unread-badge">
                                    {unreadMap[booking.id]}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default YourRides;
