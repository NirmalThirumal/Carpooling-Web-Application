
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import authenticatedFetch from "../services/authenticatedFetch";
import "../styles/driverprofile.css";

// ==========================================
// DATE AND RATING HELPERS
// ==========================================

function formatReviewDate(value) {
  if (!value) return "";

  const date =
    typeof value.toDate === "function"
      ? value.toDate()
      : value instanceof Date
        ? value
        : new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

function isValidRating(rating) {
  return (
    typeof rating === "number" &&
    Number.isFinite(rating) &&
    rating >= 1 &&
    rating <= 5
  );
}

// ==========================================
// DRIVER PROFILE
// ==========================================

function DriverProfile() {
  const { driverId } = useParams();
  const navigate = useNavigate();

  const [driver, setDriver] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [avgRating, setAvgRating] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // ==========================================
  // FETCH DRIVER PROFILE FROM MONGODB
  // ==========================================

  useEffect(() => {
    let active = true;

    const fetchData = async () => {
      if (!driverId) {
        setError("Driver information is unavailable.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError("");

        const response = await authenticatedFetch(
          `/api/drivers/${encodeURIComponent(driverId)}`,
          {
            method: "GET"
          }
        );

        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(
            data.error || "Unable to load driver profile."
          );
        }

        if (!active) return;

        const reviewsData = (data.reviews || [])
          .filter((review) => isValidRating(review.rating))
          .sort((a, b) => {
            return (
              new Date(b.createdAt || 0).getTime() -
              new Date(a.createdAt || 0).getTime()
            );
          });

        setDriver(data.driver);
        setReviews(reviewsData);
        setAvgRating(data.averageRating ?? null);
      } catch (err) {
        console.error("Driver profile fetch error:", err);

        if (active) {
          setError(
            err.message || "Unable to load the driver profile."
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      active = false;
    };
  }, [driverId]);

  // ==========================================
  // RATING DISPLAY
  // ==========================================

  const renderStars = (rating) => {
    const roundedRating = Math.max(
      0,
      Math.min(5, Math.round(Number(rating) || 0))
    );

    return (
      "★".repeat(roundedRating) +
      "☆".repeat(5 - roundedRating)
    );
  };

  // ==========================================
  // MAIN PAGE
  // ==========================================

  return (
    <div className="driverprofile-container">
      <div className="driverprofile-header">
        <h1>👤 Driver Profile</h1>

        <button
          className="back-btn"
          onClick={() => navigate(-1)}
        >
          ← Back
        </button>
      </div>

      <div className="driverprofile-body">
        {loading ? (
          <p className="reviews-empty">
            Loading driver profile...
          </p>
        ) : error ? (
          <div className="reviews-empty" role="alert">
            <p>{error}</p>

            <button
              className="back-btn"
              onClick={() => navigate(-1)}
            >
              Go Back
            </button>
          </div>
        ) : driver ? (
          <>
            <div className="driver-info-card">
              <img
                className="driver-avatar"
                src={
                  driver.photo ||
                  driver.photoURL ||
                  "https://via.placeholder.com/96"
                }
                alt={`${driver.name || "Driver"} profile`}
                onError={(event) => {
                  event.currentTarget.src =
                    "https://via.placeholder.com/96";
                }}
              />

              <div className="driver-name">
                {driver.name || driver.email || "Driver"}
              </div>

              <div className="driver-rating">
                <span className="star">⭐</span>

                {avgRating !== null
                  ? Number(avgRating).toFixed(1)
                  : "New"}

                {avgRating !== null && (
                  <span> / 5</span>
                )}
              </div>

              <p className="driver-review-count">
                {reviews.length}{" "}
                {reviews.length === 1 ? "review" : "reviews"}
              </p>
            </div>

            <div className="reviews-section">
              <h3>Reviews ({reviews.length})</h3>

              {reviews.length === 0 ? (
                <p className="reviews-empty">
                  No reviews yet for this driver.
                </p>
              ) : (
                reviews.map((reviewItem) => (
                  <div
                    className="review-card"
                    key={reviewItem.id}
                  >
                    <div className="review-card-top">
                      <span className="review-passenger">
                        {reviewItem.passengerName || "Passenger"}
                      </span>

                      <span
                        className="review-stars"
                        aria-label={`${reviewItem.rating} out of 5 stars`}
                      >
                        {renderStars(reviewItem.rating)}
                      </span>
                    </div>

                    {reviewItem.createdAt && (
                      <p className="review-date">
                        {formatReviewDate(reviewItem.createdAt)}
                      </p>
                    )}

                    <p className="review-text">
                      {reviewItem.review ||
                        "No written feedback provided."}
                    </p>
                  </div>
                ))
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

export default DriverProfile;
