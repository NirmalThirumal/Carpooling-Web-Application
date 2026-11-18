import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { useNavigate } from "react-router-dom";

import auth from "../firebase/auth";
import authenticatedFetch from "../services/authenticatedFetch";
import "../styles/rides.css";

const statusOptions = [
  { value: "all", label: "All Rides" },
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
  { value: "fully_booked", label: "Fully Booked" },
  { value: "completed", label: "Completed" }
];

function Rides() {
  const [rides, setRides] = useState([]);
  const [activeFilter, setActiveFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const navigate = useNavigate();

  // ==========================================
  // FETCH USER RIDES
  // ==========================================

  useEffect(() => {
    let active = true;

    const fetchRides = (user) => {
      if (!user) {
        setRides([]);
        setLoading(false);
        setError("Please log in to view your rides.");
        return;
      }

      const loadRides = async () => {
        try {
          setLoading(true);
          setError("");

          // Fetch rides belonging to the logged-in user from MongoDB.
          const response = await authenticatedFetch("/api/my-rides");

          const data = await response.json();

          if (!response.ok || !data.success) {
            throw new Error(
              data.error || "Unable to load your rides."
            );
          }

          if (!active) return;

          const rideData = (data.rides || []).map((ride) => ({
            ...ride,
            id: ride.id || ride._id,
            status: ride.status || "draft",
          }));

          setRides(rideData);
        } catch (err) {
          console.error("Error fetching rides:", err);

          if (active) {
            setError(
              "Unable to load your rides. Please try again."
            );
          }
        } finally {
          if (active) {
            setLoading(false);
          }
        }
      };

      loadRides();
    };

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      fetchRides(user);
    });

    return () => {
      active = false;
      unsubscribeAuth();
    };
  }, []);


  // ==========================================
  // RIDE STATISTICS
  // ==========================================

  const counts = useMemo(() => ({
    all: rides.length,
    draft: rides.filter((ride) => ride.status === "draft").length,
    published: rides.filter((ride) => ride.status === "published").length,
    fully_booked: rides.filter(
      (ride) => ride.status === "fully_booked"
    ).length,
    completed: rides.filter(
      (ride) => ride.status === "completed"
    ).length
  }), [rides]);

  // ==========================================
  // FILTER RIDES
  // ==========================================

  const filteredRides = useMemo(() => {
    if (activeFilter === "all") return rides;

    return rides.filter((ride) => ride.status === activeFilter);
  }, [rides, activeFilter]);

  // ==========================================
  // RIDE STATUS LABEL
  // ==========================================

  const getStatusLabel = (status) => {
    const labels = {
      draft: "Draft",
      published: "Published",
      fully_booked: "Fully Booked",
      completed: "Completed"
    };

    return labels[status] || "Draft";
  };

  // ==========================================
  // HANDLE RIDE ACTION
  // ==========================================

  const handleRideAction = (ride) => {
    if (ride.status === "draft") {
      // Continue entering driver and car details.
      navigate(`/ride-details/${ride.id}`);
    } else {
      // Open ride details.
      navigate(`/ride/${ride.id}`);
    }
  };

  // ==========================================
  // MAIN PAGE
  // ==========================================

  return (
    <div className="rides-page">
      {/* Header */}
      <header className="rides-header">
        <h1>🚗 Your Rides</h1>

        <button
          className="rides-btn rides-btn-ghost"
          onClick={() => navigate("/home")}
        >
          ← Back to Home
        </button>
      </header>

      {/* Page Introduction */}
      <section className="rides-hero">
        <h2>Manage Your Rides</h2>
        <p>View and manage all the rides you have created.</p>
      </section>

      {/* Ride Statistics */}
      <section className="rides-stats">
        <div className="rides-stat-card">
          <div className="stat-icon">🚘</div>
          <div>
            <h3>{counts.all}</h3>
            <p>Total Rides</p>
          </div>
        </div>

        <div className="rides-stat-card">
          <div className="stat-icon">📝</div>
          <div>
            <h3>{counts.draft}</h3>
            <p>Draft Rides</p>
          </div>
        </div>

        <div className="rides-stat-card">
          <div className="stat-icon">🟢</div>
          <div>
            <h3>{counts.published}</h3>
            <p>Published</p>
          </div>
        </div>

        <div className="rides-stat-card">
          <div className="stat-icon">🎫</div>
          <div>
            <h3>{counts.fully_booked}</h3>
            <p>Fully Booked</p>
          </div>
        </div>

        <div className="rides-stat-card">
          <div className="stat-icon">🏁</div>
          <div>
            <h3>{counts.completed}</h3>
            <p>Completed</p>
          </div>
        </div>
      </section>

      {/* Filter Section */}
      <section className="rides-filter-section">
        <div className="rides-section-heading">
          <div>
            <h2>My Ride Listings</h2>
            <p>Track the status of your rides.</p>
          </div>

          <button
            className="rides-btn rides-btn-primary"
            onClick={() => navigate("/add-ride")}
          >
            + Offer a Ride
          </button>
        </div>

        <div className="rides-filter-tabs">
          {statusOptions.map((option) => (
            <button
              key={option.value}
              className={`rides-filter-tab ${
                activeFilter === option.value ? "active" : ""
              }`}
              onClick={() => setActiveFilter(option.value)}
            >
              {option.label}
              <span>{counts[option.value]}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Rides Grid */}
      <section className="my-rides-grid">
        {loading ? (
          <div className="rides-message">
            <p>Loading your rides...</p>
          </div>
        ) : error ? (
          <div className="rides-message rides-error">
            <p>{error}</p>
          </div>
        ) : filteredRides.length === 0 ? (
          <div className="rides-message">
            <div className="empty-icon">🚗</div>
            <h3>No rides found</h3>

            <p>
              {activeFilter === "all"
                ? "You haven't created any rides yet."
                : `You don't have any ${getStatusLabel(activeFilter).toLowerCase()} rides.`}
            </p>

            <button
              className="rides-btn rides-btn-primary"
              onClick={() => navigate("/add-ride")}
            >
              Offer Your First Ride
            </button>
          </div>
        ) : (
          filteredRides.map((ride) => (
            <article className="my-ride-card" key={ride.id}>
              <div className="my-ride-image-wrapper">
                <img
                  src={
                    ride.carImage ||
                    "https://via.placeholder.com/400x200?text=Car+Image"
                  }
                  alt={ride.carName || "Ride vehicle"}
                />

                <span className={`ride-status status-${ride.status}`}>
                  {getStatusLabel(ride.status)}
                </span>
              </div>

              {ride.carName && (
                <div className="my-ride-car-name">
                  🚙 {ride.carName}
                </div>
              )}

              <div className="my-ride-body">
                <div className="my-ride-route">
                  <p>{ride.pickup}</p>
                  <span>↓</span>
                  <p>{ride.destination}</p>
                </div>

                <div className="my-ride-meta">
                  <p>💺 {ride.seats ?? 0} seats</p>
                  <p>📏 {ride.distance ?? 0} km</p>
                  <p>
                    🗓️ {ride.departureDate || "Date not set"}
                  </p>
                  <p>
                    🕐 {ride.departureTime || "Time not set"}
                  </p>
                </div>

                <div className="my-ride-price">
                  <span>Total Fare</span>
                  <strong>
                    ₹{Number(ride.totalPrice || 0).toFixed(2)}
                  </strong>
                </div>

                {ride.status === "draft" && (
                  <p className="draft-notice">
                    Complete your driver and car details to publish this ride.
                  </p>
                )}

                <button
                  className="rides-btn rides-card-action"
                  onClick={() => handleRideAction(ride)}
                >
                  {ride.status === "draft"
                    ? "Continue Setup →"
                    : "View Ride →"}
                </button>
              </div>
            </article>
          ))
        )}
      </section>
    </div>
  );
}

export default Rides;
