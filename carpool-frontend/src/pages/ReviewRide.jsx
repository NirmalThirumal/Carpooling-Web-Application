
import { useState, useContext, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  getFirestore,
  doc,
  getDoc
} from "firebase/firestore";

import { AuthContext } from "../context/AuthContext";
import app from "../firebase/config";
import authenticatedFetch from "../services/authenticatedFetch";
import "../styles/reviewride.css";

const db = getFirestore(app);

function ReviewRide() {
  const { bookingId } = useParams();
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();

  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [review, setReview] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [alreadyReviewed, setAlreadyReviewed] = useState(false);
  const [error, setError] = useState("");

  // ==========================================
  // LOAD AND VALIDATE BOOKING
  // ==========================================

  useEffect(() => {
    let active = true;

    const fetchBooking = async () => {
      if (!user || !bookingId) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError("");

        // Load the booking.
        const bookingRef = doc(db, "bookings", bookingId);
        const bookingSnap = await getDoc(bookingRef);

        if (!bookingSnap.exists()) {
          throw new Error("Booking not found.");
        }

        const bookingData = {
          id: bookingSnap.id,
          ...bookingSnap.data()
        };

        // Only the passenger who made this booking can review it.
        if (bookingData.userId !== user.uid) {
          throw new Error("You are not authorized to review this booking.");
        }

        // The booking must be completed.
        if (bookingData.status !== "completed") {
          throw new Error(
            "You can submit a review only after the ride has been completed."
          );
        }

        // Confirm that the associated ride is also completed.
        if (!bookingData.rideId) {
          throw new Error("The associated ride could not be found.");
        }

        const rideRef = doc(db, "rides", bookingData.rideId);
        const rideSnap = await getDoc(rideRef);

        if (!rideSnap.exists()) {
          throw new Error("The associated ride could not be found.");
        }

        const rideData = rideSnap.data();

        if (rideData.status !== "completed") {
          throw new Error(
            "This ride has not been marked as completed yet."
          );
        }

        // Reviews are stored with bookingId as the review document ID.
        const reviewRef = doc(db, "reviews", bookingId);
        const reviewSnap = await getDoc(reviewRef);

        if (!active) return;

        setBooking({
          ...bookingData,
          ride: rideData
        });

        if (reviewSnap.exists()) {
          setAlreadyReviewed(true);
        }
      } catch (err) {
        console.error("Error loading review information:", err);

        if (active) {
          setError(
            err.message || "Unable to load the booking information."
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    fetchBooking();

    return () => {
      active = false;
    };
  }, [bookingId, user]);

  // ==========================================
  // SUBMIT REVIEW THROUGH BACKEND
  // ==========================================

  const handleSubmit = async () => {
    if (!user) {
      setError("Please log in to submit a review.");
      return;
    }

    if (!booking) {
      setError("Booking information is not available.");
      return;
    }

    if (!rating || rating < 1 || rating > 5) {
      setError("Please select a rating from 1 to 5 stars.");
      return;
    }

    const trimmedReview = review.trim();

    if (trimmedReview.length < 3) {
      setError("Please write at least 3 characters in your review.");
      return;
    }

    if (trimmedReview.length > 1000) {
      setError("Your review cannot exceed 1000 characters.");
      return;
    }

    try {
      setSubmitting(true);
      setError("");

      // Backend verifies passenger ownership, completed booking,
      // completed ride, and duplicate review prevention.
      const response = await authenticatedFetch(
        "/api/submit-review",
        {
          method: "POST",
          body: JSON.stringify({
            bookingId,
            rating,
            review: trimmedReview
          })
        }
      );

      const data = await response.json();

      if (!response.ok || data.success === false) {
        throw new Error(
          data.message || data.error || "Unable to submit your review."
        );
      }

      setSubmitted(true);
      setAlreadyReviewed(true);
    } catch (err) {
      console.error("Review submission error:", err);

      setError(
        err.message || "Something went wrong while submitting your review."
      );
    } finally {
      setSubmitting(false);
    }
  };

  // ==========================================
  // LOADING AND AUTHENTICATION STATES
  // ==========================================

  if (!user) {
    return (
      <div className="reviewride-container">
        <div className="reviewride-header">
          <h1>⭐ Rate Your Ride</h1>
        </div>

        <div className="reviewride-body">
          <div className="review-form-card">
            <p>Please log in to review your ride.</p>

            <button
              className="submit-btn"
              onClick={() => navigate("/login")}
            >
              Go to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="reviewride-container">
        <div className="reviewride-header">
          <h1>⭐ Rate Your Ride</h1>
        </div>

        <div className="reviewride-body">
          <div className="review-form-card">
            <p>Loading booking information...</p>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // MAIN PAGE
  // ==========================================

  return (
    <div className="reviewride-container">
      <div className="reviewride-header">
        <h1>⭐ Rate Your Ride</h1>
      </div>

      <div className="reviewride-body">
        {submitted ? (
          <div className="review-success">
            <div className="review-success-icon">🎉</div>
            <h3>Review Submitted!</h3>

            <p>
              Thanks for your feedback. It helps other passengers.
            </p>

            <button
              className="submit-btn"
              onClick={() => navigate("/home")}
            >
              Go to Home
            </button>
          </div>
        ) : alreadyReviewed ? (
          <div className="review-success">
            <div className="review-success-icon">⭐</div>
            <h3>Already Reviewed</h3>

            <p>
              You have already submitted a review for this ride.
              Thank you for your feedback!
            </p>

            <button
              className="submit-btn"
              onClick={() => navigate("/home")}
            >
              Go to Home
            </button>
          </div>
        ) : error && !booking ? (
          <div className="review-form-card">
            <h3>Unable to Review This Ride</h3>
            <p role="alert">{error}</p>

            <button
              className="submit-btn"
              onClick={() => navigate("/bookings")}
            >
              Back to My Bookings
            </button>
          </div>
        ) : (
          <div className="review-form-card">
            <h3>How was your ride?</h3>

            {booking?.ride && (
              <p>
                {booking.ride.pickup || "Pickup"} →{" "}
                {booking.ride.destination || "Destination"}
              </p>
            )}

            <div
              className="star-row"
              aria-label={`Selected rating: ${rating} out of 5`}
            >
              {[1, 2, 3, 4, 5].map((star) => (
                <span
                  key={star}
                  role="button"
                  tabIndex={0}
                  aria-label={`${star} star${star > 1 ? "s" : ""}`}
                  aria-pressed={rating === star}
                  className={`star ${
                    star <= (hovered || rating) ? "filled" : ""
                  }`}
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHovered(star)}
                  onMouseLeave={() => setHovered(0)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setRating(star);
                    }
                  }}
                >
                  ★
                </span>
              ))}
            </div>

            <p>
              {rating > 0
                ? `You selected ${rating} out of 5 stars.`
                : "Select a star rating."}
            </p>

            <label className="review-label" htmlFor="ride-review">
              Your Review
            </label>

            <textarea
              id="ride-review"
              className="review-textarea"
              placeholder="Write about your experience..."
              value={review}
              onChange={(event) => setReview(event.target.value)}
              minLength={3}
              maxLength={1000}
              rows={5}
              disabled={submitting}
            />

            <p>
              {review.length}/1000 characters
            </p>

            {error && (
              <p className="review-error" role="alert">
                {error}
              </p>
            )}

            <button
              className="submit-btn"
              onClick={handleSubmit}
              disabled={
                submitting ||
                !rating ||
                review.trim().length < 3 ||
                review.trim().length > 1000
              }
            >
              {submitting ? "Submitting..." : "Submit Review"}
            </button>

            <button
              type="button"
              className="submit-btn review-back-btn"
              onClick={() => navigate("/bookings")}
              disabled={submitting}
            >
              Back to My Bookings
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default ReviewRide;
