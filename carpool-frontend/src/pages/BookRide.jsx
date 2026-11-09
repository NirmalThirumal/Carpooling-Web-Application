import { useState, useEffect, useContext } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getFirestore, doc, getDoc } from "firebase/firestore";

import { AuthContext } from "../context/AuthContext";
import app from "../firebase/config";
import authenticatedFetch from "../services/authenticatedFetch";
import "../styles/bookride.css";

const db = getFirestore(app);

function BookRide() {
  const { rideId } = useParams();
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);

  const [ride, setRide] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  const [error, setError] = useState("");
  const [bookingResult, setBookingResult] = useState(null);
  const [showPayment, setShowPayment] = useState(false);
  const [paymentOutcome, setPaymentOutcome] = useState("success");

  const [passengerCount, setPassengerCount] = useState(1);
  const [passengerNames, setPassengerNames] = useState([""]);
  const [contact, setContact] = useState("");
  const [luggage, setLuggage] = useState("no");
  const [bags, setBags] = useState("");
  const [seatType, setSeatType] = useState("window");
  const [paymentMethod, setPaymentMethod] = useState("cash");

  // Fetch the selected ride.
  useEffect(() => {
    let active = true;

    const fetchRide = async () => {
      try {
        setLoading(true);
        setError("");

        const rideRef = doc(db, "rides", rideId);
        const rideSnap = await getDoc(rideRef);

        if (!active) return;

        if (!rideSnap.exists()) {
          setError("Ride not found.");
          return;
        }

        const rideData = {
          id: rideSnap.id,
          ...rideSnap.data()
        };

        if (rideData.status !== "published") {
          setError("This ride is no longer available for booking.");
          return;
        }

        if (!Number.isInteger(rideData.seats) || rideData.seats <= 0) {
          setError("No seats are currently available.");
          return;
        }

        if (user && rideData.userId === user.uid) {
          setError("You cannot book your own ride.");
          return;
        }

        setRide(rideData);
        setPassengerCount(1);
        setPassengerNames([""]);
      } catch (err) {
        console.error("Error fetching ride:", err);
        if (active) {
          setError("Unable to load ride details. Please try again.");
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    if (rideId) {
      fetchRide();
    } else {
      setError("Ride ID is missing.");
      setLoading(false);
    }

    return () => {
      active = false;
    };
  }, [rideId, user]);

  const handlePassengerCount = (count) => {
    setPassengerCount(count);
    setPassengerNames((previous) =>
      Array.from(
        { length: count },
        (_, index) => previous[index] || ""
      )
    );
  };

  const handleNameChange = (index, value) => {
    setPassengerNames((previous) =>
      previous.map((name, i) => (i === index ? value : name))
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!user) {
      setError("Please log in before booking a ride.");
      return;
    }

    if (!ride) {
      setError("Ride information is unavailable.");
      return;
    }

    if (!/^[6-9]\d{9}$/.test(contact)) {
      setError("Enter a valid 10-digit Indian mobile number.");
      return;
    }

    if (passengerNames.some((name) => !name.trim())) {
      setError("Please enter the name of every passenger.");
      return;
    }

    if (
      passengerCount < 1 ||
      passengerCount > ride.seats
    ) {
      setError("Please select a valid number of available seats.");
      return;
    }

    if (
      luggage === "yes" &&
      (!Number.isInteger(Number(bags)) ||
        Number(bags) < 1 ||
        Number(bags) > 20)
    ) {
      setError("Please enter a valid number of bags (1–20).");
      return;
    }

    await confirmBooking();
  };

  // Create the booking through the authenticated backend.
  // Online bookings are initially unpaid until the mock-payment endpoint confirms them.
  const confirmBooking = async () => {
    try {
      setSubmitting(true);
      setError("");

      const response = await authenticatedFetch("/api/book-ride", {
        method: "POST",
        body: JSON.stringify({
          rideId,
          passengerCount,
          passengerNames: passengerNames.map((name) => name.trim()),
          contact,
          luggage,
          bags: luggage === "yes" ? Number(bags) : 0,
          seatType,
          paymentMethod
        })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Booking request failed.");
      }

      const result = {
        bookingId: data.bookingId,
        amount: Number(data.amount),
        paymentMethod,
        paymentStatus: paymentMethod === "cash" ? "pending" : "unpaid",
        transactionId: null
      };

      setBookingResult(result);

      if (paymentMethod === "online") {
        setShowPayment(true);
      }
    } catch (err) {
      console.error("Booking submission error:", err);
      setError(err.message || "Booking failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // This is a DEMO simulation only. The backend must verify the booking owner
  // and write the payment result; the browser never updates Firestore directly.
  const handleMockPayment = async () => {
    if (!bookingResult?.bookingId) {
      setError("Booking information is missing. Please try again.");
      return;
    }

    try {
      setPaymentProcessing(true);
      setError("");

      const response = await authenticatedFetch("/api/mock-payment", {
        method: "POST",
        body: JSON.stringify({
          bookingId: bookingResult.bookingId,
          outcome: paymentOutcome
        })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.error || "Unable to process the demo payment."
        );
      }

      setBookingResult((previous) => ({
        ...previous,
        paymentStatus:
          data.paymentStatus ||
          (paymentOutcome === "success" ? "paid" : "failed"),
        transactionId: data.transactionId || null
      }));

      setShowPayment(false);

      if (paymentOutcome === "failure") {
        setError(
          "The demo payment was declined. Your booking remains unpaid. You can retry the payment."
        );
        setShowPayment(true);
      }
    } catch (err) {
      console.error("Mock payment error:", err);
      setError(
        err.message ||
          "Demo payment could not be completed. Please try again."
      );
    } finally {
      setPaymentProcessing(false);
    }
  };

  const retryPayment = () => {
    setError("");
    setShowPayment(true);
  };

  // Loading screen.
  if (loading) {
    return (
      <div className="bookride-container">
        <p className="loading-text">Loading ride details...</p>
      </div>
    );
  }

  // Booking confirmation.
  if (bookingResult && !showPayment) {
    const onlinePaid =
      bookingResult.paymentMethod === "online" &&
      bookingResult.paymentStatus === "paid";

    return (
      <div className="bookride-container">
        <div className="bookride-header">
          <h1>🎟️ Booking Confirmation</h1>
        </div>

        <div className="bookride-body">
          <div className="booking-success-card">
            <div className="booking-success-icon">
              {onlinePaid ? "✅" : "🎉"}
            </div>

            <h2>
              {onlinePaid
                ? "Demo Payment Successful!"
                : "Booking Request Submitted!"}
            </h2>

            <p>
              {onlinePaid
                ? "Your simulated online payment was successful. Your booking request is now waiting for driver approval."
                : "Your booking request has been submitted. Wait for the driver to accept your request."}
            </p>

            <div className="booking-summary">
              <div>
                <span>Booking ID</span>
                <strong>{bookingResult.bookingId}</strong>
              </div>

              <div>
                <span>Total Amount</span>
                <strong>
                  ₹{Number(bookingResult.amount).toFixed(2)}
                </strong>
              </div>

              <div>
                <span>Payment Method</span>
                <strong>
                  {bookingResult.paymentMethod === "cash"
                    ? "Cash on Ride"
                    : "Online Payment (Demo)"}
                </strong>
              </div>

              <div>
                <span>Booking Status</span>
                <strong className="pending-text">
                  Pending Driver Approval
                </strong>
              </div>

              <div>
                <span>Payment Status</span>
                <strong
                  className={
                    bookingResult.paymentStatus === "paid"
                      ? "success-text"
                      : "pending-text"
                  }
                >
                  {bookingResult.paymentMethod === "cash"
                    ? "Pending – Pay during ride"
                    : bookingResult.paymentStatus === "paid"
                    ? "Paid (Demo Transaction)"
                    : "Unpaid"}
                </strong>
              </div>

              {bookingResult.transactionId && (
                <div>
                  <span>Demo Transaction ID</span>
                  <strong>{bookingResult.transactionId}</strong>
                </div>
              )}
            </div>

            {bookingResult.paymentMethod === "online" &&
              bookingResult.paymentStatus !== "paid" && (
                <button
                  type="button"
                  className="submit-btn"
                  onClick={retryPayment}
                >
                  Retry Demo Payment
                </button>
              )}

            <button
              type="button"
              className="submit-btn"
              onClick={() => navigate("/home")}
            >
              Go to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bookride-container">
      <div className="bookride-header">
        <button
          type="button"
          className="back-btn"
          onClick={() => navigate(-1)}
        >
          ← Back
        </button>

        <h1>🎟️ Book Ride</h1>
      </div>

      <div className="bookride-body">
        {error && (
          <div className="booking-error" role="alert">
            {error}
          </div>
        )}

        {ride && (
          <>
            <h2>
              📍 {ride.pickup} → {ride.destination}
            </h2>

            <div className="booking-ride-summary">
              {ride.carImage && (
                <img
                  src={ride.carImage}
                  alt={ride.carName || "Car"}
                />
              )}

              <div>
                <h3>{ride.carName || "Available Ride"}</h3>
                <p>👤 Driver: {ride.driverName || "Driver"}</p>
                <p>
                  🗓️ {ride.departureDate} · 🕐 {ride.departureTime}
                </p>
                <p>💺 {ride.seats} seats available</p>
                <strong>
                  ₹{Number(ride.totalPrice).toFixed(2)} per passenger
                </strong>
              </div>
            </div>

            <form className="bookride-form" onSubmit={handleSubmit}>
              {/* Passenger details */}
              <div className="form-card">
                <h3>👥 Passenger Details</h3>

                <div className="form-group">
                  <label htmlFor="passenger-count">
                    Passenger Count
                  </label>

                  <select
                    id="passenger-count"
                    value={passengerCount}
                    onChange={(e) =>
                      handlePassengerCount(Number(e.target.value))
                    }
                  >
                    {Array.from(
                      { length: ride.seats },
                      (_, i) => i + 1
                    ).map((count) => (
                      <option key={count} value={count}>
                        {count}
                      </option>
                    ))}
                  </select>
                </div>

                {passengerNames.map((name, index) => (
                  <div className="form-group" key={index}>
                    <label htmlFor={`passenger-${index}`}>
                      Passenger {index + 1} Name
                    </label>

                    <input
                      id={`passenger-${index}`}
                      type="text"
                      placeholder="Enter passenger name"
                      value={name}
                      onChange={(e) =>
                        handleNameChange(index, e.target.value)
                      }
                      required
                    />
                  </div>
                ))}

                <div className="form-group">
                  <label htmlFor="contact">Contact Number</label>

                  <input
                    id="contact"
                    type="tel"
                    placeholder="10-digit mobile number"
                    maxLength={10}
                    value={contact}
                    onChange={(e) =>
                      setContact(
                        e.target.value.replace(/\D/g, "").slice(0, 10)
                      )
                    }
                    required
                  />
                </div>
              </div>

              {/* Luggage */}
              <div className="form-card">
                <h3>🧳 Luggage Details</h3>

                <div className="form-group">
                  <label htmlFor="luggage">
                    Will you carry luggage?
                  </label>

                  <select
                    id="luggage"
                    value={luggage}
                    onChange={(e) => {
                      setLuggage(e.target.value);
                      setBags("");
                    }}
                  >
                    <option value="no">No</option>
                    <option value="yes">Yes</option>
                  </select>
                </div>

                {luggage === "yes" && (
                  <div className="form-group">
                    <label htmlFor="bags">Number of Bags</label>

                    <input
                      id="bags"
                      type="number"
                      min="1"
                      max="20"
                      placeholder="Enter number of bags"
                      value={bags}
                      onChange={(e) => setBags(e.target.value)}
                      required
                    />
                  </div>
                )}
              </div>

              {/* Seat preference */}
              <div className="form-card">
                <h3>💺 Seat Preference</h3>

                <div className="form-group">
                  <label htmlFor="seat-type">Preferred Seat</label>

                  <select
                    id="seat-type"
                    value={seatType}
                    onChange={(e) => setSeatType(e.target.value)}
                  >
                    <option value="window">Window</option>
                    <option value="middle">Middle</option>
                  </select>
                </div>
              </div>

              {/* Payment method */}
              <div className="form-card">
                <h3>💳 Payment Method</h3>

                <label className="radio-option">
                  <input
                    type="radio"
                    name="payment-method"
                    value="cash"
                    checked={paymentMethod === "cash"}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                  />
                  Cash on Ride
                </label>

                <label className="radio-option">
                  <input
                    type="radio"
                    name="payment-method"
                    value="online"
                    checked={paymentMethod === "online"}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                  />
                  Online Payment (Demo)
                </label>

                {paymentMethod === "cash" ? (
                  <p className="cash-note">
                    Pay the driver directly during the ride.
                  </p>
                ) : (
                  <div className="online-note">
                    <p>
                      This is a simulated payment for project demonstration.
                      No real money will be transferred.
                    </p>
                    <p>
                      Do not enter real card details, UPI PINs, passwords,
                      or banking credentials.
                    </p>
                  </div>
                )}
              </div>

              {/* Fare summary */}
              <div className="form-card booking-fare-card">
                <h3>💰 Fare Summary</h3>

                <div className="fare-row">
                  <span>Price per passenger</span>
                  <span>
                    ₹{Number(ride.totalPrice).toFixed(2)}
                  </span>
                </div>

                <div className="fare-row">
                  <span>Passenger count</span>
                  <span>× {passengerCount}</span>
                </div>

                <div className="fare-row fare-total">
                  <strong>Total Amount</strong>
                  <strong>
                    ₹
                    {(
                      Number(ride.totalPrice) * passengerCount
                    ).toFixed(2)}
                  </strong>
                </div>
              </div>

              <button
                type="submit"
                className="submit-btn"
                disabled={submitting}
              >
                {submitting
                  ? "Submitting Booking..."
                  : "Confirm Booking →"}
              </button>
            </form>
          </>
        )}
      </div>

      {/* Demo payment panel */}
      {showPayment && bookingResult && (
        <div
          className="mock-payment-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mock-payment-title"
        >
          <div className="mock-payment-card">
            <h2 id="mock-payment-title">💳 Demo Online Payment</h2>

            <p>
              Amount to simulate:{" "}
              <strong>
                ₹{Number(bookingResult.amount).toFixed(2)}
              </strong>
            </p>

            <p className="online-note">
              This is a test simulation only. It does not connect to a bank,
              UPI app, card network, or payment gateway. No real payment is
              made.
            </p>

            <div className="form-group">
              <label htmlFor="payment-outcome">
                Choose demo payment result
              </label>

              <select
                id="payment-outcome"
                value={paymentOutcome}
                onChange={(e) => setPaymentOutcome(e.target.value)}
                disabled={paymentProcessing}
              >
                <option value="success">
                  Simulate Successful Payment
                </option>
                <option value="failure">
                  Simulate Failed Payment
                </option>
              </select>
            </div>

            <button
              type="button"
              className="submit-btn"
              onClick={handleMockPayment}
              disabled={paymentProcessing}
            >
              {paymentProcessing
                ? "Processing Demo Payment..."
                : "Pay Now (Demo)"}
            </button>

            <button
              type="button"
              className="back-btn"
              onClick={() => {
                setShowPayment(false);
                setError("");
              }}
              disabled={paymentProcessing}
            >
              Pay Later
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default BookRide;
