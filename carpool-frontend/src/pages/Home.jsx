import { useContext, useEffect, useState } from "react";
import { AuthContext } from "../context/AuthContext";

import {
  getFirestore,
  collection,
  getDocs,
  query,
  where
} from "firebase/firestore";

import { useNavigate } from "react-router-dom";
import app from "../firebase/config";
import { logout } from "../firebase/auth";
import NotificationBell from "../components/NotificationBell";

import "../styles/home.css";

const db = getFirestore(app);

function Home() {
  const { user } = useContext(AuthContext);

  const isAdmin =
    user?.email?.toLowerCase() === "niruspam1@gmail.com";

  const [rides, setRides] = useState([]);
  const [ratingsMap, setRatingsMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");

  const [pickupQuery, setPickupQuery] = useState("");
  const [destinationQuery, setDestinationQuery] = useState("");
  const [dateQuery, setDateQuery] = useState("");
  const [passengerQuery, setPassengerQuery] = useState("");

  const navigate = useNavigate();
  // FETCH PUBLISHED RIDES AND DRIVER RATINGS
  useEffect(() => {
    let isMounted = true;

    const fetchRidesAndRatings = async () => {

      // Wait for authenticated user.
      if (!user?.uid) {
        setRides([]);
        setRatingsMap({});
        setLoading(false);
        return;
      }

      setLoading(true);
      setFetchError("");

      try {
        // 1. FETCH PUBLISHED RIDES
        const publishedRidesQuery = query(
          collection(db, "rides"),
          where("status", "==", "published")
        );

        const snapshot = await getDocs(publishedRidesQuery);

        if (!isMounted) return;

        const ridesData = snapshot.docs.map((document) => ({
          id: document.id,
          ...document.data()
        }));

        // Display rides immediately.
        // Do not wait for driver ratings.
        setRides(ridesData);
        setLoading(false);
        // 2. GET UNIQUE DRIVER IDS
        const uniqueDriverIds = [
          ...new Set(
            ridesData
              .map((ride) => ride.userId)
              .filter(Boolean)
          )
        ];
        // 3. FETCH DRIVER RATINGS
        const ratingResults = await Promise.allSettled(
          uniqueDriverIds.map(async (driverId) => {

            const reviewsQuery = query(
              collection(db, "reviews"),
              where("driverId", "==", driverId)
            );

            const reviewsSnapshot = await getDocs(reviewsQuery);

            let total = 0;
            let validRatings = 0;

            reviewsSnapshot.docs.forEach((reviewDoc) => {

              const rating = Number(reviewDoc.data().rating);

              if (
                Number.isFinite(rating) &&
                rating >= 1 &&
                rating <= 5
              ) {
                total += rating;
                validRatings++;
              }

            });

            return {
              driverId,

              rating:
                validRatings > 0
                  ? Number((total / validRatings).toFixed(1))
                  : null,

              count: validRatings
            };

          })
        );

        if (!isMounted) return;
        // 4. STORE DRIVER RATINGS
        const ratings = {};

        ratingResults.forEach((result) => {

          if (result.status === "fulfilled") {

            const item = result.value;

            ratings[item.driverId] = {
              rating: item.rating,
              count: item.count
            };

          } else {

            console.error(
              "Error fetching a driver's ratings:",
              result.reason
            );

          }

        });

        setRatingsMap(ratings);

      } catch (error) {

        console.error(
          "Error fetching published rides:",
          error
        );

        if (isMounted) {
          setFetchError(
            "Unable to load rides. Please try again."
          );

          setLoading(false);
        }

      }

    };

    fetchRidesAndRatings();

    return () => {
      isMounted = false;
    };

  }, [user?.uid]);
  // FILTER PUBLISHED AND AVAILABLE RIDES
  // Get today's date using Indian Standard Time.
  const todayInIndia = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());

  const filteredRides = rides.filter((ride) => {

    // 1. Hide rides scheduled before today.
    const isFutureOrToday =
      ride.departureDate && ride.departureDate >= todayInIndia;

    // 2. Only show published rides.
    const isPublished = ride.status === "published";

    // 3. Hide rides with no remaining seats.
    const hasAvailableSeats = Number(ride.seats) > 0;

    // 4. Pickup filter.
    const pickupMatch = pickupQuery
      ? ride.pickup?.toLowerCase().includes(pickupQuery.toLowerCase())
      : true;

    // 5. Destination filter.
    const destinationMatch = destinationQuery
      ? ride.destination?.toLowerCase().includes(destinationQuery.toLowerCase())
      : true;

    // 6. Date filter.
    const dateMatch = dateQuery
      ? ride.departureDate === dateQuery
      : true;

    // 7. Passenger filter.
    const passengerMatch = passengerQuery
      ? Number(ride.seats) >= Number(passengerQuery)
      : true;

    return (
      isFutureOrToday &&
      isPublished &&
      hasAvailableSeats &&
      pickupMatch &&
      destinationMatch &&
      dateMatch &&
      passengerMatch
    );

  });
  // RESET SEARCH FILTERS
  const clearSearch = () => {

    setPickupQuery("");
    setDestinationQuery("");
    setDateQuery("");
    setPassengerQuery("");

  };
  // HOME PAGE
  return (

    <div className="home-container">

      {/* Navbar */}

      <div className="home-header">

        <h1>🚗 Carpool App</h1>

        <div className="header-right">

          <span className="header-user">
            {user?.displayName || user?.email}
          </span>

          <NotificationBell />

          <button
            className="home-btn primary"
            onClick={() => navigate("/add-ride")}
          >
            + Offer a Ride
          </button>

          <button
            className="home-btn ghost"
            onClick={() => navigate("/your-rides")}
          >
            Your Rides
          </button>

          <button
            className="home-btn primary"
            onClick={() => navigate("/your-bookings")}
          >
            Your Bookings
          </button>

          {/* Admin Button */}

          {isAdmin && (

            <button
              className="home-btn primary"
              onClick={() => navigate("/admin")}
            >
              Admin
            </button>

          )}

          <button
            className="home-btn ghost"
            onClick={logout}
          >
            Logout
          </button>

        </div>

      </div>

      {/* Hero */}

      <div className="home-hero">

        <h2>Find Available Rides 🚀</h2>

        <p>
          Search by pickup, destination, date & passengers
        </p>

      </div>

      {/* Advanced Search */}

      <div className="advanced-search-wrapper">

        <div className="advanced-search">

          <div className="search-field">

            <label htmlFor="pickup-search">
              Leaving from
            </label>

            <input
              id="pickup-search"
              type="text"
              placeholder="Enter pickup"
              value={pickupQuery}
              onChange={(e) => setPickupQuery(e.target.value)}
            />

          </div>

          <div className="search-divider"></div>

          <div className="search-field">

            <label htmlFor="destination-search">
              Going to
            </label>

            <input
              id="destination-search"
              type="text"
              placeholder="Enter destination"
              value={destinationQuery}
              onChange={(e) => setDestinationQuery(e.target.value)}
            />

          </div>

          <div className="search-divider"></div>

          <div className="search-field">

            <label htmlFor="date-search">
              Date
            </label>

            <input
              id="date-search"
              type="date"
              value={dateQuery}
              onChange={(e) => setDateQuery(e.target.value)}
            />

          </div>

          <div className="search-divider"></div>

          <div className="search-field">

            <label htmlFor="passenger-search">
              Passengers
            </label>

            <input
              id="passenger-search"
              type="number"
              min="1"
              placeholder="1"
              value={passengerQuery}
              onChange={(e) => setPassengerQuery(e.target.value)}
            />

          </div>

          <button
            type="button"
            className="search-main-btn"
            onClick={() => {}}
          >
            Search
          </button>

          <button
            type="button"
            className="home-btn ghost"
            onClick={clearSearch}
          >
            Clear
          </button>

        </div>

      </div>

      {/* Available Rides Header */}

      <div className="section-header">

        <h3>Available Rides</h3>

        <span>
          {loading
            ? "Loading..."
            : `${filteredRides.length} found`}
        </span>

      </div>

      {/* Ride Listings */}

      <div className="rides-grid">

        {loading ? (

          <div className="no-results">
            <p>Loading available rides...</p>
          </div>

        ) : fetchError ? (

          <div className="no-results">
            <p>{fetchError}</p>
          </div>

        ) : filteredRides.length === 0 ? (

          <div className="no-results">
            <p>No published rides found.</p>
          </div>

        ) : (

          filteredRides.map((ride) => (

            <div className="ride-card" key={ride.id}>

              <img
                src={
                  ride.carImage ||
                  "https://via.placeholder.com/300x165?text=No+Image"
                }
                alt={ride.carName || "Car"}
                loading="lazy"
              />

              {ride.carName && (

                <div className="ride-car-name">
                  {ride.carName}
                </div>

              )}

              <div className="ride-card-body">

                <div className="ride-card-route">

                  {ride.pickup}

                  <span className="arrow">
                    {" → "}
                  </span>

                  {ride.destination}

                </div>

                <div className="ride-card-meta">

                  <p>Seats: {ride.seats}</p>

                  <p>
                    Distance: {ride.distance} km
                  </p>

                  <p>
                    Date: {ride.departureDate}
                    &nbsp; Time: {ride.departureTime}
                  </p>

                </div>

                {/* Driver Rating */}

                <div className="driver-rating-summary">

                  {ratingsMap[ride.userId]?.rating !== null &&
                  ratingsMap[ride.userId]?.rating !== undefined ? (

                    <>

                      <span>
                        Rating: ⭐{" "}
                        {ratingsMap[ride.userId].rating.toFixed(1)} / 5
                      </span>

                      <span>
                        {" "}({ratingsMap[ride.userId].count}{" "}

                        {ratingsMap[ride.userId].count === 1
                          ? "review"
                          : "reviews"}

                        )
                      </span>

                    </>

                  ) : (

                    <span>
                      Rating: ⭐ New driver · No reviews yet
                    </span>

                  )}

                </div>

                {/* Total Fare */}

                <div className="ride-card-price">

                  <span className="price-label">
                    Total fare
                  </span>

                  <span className="price-value">
                    ₹{Number(ride.totalPrice).toFixed(2)}
                  </span>

                </div>

                {/* View Driver */}

                <button
                  className="home-btn ghost ride-action-btn view-driver-btn"
                  onClick={() => navigate(`/driver/${ride.userId}`)}
                >
                  View Driver
                </button>

                {/* View Ride */}

                <button
                  className="home-btn primary ride-action-btn view-ride-btn"
                  onClick={() => navigate(`/ride/${ride.id}`)}
                >
                  View Ride
                </button>

              </div>

            </div>

          ))

        )}

      </div>

    </div>

  );

}

export default Home;
