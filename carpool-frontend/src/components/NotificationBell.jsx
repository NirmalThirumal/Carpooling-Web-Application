
import { useContext, useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getFirestore,
  onSnapshot,
  query,
  updateDoc,
  where
} from "firebase/firestore";

import { useNavigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import app from "../firebase/config";
import "../styles/notification.css";

const db = getFirestore(app);

function NotificationBell() {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();

  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState("");

  // ==========================================
  // REAL-TIME NOTIFICATION LISTENER
  // ==========================================

  useEffect(() => {
    if (!user?.uid) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    const notificationsQuery = query(
      collection(db, "notifications"),
      where("recipientId", "==", user.uid)
    );

    const unsubscribe = onSnapshot(
      notificationsQuery,
      (snapshot) => {
        const notificationData = snapshot.docs.map(
          (notificationDoc) => ({
            id: notificationDoc.id,
            ...notificationDoc.data()
          })
        );

        // Sort newest notifications first.
        notificationData.sort((a, b) => {
          const dateA = a.createdAt?.toMillis
            ? a.createdAt.toMillis()
            : new Date(a.createdAt || 0).getTime();

          const dateB = b.createdAt?.toMillis
            ? b.createdAt.toMillis()
            : new Date(b.createdAt || 0).getTime();

          return dateB - dateA;
        });

        setNotifications(notificationData);
        setLoading(false);
        setError("");
      },
      (err) => {
        console.error("Notification listener error:", err);
        setError("Unable to load notifications.");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user?.uid]);

  // ==========================================
  // UNREAD NOTIFICATION COUNT
  // ==========================================

  const unreadCount = useMemo(
    () =>
      notifications.filter(
        (notification) => notification.read !== true
      ).length,
    [notifications]
  );

  // ==========================================
  // NOTIFICATION DETAILS
  // ==========================================

  const getNotificationDetails = (notification) => {
    const details = {
      booking_request: {
        icon: "📩",
        title: "New Booking Request",
        description: "You have received a new ride booking request.",
        destination: "/driver-bookings"
      },

      booking_accepted: {
        icon: "✅",
        title: "Booking Accepted",
        description: "Your booking request has been accepted.",
        destination: "/your-bookings"
      },

      booking_rejected: {
        icon: "❌",
        title: "Booking Rejected",
        description: "Your booking request was rejected.",
        destination: "/your-bookings"
      },

      booking_cancelled: {
        icon: "🚫",
        title: "Booking Cancelled",
        description: "A passenger has cancelled their booking.",
        destination: "/driver-bookings"
      },

      ride_cancelled: {
        icon: "🚗",
        title: "Ride Cancelled",
        description: "The driver has cancelled the ride.",
        destination: "/your-bookings"
      },

      ride_completed: {
        icon: "🏁",
        title: "Ride Completed",
        description: "Your ride has been completed.",
        destination: "/your-bookings"
      }
    };

    return (
      details[notification.type] || {
        icon: "🔔",
        title: notification.title || "Notification",
        description:
          notification.message || "You have a new notification.",
        destination: notification.bookingId
          ? "/your-bookings"
          : notification.rideId
            ? `/ride/${notification.rideId}`
            : "/home"
      }
    );
  };

  // ==========================================
  // FORMAT NOTIFICATION DATE
  // ==========================================

  const formatNotificationDate = (timestamp) => {
    if (!timestamp) return "";

    const date = timestamp?.toDate
      ? timestamp.toDate()
      : new Date(timestamp);

    if (Number.isNaN(date.getTime())) return "";

    return date.toLocaleString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  // ==========================================
  // MARK SINGLE NOTIFICATION AS READ
  // ==========================================

  const markAsRead = async (notificationId) => {
    try {
      const notification = notifications.find(
        (item) => item.id === notificationId
      );

      if (!notification || notification.read === true) return;

      await updateDoc(
        doc(db, "notifications", notificationId),
        { read: true }
      );
    } catch (err) {
      console.error("Mark notification as read error:", err);
      setError("Unable to mark notification as read.");
    }
  };

  // ==========================================
  // MARK ALL NOTIFICATIONS AS READ
  // ==========================================

  const markAllAsRead = async () => {
    const unreadNotifications = notifications.filter(
      (notification) => notification.read !== true
    );

    if (unreadNotifications.length === 0 || updating) return;

    try {
      setUpdating(true);
      setError("");

      await Promise.all(
        unreadNotifications.map((notification) =>
          updateDoc(
            doc(db, "notifications", notification.id),
            { read: true }
          )
        )
      );
    } catch (err) {
      console.error("Mark all notifications as read error:", err);
      setError("Some notifications could not be marked as read.");
    } finally {
      setUpdating(false);
    }
  };

  // ==========================================
  // HANDLE NOTIFICATION CLICK
  // ==========================================

  const handleNotificationClick = async (notification) => {
    const details = getNotificationDetails(notification);

    setOpen(false);

    await markAsRead(notification.id);

    // Booking-related navigation.
    if (notification.bookingId) {
      if (
        notification.type === "booking_request" ||
        notification.type === "booking_cancelled"
      ) {
        navigate("/driver-bookings");
        return;
      }

      navigate("/your-bookings");
      return;
    }

    // Ride-related navigation.
    if (notification.rideId) {
      navigate(`/ride/${notification.rideId}`);
      return;
    }

    navigate(details.destination);
  };

  // ==========================================
  // NOTIFICATION BELL UI
  // ==========================================

  return (
    <div className="notification-wrapper">
      {/* Bell Button */}
      <button
        type="button"
        className={`notification-bell ${open ? "active" : ""}`}
        aria-label={`Notifications, ${unreadCount} unread`}
        aria-expanded={open}
        onClick={() => setOpen((previous) => !previous)}
      >
        <span className="notification-bell-icon">🔔</span>

        {unreadCount > 0 && (
          <span className="notification-count">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Click outside to close */}
          <div
            className="notification-backdrop"
            onClick={() => setOpen(false)}
          />

          {/* Notification Dropdown */}
          <div className="notification-dropdown">
            {/* Header */}
            <div className="notification-header">
              <div>
                <h3>Notifications</h3>

                <p>
                  {unreadCount > 0
                    ? `${unreadCount} unread notification${
                        unreadCount === 1 ? "" : "s"
                      }`
                    : "You're all caught up"}
                </p>
              </div>

              <button
                type="button"
                className="notification-close"
                onClick={() => setOpen(false)}
                aria-label="Close notifications"
              >
                ×
              </button>
            </div>

            {/* Mark All as Read */}
            {unreadCount > 0 && (
              <button
                type="button"
                className="mark-all-read"
                onClick={markAllAsRead}
                disabled={updating}
              >
                {updating ? "Updating..." : "Mark all as read"}
              </button>
            )}

            {/* Error Message */}
            {error && (
              <p className="notification-error" role="alert">
                {error}
              </p>
            )}

            {/* Notification History */}
            <div className="notification-list">
              {loading ? (
                <div className="notification-empty">
                  Loading notifications...
                </div>
              ) : notifications.length === 0 ? (
                <div className="notification-empty">
                  <span>🔔</span>
                  <h4>No notifications yet</h4>
                  <p>Your booking updates will appear here.</p>
                </div>
              ) : (
                notifications.map((notification) => {
                  const details =
                    getNotificationDetails(notification);

                  const isUnread = notification.read !== true;

                  return (
                    <button
                      type="button"
                      key={notification.id}
                      className={`notification-item ${
                        isUnread ? "unread" : "read"
                      }`}
                      onClick={() =>
                        handleNotificationClick(notification)
                      }
                    >
                      <span className="notification-item-icon">
                        {details.icon}
                      </span>

                      <span className="notification-item-content">
                        <span className="notification-item-title">
                          {notification.title || details.title}
                        </span>

                        <span className="notification-item-message">
                          {notification.message || details.description}
                        </span>

                        <span className="notification-item-date">
                          {formatNotificationDate(
                            notification.createdAt
                          )}
                        </span>
                      </span>

                      {isUnread && (
                        <span className="notification-unread-dot" />
                      )}
                    </button>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="notification-footer">
              <span>
                {notifications.length} notification
                {notifications.length === 1 ? "" : "s"} in history
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default NotificationBell;
