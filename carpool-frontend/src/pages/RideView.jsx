
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";

import authenticatedFetch from "../services/authenticatedFetch";

import "../styles/rideview.css";

function RideView() {
  const { rideId } = useParams();
  const navigate = useNavigate();

  const [ride, setRide] = useState(null);
  const [driver, setDriver] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [avgRating, setAvgRating] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // ========================================
  // FETCH RIDE, DRIVER AND REVIEWS FROM MONGODB
  // ========================================

  useEffect(() => {
    let isMounted = true;

    const fetchData = async () => {
      try {
        setLoading(true);
        setError("");

        // 1. FETCH RIDE AND DRIVER FROM MONGODB
        const response = await authenticatedFetch(
          `/api/rides/${rideId}`
        );

        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(
            data.error || "Unable to fetch ride details"
          );
        }

        if (!isMounted) return;

        setRide(data.ride);
        setDriver(data.driver);

        // 2. FETCH DRIVER REVIEWS FROM MONGODB
        try {
          const reviewsResponse = await authenticatedFetch(
            `/api/drivers/${data.ride.userId}`
          );

          const reviewsData = await reviewsResponse.json();

          if (reviewsResponse.ok && reviewsData.success) {
            const reviewsList = reviewsData.reviews || [];

            if (!isMounted) return;

            setReviews(reviewsList);

            // 3. CALCULATE AVERAGE RATING
            const validReviews = reviewsList.filter((review) => {
              const rating = Number(review.rating);

              return (
                Number.isFinite(rating) &&
                rating >= 1 &&
                rating <= 5
              );
            });

            if (validReviews.length > 0) {
              const total = validReviews.reduce(
                (sum, review) => sum + Number(review.rating),
                0
              );

              setAvgRating(
                (total / validReviews.length).toFixed(1)
              );
            } else {
              setAvgRating(null);
            }
          } else {
            console.warn(
              "Unable to fetch driver reviews:",
              reviewsData.error
            );
          }
        } catch (reviewError) {
          console.error(
            "Error fetching driver reviews:",
            reviewError
          );
        }

      } catch (err) {
        console.error("Error fetching ride details:", err);

        if (isMounted) {
          setError(
            err.message || "Unable to load ride details."
          );
        }

      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    if (rideId) {
      fetchData();
    } else {
      setError("Ride ID is missing.");
      setLoading(false);
    }

    return () => {
      isMounted = false;
    };

  }, [rideId]);

  // ========================================
  // RENDER RATING STARS
  // ========================================

  const renderStars = (rating) => {
    const value = Math.max(
      0,
      Math.min(5, Math.round(Number(rating) || 0))
    );

    return "★".repeat(value) + "☆".repeat(5 - value);
  };

  // ========================================
  // LOADING STATE
  // ========================================

  if (loading) {
    return (
      <div className="rideview-container">
        <div className="rideview-header">
          <h1>🚗 Ride Details</h1>
        </div>

        <p className="rideview-loading">
          Loading ride details...
        </p>
      </div>
    );
  }

  // ========================================
  // ERROR STATE
  // ========================================

  if (error || !ride) {
    return (
      <div className="rideview-container">
        <div className="rideview-header">
          <h1>🚗 Ride Details</h1>

          <button
            className="back-btn"
            onClick={() => navigate(-1)}
          >
            ← Back
          </button>
        </div>

        <p className="rideview-loading">
          {error || "Ride not found."}
        </p>
      </div>
    );
  }

  // ========================================
  // CHECK AVAILABLE SEATS
  // ========================================

  const hasAvailableSeats =
    Number(ride.seats) > 0 &&
    ride.status !== "fully_booked";

  // ========================================
  // MAIN PAGE
  // ========================================

  return (
    <div className="rideview-container">

      {/* Header */}

      <div className="rideview-header">
        <h1>🚗 Ride Details</h1>

        <button
          className="back-btn"
          onClick={() => navigate(-1)}
        >
          ← Back
        </button>
      </div>

      <div className="rideview-body">

        {/* Left Column */}

        <div className="rideview-left">

          {/* Car Image */}

          {ride.carImage && (
            <img
              className="rideview-car-img"
              src={ride.carImage}
              alt={ride.carName || "Car"}
            />
          )}

          {/* Car Name */}

          {ride.carName && (
            <div className="rideview-car-name">
              🚗 {ride.carName}
            </div>
          )}

          {/* Ride Information */}

          <div className="rideview-info-card">

            <div className="rideview-route">
              {ride.pickup}

              <span className="arrow">
                →
              </span>

              {ride.destination}
            </div>

            <div className="rideview-meta">

              <p>
                💺 Seats Available: {ride.seats}
              </p>

              <p>
                📏 Distance: {ride.distance} km
              </p>

              <p>
                🗓️ Departure Date: {ride.departureDate}
              </p>

              <p>
                🕐 Departure Time: {ride.departureTime}
              </p>

            </div>

          </div>

          {/* Driver Reviews */}

          <div className="rideview-reviews-card">

            <h3>
              Reviews ({reviews.length})
            </h3>

            {reviews.length === 0 ? (

              <p className="reviews-empty">
                No reviews yet for this driver
              </p>

            ) : (

              reviews.slice(0, 3).map((review) => (

                <div
                  className="review-card"
                  key={review.id || review._id}
                >

                  <div className="review-card-top">

                    <span className="review-passenger">
                      {review.passengerName ||
                        review.reviewerName ||
                        "Passenger"}
                    </span>

                    <span className="review-stars">
                      {renderStars(review.rating)}
                    </span>

                  </div>

                  <p className="review-text">
                    {review.review}
                  </p>

                </div>

              ))

            )}

          </div>

        </div>

        {/* Right Column */}

        <div className="rideview-right">

          {/* Driver Card */}

          {driver && (

            <div
              className="driver-card"
              onClick={() => navigate(`/driver/${ride.userId}`)}
            >

              <h3>Driver</h3>

              <div className="driver-name">
                {driver.name || driver.email}
              </div>

              <div className="driver-rating-badge">
                ⭐ {avgRating || "New"}
              </div>

              <p className="driver-card-hint">
                Tap to view full profile →
              </p>

            </div>

          )}

          {/* Price Breakdown */}

          <div className="price-card">

            <h3>Price Breakdown</h3>

            <div className="price-row">
              <span>Base Price</span>
              <span>
                ₹{Number(ride.basePrice || 0).toFixed(2)}
              </span>
            </div>

            <div className="price-row">
              <span>Service Fee</span>
              <span>
                ₹{Number(ride.serviceFee || 0).toFixed(2)}
              </span>
            </div>

            <div className="price-row total">
              <span>Total</span>
              <span>
                ₹{Number(ride.totalPrice || 0).toFixed(2)}
              </span>
            </div>

          </div>

          {/* Book Ride Button */}

          <button
            className={`book-btn ${
              !hasAvailableSeats ? "disabled-btn" : ""
            }`}
            onClick={() => navigate(`/book-ride/${rideId}`)}
            disabled={!hasAvailableSeats}
          >

            {!hasAvailableSeats
              ? "❌ Fully Booked"
              : "🎟️ Book This Ride"}

          </button>

        </div>

      </div>

    </div>
  );
}

export default RideView;
