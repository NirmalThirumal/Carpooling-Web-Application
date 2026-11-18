
import { useCallback, useContext, useEffect, useState } from "react";
import { AuthContext } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import authenticatedFetch from "../services/authenticatedFetch";
import "../styles/yourbookings.css";

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
  if (!booking.cancelledBy) {
    return "Not recorded";
  }

  if (booking.cancelledBy === booking.driverId) {
    return "Driver";
  }

  if (booking.cancelledBy === booking.userId) {
    return "Passenger";
  }

  return "Not recorded";
}

function getRideCancelledByLabel(ride) {
  if (!ride?.cancelledBy) {
    return "Not recorded";
  }

  if (ride.cancelledBy === ride.userId) {
    return "Driver";
  }

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

  // Backward compatibility for older bookings.
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

function YourBookings() {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();

  const [bookings, setBookings] = useState([]);
  const [ridesMap, setRidesMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [unreadMap, setUnreadMap] = useState({});
  const [cancellingId, setCancellingId] = useState(null);
  const [reviewedMap, setReviewedMap] = useState({});

  // ==========================================
  // FETCH BOOKINGS AND ASSOCIATED RIDES
  // FROM MONGODB
  // ==========================================

  const fetchBookings = useCallback(async (showLoading = true) => {
    if (!user) {
      setBookings([]);
      setRidesMap({});
      setReviewedMap({});
      setLoading(false);
      return;
    }

    try {
      if (showLoading) {
        setLoading(true);
      }

      setError("");

      // Fetch passenger bookings, associated rides,
      // and reviewed booking IDs from MongoDB.
      const response = await authenticatedFetch(
        "/api/my-bookings",
        {
          method: "GET"
        }
      );

      const data = await response.json();

      if (!response.ok || data.success === false) {
        throw new Error(
          data.message ||
          data.error ||
          "Unable to load your bookings."
        );
      }

      // Normalize MongoDB booking IDs.
      const bookingsData = (data.bookings || []).map((booking) => ({
        ...booking,
        id: String(booking.id || booking._id),
        rideId: String(booking.rideId)
      }));

      // Display newest bookings first.
      bookingsData.sort((a, b) => {
        const dateA = new Date(a.createdAt || 0).getTime();
        const dateB = new Date(b.createdAt || 0).getTime();

        return dateB - dateA;
      });

      // Build a lookup of associated rides.
      const ridesData = data.rides || [];

      const ridesEntries = ridesData.map((ride) => [
        String(ride.id || ride._id),
        {
          ...ride,
          id: String(ride.id || ride._id)
        }
      ]);

      // Build the reviewed-booking lookup.
      const reviewedBookingIds = data.reviewedBookingIds || [];

      const reviewedEntries = reviewedBookingIds.map((bookingId) => [
        String(bookingId),
        true
      ]);

      setBookings(bookingsData);
      setRidesMap(Object.fromEntries(ridesEntries));
      setReviewedMap(Object.fromEntries(reviewedEntries));
    } catch (err) {
      console.error("Your Bookings fetch error:", err);

      setError(
        err.message || "Unable to load your bookings."
      );
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  }, [user]);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);


  // ==========================================
  // FETCH UNREAD CHAT MESSAGE COUNTS
  // FROM MONGODB
  // ==========================================

  useEffect(() => {
    if (!user || bookings.length === 0) {
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

        if (!response.ok || !data.success) {
          throw new Error(
            data.error || "Unable to fetch unread message counts."
          );
        }

        if (active) {
          setUnreadMap(data.unreadCounts || {});
        }
      } catch (error) {
        console.error("Unread message count error:", error);
      }
    };

    // Fetch immediately.
    fetchUnreadCounts();

    // Refresh unread counts every 5 seconds.
    const intervalId = setInterval(fetchUnreadCounts, 5000);

    return () => {
      active = false;
      clearInterval(intervalId);
    };
  }, [bookings, user]);


  // ==========================================
  // CANCEL BOOKING
  // ==========================================

  const handleCancelBooking = async (bookingId) => {
    const confirmed = window.confirm(
      "Are you sure you want to cancel this booking?"
    );

    if (!confirmed) return;

    try {
      setCancellingId(bookingId);
      setError("");

      const response = await authenticatedFetch(
        "/api/cancel-booking",
        {
          method: "POST",
          body: JSON.stringify({ bookingId })
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.message || data.error || "Unable to cancel booking."
        );
      }

      // Refresh the booking information from MongoDB.
      await fetchBookings(false);

      alert("Booking cancelled successfully.");
    } catch (err) {
      console.error("Cancel booking error:", err);
      alert(err.message || "Error cancelling booking.");
    } finally {
      setCancellingId(null);
    }
  };

  // ==========================================
  // BOOKING STATUS HELPERS
  // ==========================================

  const getStatusClass = (status) => {
    const statusClasses = {
      pending: "pending",
      accepted: "accepted",
      rejected: "rejected",
      cancelled: "cancelled",
      completed: "completed"
    };

    return statusClasses[status] || "pending";
  };

  const getStatusLabel = (status) => {
    const labels = {
      pending: "Pending",
      accepted: "Accepted",
      rejected: "Rejected",
      cancelled: "Cancelled",
      completed: "Completed"
    };

    return labels[status] || status || "Pending";
  };

  // ==========================================
  // LOADING AND AUTHENTICATION STATES
  // ==========================================

  if (!user) {
    return (
      <div className="yourbookings-container">
        <div className="yourbookings-header">
          <h1>Your Bookings</h1>

          <button
            className="home-btn ghost"
            onClick={() => navigate("/home")}
          >
            Back
          </button>
        </div>

        <div className="no-results">
          <p>Please log in to view your bookings.</p>
        </div>
      </div>
    );
  }

  // ==========================================
  // MAIN PAGE
  // ==========================================

  return (
    <div className="yourbookings-container">
      {/* Header */}
      <header className="yourbookings-header">
        <h1>🎟️ Your Bookings</h1>

        <button
          className="home-btn ghost"
          onClick={() => navigate("/home")}
        >
          ← Back to Home
        </button>
      </header>

      {/* Section Heading */}
      <div className="section-header">
        <h3>Your Ride Bookings</h3>

        <span className="booking-count">
          {bookings.length} bookings
        </span>
      </div>

      {/* Bookings Grid */}
      <div className="rides-grid">
        {loading ? (
          <div className="no-results">
            <p>Loading your bookings...</p>
          </div>
        ) : error ? (
          <div className="no-results booking-error">
            <p>{error}</p>

            <button
              className="home-btn primary"
              onClick={() => fetchBookings()}
            >
              Try Again
            </button>
          </div>
        ) : bookings.length === 0 ? (
          <div className="no-results">
            <div className="empty-bookings-icon">🎟️</div>

            <h3>No bookings yet</h3>

            <p>You haven't booked any rides yet.</p>

            <button
              className="home-btn primary"
              onClick={() => navigate("/home")}
            >
              Explore Available Rides
            </button>
          </div>
        ) : (
          bookings.map((booking) => {
            const ride = ridesMap[booking.rideId];

            return (
              <article className="ride-card" key={booking.id}>
                {/* Ride Image */}
                {ride && (
                  <>
                    <img
                      src={
                        ride.carImage ||
                        "https://via.placeholder.com/300x165?text=No+Image"
                      }
                      alt={ride.carName || "Car"}
                    />

                    {ride.carName && (
                      <div className="ride-car-name">
                        🚙 {ride.carName}
                      </div>
                    )}
                  </>
                )}

                <div className="ride-card-body">
                  {/* Route */}
                  <div className="ride-card-route">
                    {ride
                      ? `${ride.pickup} → ${ride.destination}`
                      : "Ride information unavailable"}
                  </div>

                  {/* Ride Information */}
                  {ride && (
                    <div className="ride-card-meta">
                      <p>
                        👤 Driver: {ride.driverName || "Not available"}
                      </p>

                      <p>🗓️ Date: {ride.departureDate}</p>
                      <p>🕐 Time: {ride.departureTime}</p>
                      <p>📏 Distance: {ride.distance} km</p>
                    </div>
                  )}

                  {/* Ride Cancellation Information */}
                  {ride?.status === "cancelled" && (
                    <div className="cancellation-info">
                      <h4>🚫 Ride Cancellation Information</h4>

                      <p>
                        <b>Cancelled by:</b>{" "}
                        {getRideCancelledByLabel(ride)}
                      </p>

                      <p>
                        <b>Cancelled on:</b>{" "}
                        {formatDateTime(ride.cancelledAt)}
                      </p>

                      <p>
                        This ride was cancelled by the driver.
                        Your booking has also been cancelled.
                      </p>
                    </div>
                  )}

                  {/* Ride Completion Information */}
                  {ride?.status === "completed" && (
                    <div className="cancellation-info">
                      <h4>✓ Ride Completion Information</h4>

                      <p>
                        <b>Completed on:</b>{" "}
                        {formatDateTime(ride.completedAt)}
                      </p>

                      <p>
                        Your ride has been marked as completed by the driver.
                      </p>
                    </div>
                  )}

                  {/* Booking Details */}
                  <div className="booking-details">
                    <h4>Booking Information</h4>

                    <div className="ride-card-meta">
                      <p>🎫 Booking ID: {booking.id}</p>
                      <p>👥 Passengers: {booking.passengerCount}</p>

                      <p>
                        💺 Seat Type: {booking.seatType || "Standard"}
                      </p>

                      <p>
                        🧳 Luggage: {booking.luggage || "No"}
                      </p>

                      {booking.luggage === "yes" && (
                        <p>
                          🧳 Number of Bags: {booking.bags || 0}
                        </p>
                      )}

                      <p>📞 Contact: {booking.contact}</p>
                    </div>
                  </div>

                  {/* Passenger Names */}
                  <div className="passenger-list">
                    <p>Passenger Names</p>

                    {booking.passengerNames?.map((name, index) => (
                      <span key={index}>
                        {index + 1}. {name}
                      </span>
                    ))}
                  </div>

                  {/* Booking Amount */}
                  <div className="ride-card-price">
                    <span className="price-label">
                      Total Booking Amount
                    </span>

                    <span className="price-value">
                      ₹{Number(booking.amount || 0).toFixed(2)}
                    </span>
                  </div>

                  {/* Booking Status */}
                  <div className="booking-status">
                    <span>Booking Status</span>

                    <span
                      className={`status-badge ${getStatusClass(booking.status)}`}
                    >
                      {getStatusLabel(booking.status)}
                    </span>
                  </div>

                  {/* Payment Status */}
                  <div className="booking-payment-status">
                    <span>Payment Status</span>

                    <span
                      className={`status-badge ${
                        booking.paymentStatus === "paid"
                          ? "accepted"
                          : "pending"
                      }`}
                    >
                      {booking.paymentStatus || "Pending"}
                    </span>
                  </div>

                  {/* Booking Cancellation Information */}
                  {booking.status === "cancelled" && (
                    <div className="cancellation-info">
                      <h4>🚫 Booking Cancellation Information</h4>

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

                  {/* Chat Action */}
                  {booking.status === "accepted" && (
                    <div className="booking-actions">
                      <div className="chat-btn-wrapper">
                        <button
                          className="home-btn primary"
                          onClick={() =>
                            navigate(`/chat/${booking.id}`)
                          }
                        >
                          💬 Chat with Driver
                        </button>

                        {unreadMap[booking.id] > 0 && (
                          <span className="unread-badge">
                            {unreadMap[booking.id]}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Review Action */}
                  {booking.status === "completed" &&
                    ride?.status === "completed" && (
                      <div className="booking-actions">
                        {reviewedMap[booking.id] ? (
                          <button
                            className="home-btn review-btn"
                            type="button"
                            disabled
                          >
                            ✓ Reviewed
                          </button>
                        ) : (
                          <button
                            className="home-btn review-btn"
                            onClick={() =>
                              navigate(`/review/${booking.id}`)
                            }
                          >
                            ⭐ Add Rating & Review
                          </button>
                        )}
                      </div>
                    )}

                  {/* Cancel Booking */}
                  {(booking.status === "pending" ||
                    booking.status === "accepted") && (
                    <button
                      className="home-btn cancel-booking-btn"
                      disabled={cancellingId === booking.id}
                      onClick={() =>
                        handleCancelBooking(booking.id)
                      }
                    >
                      {cancellingId === booking.id
                        ? "Cancelling..."
                        : "✖ Cancel Booking"}
                    </button>
                  )}
                </div>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}

export default YourBookings;
