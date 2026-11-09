
import { useContext, useEffect, useState } from "react";
import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  getDoc,
  doc,
  onSnapshot
} from "firebase/firestore";
import { AuthContext } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import app from "../firebase/config";
import authenticatedFetch from "../services/authenticatedFetch";
import "../styles/yourbookings.css";

const db = getFirestore(app);

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
  // ==========================================

  useEffect(() => {
    if (!user) {
      setBookings([]);
      setRidesMap({});
      setReviewedMap({});
      setLoading(false);
      return;
    }

    let active = true;

    const fetchBookings = async () => {
      try {
        setLoading(true);
        setError("");

        // Fetch bookings belonging to the logged-in passenger.
        const bookingsQuery = query(
          collection(db, "bookings"),
          where("userId", "==", user.uid)
        );

        const snapshot = await getDocs(bookingsQuery);

        const bookingsData = snapshot.docs.map((document) => ({
          id: document.id,
          ...document.data()
        }));

        if (!active) return;

        // Display newest bookings first.
        bookingsData.sort((a, b) => {
          const dateA = a.createdAt?.toMillis?.() || 0;
          const dateB = b.createdAt?.toMillis?.() || 0;

          return dateB - dateA;
        });

        setBookings(bookingsData);

        // Check reviews for completed bookings.
        const completedBookings = bookingsData.filter(
          (booking) => booking.status === "completed"
        );

        const reviewEntries = await Promise.all(
          completedBookings.map(async (booking) => {
            try {
              const reviewRef = doc(db, "reviews", booking.id);
              const reviewSnap = await getDoc(reviewRef);

              return [booking.id, reviewSnap.exists()];
            } catch (reviewError) {
              console.error(
                `Unable to check review for booking ${booking.id}:`,
                reviewError
              );

              return [booking.id, false];
            }
          })
        );

        if (active) {
          setReviewedMap(Object.fromEntries(reviewEntries));
        }

        // Fetch associated ride documents.
        const uniqueRideIds = [
          ...new Set(
            bookingsData
              .map((booking) => booking.rideId)
              .filter(Boolean)
          )
        ];

        const rideEntries = await Promise.all(
          uniqueRideIds.map(async (rideId) => {
            const rideRef = doc(db, "rides", rideId);
            const rideSnap = await getDoc(rideRef);

            return [
              rideId,
              rideSnap.exists() ? rideSnap.data() : null
            ];
          })
        );

        if (active) {
          setRidesMap(Object.fromEntries(rideEntries));
        }
      } catch (err) {
        console.error("Your Bookings fetch error:", err);

        if (active) {
          setError(
            err.code === "permission-denied"
              ? "Permission denied. Please check your Firestore booking and ride read rules."
              : err.message || "Unable to load your bookings."
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    fetchBookings();

    return () => {
      active = false;
    };
  }, [user]);

  // ==========================================
  // REAL-TIME UNREAD CHAT MESSAGES
  // ==========================================

  useEffect(() => {
    if (!user || bookings.length === 0) {
      setUnreadMap({});
      return;
    }

    const unsubscribers = [];
    let active = true;

    bookings.forEach((booking) => {
      // Chat document ID is the same as booking ID.
      const chatRef = doc(db, "chats", booking.id);

      const unsubscribeChat = onSnapshot(
        chatRef,
        (chatSnapshot) => {
          if (!active) return;

          // No chat exists yet.
          if (!chatSnapshot.exists()) {
            setUnreadMap((previous) => ({
              ...previous,
              [booking.id]: 0
            }));

            return;
          }

          const chat = chatSnapshot.data();

          // Verify that the logged-in user belongs to this chat.
          if (
            chat.driverId !== booking.driverId ||
            chat.passengerId !== user.uid
          ) {
            console.error(
              "Chat participant information does not match booking:",
              booking.id
            );

            setUnreadMap((previous) => ({
              ...previous,
              [booking.id]: 0
            }));

            return;
          }

          const messagesRef = collection(
            db,
            "chats",
            booking.id,
            "messages"
          );

          const unsubscribeMessages = onSnapshot(
            messagesRef,
            (messageSnapshot) => {
              if (!active) return;

              let unreadCount = 0;

              messageSnapshot.docs.forEach((messageDoc) => {
                const message = messageDoc.data();

                if (
                  message.senderId !== user.uid &&
                  !message.seenBy?.includes(user.uid)
                ) {
                  unreadCount++;
                }
              });

              setUnreadMap((previous) => ({
                ...previous,
                [booking.id]: unreadCount
              }));
            },
            (err) => {
              console.error(
                "Unread message listener error:",
                err.code,
                err.message
              );
            }
          );

          unsubscribers.push(unsubscribeMessages);
        },
        (err) => {
          console.error(
            "Chat listener error in YourBookings:",
            err.code,
            err.message
          );
        }
      );

      unsubscribers.push(unsubscribeChat);
    });

    return () => {
      active = false;
      unsubscribers.forEach((unsubscribe) => unsubscribe());
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

      // Retrieve the latest booking data from Firestore.
      const bookingRef = doc(db, "bookings", bookingId);
      const bookingSnap = await getDoc(bookingRef);

      if (bookingSnap.exists()) {
        const updatedBooking = {
          id: bookingSnap.id,
          ...bookingSnap.data()
        };

        setBookings((previous) =>
          previous.map((booking) =>
            booking.id === bookingId
              ? updatedBooking
              : booking
          )
        );
      }

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
