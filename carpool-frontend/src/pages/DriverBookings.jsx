
import { useEffect, useState, useContext } from "react";

import { AuthContext } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import authenticatedFetch from "../services/authenticatedFetch";

import "../styles/driverbookings.css";

function DriverBookings() {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();

  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");
  const [actionError, setActionError] = useState("");
  const [processingId, setProcessingId] = useState(null);

  // ========================================
  // FETCH DRIVER BOOKINGS FROM MONGODB
  // ========================================

  useEffect(() => {
    let isMounted = true;

    const fetchBookings = async () => {
      if (!user?.uid) {
        setBookings([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setFetchError("");

        // Fetch bookings belonging to the logged-in driver.
        const response = await authenticatedFetch(
          "/api/driver-bookings"
        );

        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(
            data.error || "Unable to fetch booking requests."
          );
        }

        if (!isMounted) return;

        // Normalize MongoDB booking IDs.
        const bookingsData = (data.bookings || []).map(
          (booking) => ({
            ...booking,
            id: String(booking.id || booking._id)
          })
        );

        // Sort newest booking requests first.
        bookingsData.sort((a, b) => {
          const dateA = new Date(
            a.createdAt || 0
          ).getTime();

          const dateB = new Date(
            b.createdAt || 0
          ).getTime();

          return dateB - dateA;
        });

        setBookings(bookingsData);

      } catch (error) {
        console.error(
          "Error fetching driver bookings:",
          error
        );

        if (isMounted) {
          setFetchError(
            error.message ||
            "Unable to load booking requests. Please try again."
          );
        }

      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchBookings();

    return () => {
      isMounted = false;
    };

  }, [user?.uid]);

  // ========================================
  // ACCEPT OR REJECT A BOOKING
  // ========================================

  const handleBookingAction = async (bookingId, action) => {
    if (!bookingId || processingId) return;

    try {
      setProcessingId(bookingId);
      setActionError("");

      const response = await authenticatedFetch(
        `/api/${action}-booking`,
        {
          method: "POST",
          body: JSON.stringify({ bookingId })
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.error || `Unable to ${action} booking.`
        );
      }

      // Update the local UI without reloading the page.
      setBookings((previousBookings) =>
        previousBookings.map((booking) =>
          booking.id === bookingId
            ? {
                ...booking,
                status:
                  action === "accept"
                    ? "accepted"
                    : "rejected"
              }
            : booking
        )
      );

    } catch (error) {
      console.error(
        `${action} booking error:`,
        error
      );

      setActionError(
        error.message ||
        `Unable to ${action} booking. Please try again.`
      );

    } finally {
      setProcessingId(null);
    }
  };

  // ========================================
  // ACCEPT BOOKING
  // ========================================

  const handleAccept = (bookingId) => {
    handleBookingAction(bookingId, "accept");
  };

  // ========================================
  // REJECT BOOKING
  // ========================================

  const handleReject = (bookingId) => {
    handleBookingAction(bookingId, "reject");
  };

  // ========================================
  // PAGE UI
  // ========================================

  return (
    <div className="driverbookings-container">

      {/* Header */}

      <div className="driverbookings-header">
        <h1>📋 Booking Requests</h1>

        <button
          className="home-btn ghost"
          onClick={() => navigate("/home")}
        >
          ← Back
        </button>
      </div>

      {/* Section Heading */}

      <div className="section-header">
        <h3>Passenger Booking Requests</h3>
      </div>

      {/* Action Error */}

      {actionError && (
        <div
          className="driverbookings-action-error"
          role="alert"
        >
          {actionError}
        </div>
      )}

      {/* Booking List */}

      {loading ? (

        <div className="driverbookings-empty">
          Loading booking requests...
        </div>

      ) : fetchError ? (

        <div className="driverbookings-empty">
          <p>{fetchError}</p>

          <button
            className="home-btn primary"
            onClick={() => window.location.reload()}
          >
            Try Again
          </button>
        </div>

      ) : bookings.length === 0 ? (

        <div className="driverbookings-empty">
          No booking requests yet
        </div>

      ) : (

        <div className="driverbookings-list">

          {bookings.map((booking) => (

            <div
              className="booking-card"
              key={booking.id}
            >

              <h3>👥 Passenger Details</h3>

              <div className="booking-card-meta">

                <p>
                  <b>Passengers:</b>
                </p>

                <div className="passenger-list">

                  {Array.isArray(booking.passengerNames) &&
                  booking.passengerNames.length > 0 ? (

                    booking.passengerNames.map(
                      (name, index) => (
                        <p key={index}>• {name}</p>
                      )
                    )

                  ) : (

                    <p>Passenger details unavailable</p>

                  )}

                </div>

                <p>
                  <b>Contact:</b>{" "}
                  {booking.contact || "Not provided"}
                </p>

                <p>
                  <b>Seats:</b>{" "}
                  {booking.passengerCount ?? 0}
                </p>

                <p>
                  <b>Seat Type:</b>{" "}
                  {booking.seatType || "Standard"}
                </p>

                <p>
                  <b>Luggage:</b>{" "}
                  {booking.luggage || "No"}
                </p>

                <p>
                  <b>Status:</b>{" "}

                  <span
                    className={`status-badge ${booking.status}`}
                  >
                    {booking.status}
                  </span>
                </p>

              </div>

              {/* Accept / Reject Actions */}

              {booking.status === "pending" && (

                <div className="booking-actions">

                  <button
                    className="home-btn primary"
                    onClick={() => handleAccept(booking.id)}
                    disabled={processingId !== null}
                  >
                    {processingId === booking.id
                      ? "Processing..."
                      : "✓ Accept"}
                  </button>

                  <button
                    className="home-btn reject"
                    onClick={() => handleReject(booking.id)}
                    disabled={processingId !== null}
                  >
                    {processingId === booking.id
                      ? "Processing..."
                      : "✕ Reject"}
                  </button>

                </div>

              )}

            </div>

          ))}

        </div>

      )}

    </div>
  );
}

export default DriverBookings;
