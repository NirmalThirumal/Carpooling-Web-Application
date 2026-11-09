
import { useEffect, useState } from "react";
import {
  getFirestore,
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs
} from "firebase/firestore";

import { useParams, useNavigate } from "react-router-dom";
import app from "../firebase/config";
import "../styles/driverprofile.css";

const db = getFirestore(app);

// Convert Firestore Timestamp, JavaScript Date, or date string into readable text.
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

// Keep only valid ratings between 1 and 5.
function isValidRating(rating) {
  return (
    typeof rating === "number" &&
    Number.isFinite(rating) &&
    rating >= 1 &&
    rating <= 5
  );
}

function DriverProfile() {
  const { driverId } = useParams();
  const navigate = useNavigate();

  const [driver, setDriver] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [avgRating, setAvgRating] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // ==========================================
  // FETCH DRIVER PROFILE AND REVIEWS
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

        // Fetch driver profile.
        const userRef = doc(db, "users", driverId);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
          if (active) {
            setDriver(null);
            setError("Driver profile not found.");
          }
          return;
        }

        const driverData = {
          id: userSnap.id,
          ...userSnap.data()
        };

        // Fetch reviews submitted for this driver.
        const reviewsQuery = query(
          collection(db, "reviews"),
          where("driverId", "==", driverId)
        );

        const reviewsSnapshot = await getDocs(reviewsQuery);

        const reviewsData = reviewsSnapshot.docs
          .map((reviewDoc) => ({
            id: reviewDoc.id,
            ...reviewDoc.data()
          }))
          .filter((review) => isValidRating(review.rating))
          .sort((a, b) => {
            const dateA =
              a.createdAt?.toMillis?.() ||
              new Date(a.createdAt || 0).getTime() ||
              0;

            const dateB =
              b.createdAt?.toMillis?.() ||
              new Date(b.createdAt || 0).getTime() ||
              0;

            return dateB - dateA;
          });

        const totalRating = reviewsData.reduce(
          (sum, review) => sum + review.rating,
          0
        );

        const average =
          reviewsData.length > 0
            ? Number((totalRating / reviewsData.length).toFixed(1))
            : null;

        if (active) {
          setDriver(driverData);
          setReviews(reviewsData);
          setAvgRating(average);
        }
      } catch (err) {
        console.error("Driver profile fetch error:", err);

        if (active) {
          setError(
            err.code === "permission-denied"
              ? "Permission denied while loading driver reviews. Please check your Firestore read rules."
              : "Unable to load the driver profile. Please try again."
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
  // RATING DISPLAY HELPERS
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
            {/* Driver Information */}
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
                {avgRating !== null ? avgRating.toFixed(1) : "New"}

                {avgRating !== null && (
                  <span>
                    {" "} / 5
                  </span>
                )}
              </div>

              <p className="driver-review-count">
                {reviews.length}{" "}
                {reviews.length === 1 ? "review" : "reviews"}
              </p>
            </div>

            {/* Driver Reviews */}
            <div className="reviews-section">
              <h3>
                Reviews ({reviews.length})
              </h3>

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
                      {reviewItem.review || "No written feedback provided."}
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
