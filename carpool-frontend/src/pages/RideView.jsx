
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
import "../styles/rideview.css";

const db = getFirestore(app);

function RideView() {
  const { rideId } = useParams();
  const navigate = useNavigate();

  const [ride, setRide] = useState(null);
  const [driver, setDriver] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [avgRating, setAvgRating] = useState(null);

  // Fetch Ride, Driver, and Reviews
  useEffect(() => {
    const fetchData = async () => {
      try {
        const rideRef = doc(db, "rides", rideId);
        const rideSnap = await getDoc(rideRef);

        if (!rideSnap.exists()) return;

        const rideData = rideSnap.data();
        setRide(rideData);

        // Fetch Driver Details
        const userRef = doc(db, "users", rideData.userId);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
          setDriver(userSnap.data());
        }

        // Fetch Driver Reviews
        const q = query(
          collection(db, "reviews"),
          where("driverId", "==", rideData.userId)
        );

        const snap = await getDocs(q);
        const data = snap.docs.map((doc) => doc.data());

        setReviews(data);

        // Calculate Average Rating
        if (data.length > 0) {
          const total = data.reduce((sum, review) => sum + review.rating, 0);
          setAvgRating((total / data.length).toFixed(1));
        }
      } catch (err) {
        console.error(err);
      }
    };

    fetchData();
  }, [rideId]);

  // Render Rating Stars
  const renderStars = (rating) =>
    "★".repeat(rating) + "☆".repeat(5 - rating);

  // Loading State
  if (!ride) {
    return (
      <div className="rideview-container">
        <div className="rideview-header">
          <h1>🚗 Ride Details</h1>
        </div>

        <p className="rideview-loading">Loading...</p>
      </div>
    );
  }

  return (
    <div className="rideview-container">
      {/* Header */}
      <div className="rideview-header">
        <h1>🚗 Ride Details</h1>
        <button className="back-btn" onClick={() => navigate(-1)}>
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
              alt="car"
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
              <span className="arrow">→</span>
              {ride.destination}
            </div>

            <div className="rideview-meta">
              <p>💺 Seats Available: {ride.seats}</p>
              <p>📏 Distance: {ride.distance} km</p>
              <p>🗓️ Departure Date: {ride.departureDate}</p>
              <p>🕐 Departure Time: {ride.departureTime}</p>
            </div>
          </div>

          {/* Driver Reviews */}
          <div className="rideview-reviews-card">
            <h3>Reviews ({reviews.length})</h3>

            {reviews.length === 0 ? (
              <p className="reviews-empty">
                No reviews yet for this driver
              </p>
            ) : (
              reviews.slice(0, 3).map((review, index) => (
                <div className="review-card" key={index}>
                  <div className="review-card-top">
                    <span className="review-passenger">
                      {review.passengerName}
                    </span>

                    <span className="review-stars">
                      {renderStars(review.rating)}
                    </span>
                  </div>

                  <p className="review-text">{review.review}</p>
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
              <span>₹{ride.basePrice}</span>
            </div>

            <div className="price-row">
              <span>Service Fee</span>
              <span>₹{ride.serviceFee}</span>
            </div>

            <div className="price-row total">
              <span>Total</span>
              <span>₹{ride.totalPrice}</span>
            </div>
          </div>

          {/* Book Ride Button */}
          <button
            className={`book-btn ${
              ride.seats === 0 ? "disabled-btn" : ""
            }`}
            onClick={() => navigate(`/book-ride/${rideId}`)}
            disabled={ride.seats === 0}
          >
            {ride.seats === 0
              ? "❌ Fully Booked"
              : "🎟️ Book This Ride"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default RideView;
