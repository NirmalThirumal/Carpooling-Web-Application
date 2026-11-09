
import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  getFirestore,
  doc,
  updateDoc
} from "firebase/firestore";

import { uploadImageToCloudinary } from "../services/cloudinary";
import app from "../firebase/config";
import "../styles/ridedetails.css";

const db = getFirestore(app);

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

function RideDetails() {
  const { rideId } = useParams();
  const navigate = useNavigate();

  const [carName, setCarName] = useState("");
  const [carImage, setCarImage] = useState(null);
  const [carImagePreview, setCarImagePreview] = useState(null);

  const [driverName, setDriverName] = useState("");
  const [driverContact, setDriverContact] = useState("");

  const [driverLicense, setDriverLicense] = useState(null);
  const [driverLicensePreview, setDriverLicensePreview] = useState(null);

  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  // ==========================================
  // CLEAN UP PREVIEW URLS
  // ==========================================

  useEffect(() => {
    return () => {
      if (carImagePreview) {
        URL.revokeObjectURL(carImagePreview);
      }
    };
  }, [carImagePreview]);

  useEffect(() => {
    return () => {
      if (driverLicensePreview) {
        URL.revokeObjectURL(driverLicensePreview);
      }
    };
  }, [driverLicensePreview]);

  // ==========================================
  // IMAGE VALIDATION
  // ==========================================

  const validateImage = (file) => {
    if (!file) return false;

    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp"
    ];

    if (!allowedTypes.includes(file.type)) {
      setError("Only JPG, PNG and WEBP images are allowed.");
      return false;
    }

    if (file.size > MAX_FILE_SIZE) {
      setError("Image size must not exceed 5 MB.");
      return false;
    }

    return true;
  };

  // ==========================================
  // CAR IMAGE SELECTION
  // ==========================================

  const handleCarImageChange = (e) => {
    const file = e.target.files?.[0];

    if (!file) return;

    if (!validateImage(file)) {
      e.target.value = "";
      return;
    }

    setError("");
    setCarImage(file);
    setCarImagePreview(URL.createObjectURL(file));
  };

  // ==========================================
  // DRIVING LICENCE SELECTION
  // ==========================================

  const handleLicenseChange = (e) => {
    const file = e.target.files?.[0];

    if (!file) return;

    if (!validateImage(file)) {
      e.target.value = "";
      return;
    }

    setError("");
    setDriverLicense(file);
    setDriverLicensePreview(URL.createObjectURL(file));
  };

  // ==========================================
  // DRIVER CONTACT VALIDATION
  // ==========================================

  const handleContactChange = (e) => {
    const value = e.target.value.replace(/\D/g, "").slice(0, 10);
    setDriverContact(value);
  };

  // ==========================================
  // SUBMIT DRIVER AND CAR INFORMATION
  // ==========================================

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!rideId) {
      setError("Ride ID is missing. Please create your ride again.");
      return;
    }

    if (!carName.trim()) {
      setError("Please enter your car name or model.");
      return;
    }

    if (!carImage) {
      setError("Please upload your car photo.");
      return;
    }

    if (!driverName.trim()) {
      setError("Please enter the driver name.");
      return;
    }

    if (!/^[6-9]\d{9}$/.test(driverContact)) {
      setError("Please enter a valid 10-digit Indian mobile number.");
      return;
    }

    if (!driverLicense) {
      setError("Please upload your driving licence photo.");
      return;
    }

    try {
      setSubmitting(true);

      // Upload car image to Cloudinary.
      const carImageUrl = await uploadImageToCloudinary(carImage);

      if (!carImageUrl) {
        throw new Error("Car image upload failed.");
      }

      // Upload driving licence image to Cloudinary.
      const driverLicenseUrl =
        await uploadImageToCloudinary(driverLicense);

      if (!driverLicenseUrl) {
        throw new Error("Driving licence upload failed.");
      }

      // Update the existing ride document in Firestore.
      await updateDoc(doc(db, "rides", rideId), {
        carName: carName.trim(),
        carImage: carImageUrl,
        driverName: driverName.trim(),
        driverContact,
        driverLicense: driverLicenseUrl,

        // Publish only after all required details are saved.
        status: "published",
        updatedAt: new Date()
      });

      setSuccess(true);
    } catch (error) {
      console.error("Ride details submission error:", error);

      setError(
        error.message || "Unable to save ride details. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  // ==========================================
  // SUCCESS SCREEN
  // ==========================================

  if (success) {
    return (
      <div className="ridedetails-container">
        <div className="ridedetails-header">
          <h1>🚗 Offer a Ride</h1>
        </div>

        <div className="success-screen">
          <div className="success-icon">🎉</div>

          <h2>Ride Posted Successfully!</h2>

          <p>
            Your ride details have been saved successfully.
            Your ride is now published.
          </p>

          <button
            type="button"
            className="submit-btn"
            onClick={() => navigate("/home")}
          >
            Go to Home
          </button>
        </div>
      </div>
    );
  }

  // ==========================================
  // MAIN PAGE
  // ==========================================

  return (
    <div className="ridedetails-container">
      {/* Navbar */}
      <div className="ridedetails-header">
        <button
          type="button"
          className="back-btn"
          onClick={() => navigate("/home")}
        >
          ← Cancel
        </button>

        <h1>🚗 Offer a Ride</h1>
      </div>

      {/* Step Indicator */}
      <div className="step-indicator">
        <div className="step done">
          <div className="step-circle">✓</div>
          <span>Ride Details</span>
        </div>

        <div className="step-line active"></div>

        <div className="step active">
          <div className="step-circle">2</div>
          <span>Driver & Car Info</span>
        </div>
      </div>

      <div className="ridedetails-body">
        <h2>Step 2: Driver & Car Info</h2>

        <p>
          Enter your car and driver details to complete your listing.
        </p>

        <form
          className="ridedetails-form"
          onSubmit={handleSubmit}
        >
          {/* Car Details */}
          <div className="form-card">
            <h3>🚙 Car Details</h3>

            <div className="form-group">
              <label htmlFor="car-name">Car Name / Model</label>

              <input
                id="car-name"
                type="text"
                placeholder="e.g. Honda City, Swift Dzire"
                value={carName}
                onChange={(e) => setCarName(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="car-image">Car Photo</label>

              <div className="file-upload-box">
                <input
                  id="car-image"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleCarImageChange}
                  required
                />

                {!carImagePreview ? (
                  <>
                    <div className="file-upload-icon">🖼️</div>
                    <p>Click to upload car photo</p>
                    <span>JPG, PNG, WEBP · Maximum 5 MB</span>
                  </>
                ) : (
                  <img
                    src={carImagePreview}
                    alt="Selected car preview"
                    className="upload-preview"
                  />
                )}
              </div>
            </div>
          </div>

          {/* Driver Details */}
          <div className="form-card">
            <h3>👤 Driver Details</h3>

            <div className="form-group">
              <label htmlFor="driver-name">Driver Name</label>

              <input
                id="driver-name"
                type="text"
                placeholder="e.g. Ravi Kumar"
                value={driverName}
                onChange={(e) => setDriverName(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="driver-contact">
                Contact Number
              </label>

              <input
                id="driver-contact"
                type="tel"
                placeholder="e.g. 9876543210"
                maxLength={10}
                value={driverContact}
                onChange={handleContactChange}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="driver-license">
                Driving Licence Photo
              </label>

              <div className="file-upload-box">
                <input
                  id="driver-license"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleLicenseChange}
                  required
                />

                {!driverLicensePreview ? (
                  <>
                    <div className="file-upload-icon">📄</div>
                    <p>Click to upload licence photo</p>
                    <span>JPG, PNG, WEBP · Maximum 5 MB</span>
                  </>
                ) : (
                  <img
                    src={driverLicensePreview}
                    alt="Selected driving licence preview"
                    className="upload-preview"
                  />
                )}
              </div>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            className="submit-btn"
            disabled={submitting}
          >
            {submitting
              ? "Uploading & Saving..."
              : "🚀 Post Ride"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default RideDetails;
