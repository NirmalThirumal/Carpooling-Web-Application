import { useState, useEffect } from "react";
import { getDistance, getRoute } from "../services/distance";
import { getSuggestions } from "../services/location";
import { useNavigate } from "react-router-dom";
import MapView from "../components/MapView";
import authenticatedFetch from "../services/authenticatedFetch";
import "../styles/addride.css";

function AddRide() {
  const [pickup, setPickup] = useState("");
  const [destination, setDestination] = useState("");
  const [seats, setSeats] = useState("");
  const [departureDate, setDepartureDate] = useState("");
  const [departureTime, setDepartureTime] = useState("");

  const [pickupSuggestions, setPickupSuggestions] = useState([]);
  const [destSuggestions, setDestSuggestions] = useState([]);

  const [pickupCoords, setPickupCoords] = useState(null);
  const [destCoords, setDestCoords] = useState(null);
  const [route, setRoute] = useState(null);

  const [distance, setDistance] = useState(null);
  const [priceDetails, setPriceDetails] = useState(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [calculationError, setCalculationError] = useState("");

  const navigate = useNavigate();

  const today = new Date().toLocaleDateString("en-CA");

  // Fetch autocomplete suggestions
  const handleLocationChange = async (value, type) => {
    if (type === "pickup") {
      setPickup(value);
      setPickupCoords(null);
      setPickupSuggestions([]);
    } else {
      setDestination(value);
      setDestCoords(null);
      setDestSuggestions([]);
    }

    // Clear previous calculation when location changes
    setDistance(null);
    setPriceDetails(null);
    setRoute(null);
    setCalculationError("");

    if (value.trim().length < 3) return;

    try {
      const results = await getSuggestions(value);

      if (type === "pickup") {
        setPickupSuggestions(results || []);
      } else {
        setDestSuggestions(results || []);
      }
    } catch (error) {
      console.error("Location suggestion error:", error);
      setCalculationError("Unable to load location suggestions.");
    }
  };

  // Automatically calculate distance, route and fare
  useEffect(() => {
    if (!pickupCoords || !destCoords) {
      setDistance(null);
      setPriceDetails(null);
      setRoute(null);
      return;
    }

    let cancelled = false;

    const calculateRideDetails = async () => {
      try {
        setLoading(true);
        setCalculationError("");
        setDistance(null);
        setPriceDetails(null);
        setRoute(null);

        // Coordinates are [latitude, longitude]
        const dist = await getDistance(pickupCoords, destCoords);

        if (cancelled) return;

        if (!Number.isFinite(dist) || dist <= 0) {
          throw new Error("Invalid distance received from the route service.");
        }

        // Fare calculation
        const RATE_PER_KM = 3;
        const SERVICE_PERCENT = 10;

        const basePrice = dist * RATE_PER_KM;
        const serviceFee = basePrice * (SERVICE_PERCENT / 100);
        const totalPrice = basePrice + serviceFee;

        setDistance(dist.toFixed(2));

        setPriceDetails({
          basePrice: basePrice.toFixed(2),
          serviceFee: serviceFee.toFixed(2),
          totalPrice: totalPrice.toFixed(2)
        });

        // Fetch route for map visualization
        const routeData = await getRoute(pickupCoords, destCoords);

        if (!cancelled) {
          setRoute(routeData);
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Distance calculation error:", error);
          setDistance(null);
          setPriceDetails(null);
          setRoute(null);
          setCalculationError(
            error.message || "Unable to calculate distance and fare."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    const delay = setTimeout(calculateRideDetails, 500);

    return () => {
      cancelled = true;
      clearTimeout(delay);
    };
  }, [pickupCoords, destCoords]);

  // Select pickup location
  const selectPickup = (item) => {
    setPickup(item.label);
    setPickupCoords([Number(item.lat), Number(item.lng)]);
    setPickupSuggestions([]);
  };

  // Select destination location
  const selectDestination = (item) => {
    setDestination(item.label);
    setDestCoords([Number(item.lat), Number(item.lng)]);
    setDestSuggestions([]);
  };

  // Create ride
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!pickup || !destination || !seats) {
      return alert("Please fill all fields");
    }

    if (!pickupCoords || !destCoords) {
      return alert("Please select pickup and destination from the suggestions.");
    }

    if (!departureDate || !departureTime) {
      return alert("Select date and time");
    }

    if (Number(seats) < 1 || Number(seats) > 8) {
      return alert("Available seats must be between 1 and 8.");
    }

    if (loading || !distance || !priceDetails) {
      return alert("Please wait for distance and price calculation.");
    }

    if (calculationError) {
      return alert(calculationError);
    }

    try {
      setSubmitting(true);

      const res = await authenticatedFetch("/api/create-ride", {
        method: "POST",
        body: JSON.stringify({
          pickup,
          destination,
          distance: Number(distance),
          seats: Number(seats),
          departureDate,
          departureTime,
          basePrice: Number(priceDetails.basePrice),
          serviceFee: Number(priceDetails.serviceFee),
          totalPrice: Number(priceDetails.totalPrice)
        })
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to create ride");
      }

      console.log("Ride created successfully:", data.rideId);

      // Continue to Step 2: Driver and Car Information
      navigate(`/ride-details/${data.rideId}`);
    } catch (error) {
      console.error("Ride creation error:", error);
      alert(error.message || "Error saving ride");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="addride-container">
      <div className="addride-header">
        <button
          className="back-btn"
          onClick={() => navigate("/home")}
        >
          ← Back
        </button>

        <h1>🚗 Offer a Ride</h1>
      </div>

      <div className="step-indicator">
        <div className="step active">
          <div className="step-circle">1</div>
          <span>Ride Details</span>
        </div>

        <div className="step-line"></div>

        <div className="step">
          <div className="step-circle">2</div>
          <span>Driver & Car Info</span>
        </div>
      </div>

      <div className="addride-body">
        <h2>Ride Details:</h2>
        <p>Fill in the route details.</p>

        <form className="addride-form" onSubmit={handleSubmit}>
          {/* Route Details */}
          <div className="form-card">
            <h3>📍 Route Details</h3>

            <div className="form-group">
              <label htmlFor="pickup">Pickup Location</label>

              <div className="autocomplete-wrapper">
                <input
                  id="pickup"
                  type="text"
                  placeholder="e.g. Chennai Central"
                  value={pickup}
                  autoComplete="off"
                  onChange={(e) =>
                    handleLocationChange(e.target.value, "pickup")
                  }
                  required
                />

                {pickupSuggestions.length > 0 && (
                  <div className="autocomplete-dropdown">
                    {pickupSuggestions.map((item, i) => (
                      <div
                        key={i}
                        className="autocomplete-item"
                        onClick={() => selectPickup(item)}
                      >
                        📍 {item.label}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="destination">Destination</label>

              <div className="autocomplete-wrapper">
                <input
                  id="destination"
                  type="text"
                  placeholder="e.g. Coimbatore"
                  value={destination}
                  autoComplete="off"
                  onChange={(e) =>
                    handleLocationChange(e.target.value, "destination")
                  }
                  required
                />

                {destSuggestions.length > 0 && (
                  <div className="autocomplete-dropdown">
                    {destSuggestions.map((item, i) => (
                      <div
                        key={i}
                        className="autocomplete-item"
                        onClick={() => selectDestination(item)}
                      >
                        📍 {item.label}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {pickupCoords && destCoords && (
              <div className="map-wrapper">
                <MapView
                  pickupCoords={pickupCoords}
                  destCoords={destCoords}
                  route={route}
                />
              </div>
            )}
          </div>

          {/* Departure Details */}
          <div className="form-card">
            <h3>🗓️ Departure</h3>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="departure-date">Date</label>

                <input
                  id="departure-date"
                  name="departureDate"
                  type="date"
                  min={today}
                  value={departureDate}
                  onChange={(e) => setDepartureDate(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="departure-time">Time</label>

                <input
                  id="departure-time"
                  name="departureTime"
                  type="time"
                  value={departureTime}
                  onChange={(e) => setDepartureTime(e.target.value)}
                  required
                />
              </div>
            </div>
          </div>

          {/* Pricing Details */}
          <div className="form-card">
            <h3>💰 Pricing</h3>

            {loading && (
              <div className="price-calculating">
                <span className="spinner"></span>
                Calculating distance and price...
              </div>
            )}

            {!loading && distance && priceDetails && (
              <div className="price-summary">
                <div className="price-row">
                  <span>📏 Distance</span>
                  <span>{distance} km</span>
                </div>

                <div className="price-row">
                  <span>💵 Base Price</span>
                  <span>₹{priceDetails.basePrice}</span>
                </div>

                <div className="price-row">
                  <span>🧾 Service Fee (10%)</span>
                  <span>₹{priceDetails.serviceFee}</span>
                </div>

                <div className="price-row total">
                  <span>Total Fare</span>
                  <span>₹{priceDetails.totalPrice}</span>
                </div>
              </div>
            )}

            {!loading && !distance && !calculationError && (
              <p className="price-placeholder">
                Select pickup and destination from the suggestions to
                calculate distance and pricing.
              </p>
            )}

            {calculationError && (
              <p className="price-placeholder" role="alert">
                {calculationError}
              </p>
            )}
          </div>

          {/* Seat Details */}
          <div className="form-card">
            <h3>💺 Seat Details</h3>

            <div className="form-group">
              <label htmlFor="seats">Available Seats</label>

              <input
                id="seats"
                type="number"
                placeholder="e.g. 3"
                min="1"
                max="8"
                value={seats}
                onChange={(e) => setSeats(e.target.value)}
                required
              />
            </div>
          </div>

          <button
            type="submit"
            className="submit-btn"
            disabled={loading || submitting || !distance || !priceDetails}
          >
            {submitting
              ? "Saving..."
              : loading
              ? "Calculating fare..."
              : "Next: Add Driver & Car Info →"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default AddRide;
