import axios from "axios";

// ========================================
// Cloudinary Configuration
// ========================================

const CLOUDINARY_CLOUD_NAME = "drpuweldw";
const CLOUDINARY_UPLOAD_PRESET = "carpool_upload";

// ========================================
// Image Upload
// ========================================

export const uploadImageToCloudinary = async (file) => {
  // Validate selected file.
  if (!file) {
    throw new Error("Please select an image to upload.");
  }

  // Validate image file type.
  if (!file.type.startsWith("image/")) {
    throw new Error("Only image files are allowed.");
  }

  // Prepare upload form data.
  const formData = new FormData();

  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);

  try {
    const response = await axios.post(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
      formData
    );

    // Validate Cloudinary response.
    if (!response.data?.secure_url) {
      throw new Error("Cloudinary did not return an image URL.");
    }

    return response.data.secure_url;
  } catch (error) {
    console.error(
      "Cloudinary upload error:",
      error.response?.data || error.message
    );

    throw new Error(
      error.response?.data?.error?.message ||
        "Image upload failed. Please try again."
    );
  }
};