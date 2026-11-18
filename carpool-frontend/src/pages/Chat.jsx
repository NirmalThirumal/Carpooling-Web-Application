
import { useEffect, useState, useContext, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";

import { AuthContext } from "../context/AuthContext";
import authenticatedFetch from "../services/authenticatedFetch";

import "../styles/chat.css";

function Chat() {
  const { bookingId } = useParams();
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();

  const [chatId, setChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const bottomRef = useRef(null);

  // ==========================================
  // VERIFY BOOKING AND INITIALIZE CHAT
  // ==========================================

  useEffect(() => {
    if (!bookingId || !user) {
      setLoading(false);
      return;
    }

    let active = true;

    const initializeChat = async () => {
      try {
        setLoading(true);
        setError("");

        // Retrieve booking details from MongoDB.
        const response = await authenticatedFetch(
          `/api/bookings/${bookingId}`,
          { method: "GET" }
        );

        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(
            data.error || "Unable to retrieve booking."
          );
        }

        const booking = data.booking;

        if (!booking) {
          throw new Error("Booking not found.");
        }

        const isDriver = booking.driverId === user.uid;
        const isPassenger = booking.userId === user.uid;

        if (!isDriver && !isPassenger) {
          throw new Error(
            "You are not authorized to access this chat."
          );
        }

        if (booking.status !== "accepted") {
          throw new Error(
            "Chat is available only for accepted bookings."
          );
        }

        if (active) {
          setChatId(bookingId);
        }
      } catch (err) {
        console.error("Chat initialization error:", err);

        if (active) {
          setError(
            err.message || "Unable to initialize chat."
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    initializeChat();

    return () => {
      active = false;
    };
  }, [bookingId, user]);

  // ==========================================
  // FETCH MESSAGES FROM MONGODB
  // ==========================================

  useEffect(() => {
    if (!chatId || !user) return;

    let active = true;
    let isFetching = false;

    const fetchMessages = async () => {
      if (isFetching) return;

      try {
        isFetching = true;

        const response = await authenticatedFetch(
          `/api/chats/${chatId}/messages`,
          { method: "GET" }
        );

        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(
            data.error || "Unable to load messages."
          );
        }

        if (active) {
          setMessages(data.messages || []);
          setError("");
        }
      } catch (err) {
        console.error("Fetch messages error:", err);

        if (active) {
          setError(
            "Unable to load messages. Please try again."
          );
        }
      } finally {
        isFetching = false;
      }
    };

    // Fetch immediately when the chat opens.
    fetchMessages();

    // Refresh messages every 3 seconds.
    const intervalId = window.setInterval(
      fetchMessages,
      3000
    );

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [chatId, user]);

  // ==========================================
  // SCROLL TO LATEST MESSAGE
  // ==========================================

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: "smooth"
    });
  }, [messages]);

  // ==========================================
  // SEND MESSAGE TO MONGODB
  // ==========================================

  const sendMessage = async () => {
    const messageText = text.trim();

    if (!messageText || !chatId || !user || sending) {
      return;
    }

    try {
      setSending(true);
      setError("");

      const response = await authenticatedFetch(
        `/api/chats/${chatId}/messages`,
        {
          method: "POST",
          body: JSON.stringify({
            text: messageText
          })
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.error || "Unable to send message."
        );
      }

      setText("");

      // Refresh immediately to display the saved message.
      const messagesResponse = await authenticatedFetch(
        `/api/chats/${chatId}/messages`,
        { method: "GET" }
      );

      const messagesData = await messagesResponse.json();

      if (!messagesResponse.ok || !messagesData.success) {
        throw new Error(
          messagesData.error || "Unable to refresh messages."
        );
      }

      setMessages(messagesData.messages || []);
    } catch (err) {
      console.error("Message sending error:", err);

      setError(
        err.message || "Unable to send your message. Please try again."
      );
    } finally {
      setSending(false);
    }
  };

  // ==========================================
  // SEND ON ENTER
  // ==========================================

  const handleKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  };

  // ==========================================
  // LOADING SCREEN
  // ==========================================

  if (loading) {
    return (
      <div className="chat-loading">
        <p>Loading chat...</p>
      </div>
    );
  }

  // ==========================================
  // ERROR SCREEN
  // ==========================================

  if (error && !chatId) {
    return (
      <div className="chat-loading">
        <div className="chat-error-box">
          <h3>Unable to open chat</h3>
          <p>{error}</p>

          <button
            className="back-btn error-back"
            onClick={() => navigate(-1)}
          >
            ← Go Back
          </button>
        </div>
      </div>
    );
  }

  // ==========================================
  // CHAT INTERFACE
  // ==========================================

  return (
    <div className="chat-container">
      <div className="chat-header">
        <button
          className="back-btn"
          onClick={() => navigate(-1)}
        >
          ← Back
        </button>

        <h1>💬 Chat</h1>
      </div>

      {error && (
        <div className="chat-inline-error">
          {error}
        </div>
      )}

      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="chat-empty">
            <p>No messages yet.</p>
            <span>Start a conversation!</span>
          </div>
        ) : (
          messages.map((msg) => {
            const isMine = msg.senderId === user.uid;

            const isSeen = msg.seenBy?.some(
              (uid) => uid !== msg.senderId
            );

            return (
              <div
                key={msg.id || msg._id}
                className={`message-row ${
                  isMine ? "mine" : "theirs"
                }`}
              >
                <div className="message-bubble">
                  {msg.text}

                  {isMine && (
                    <div
                      className={`message-tick ${
                        isSeen ? "seen" : ""
                      }`}
                    >
                      {isSeen ? "✔✔" : "✔"}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}

        <div ref={bottomRef} />
      </div>

      <div className="chat-input-bar">
        <input
          className="chat-input"
          value={text}
          placeholder="Type a message..."
          onChange={(event) => setText(event.target.value)}
          onKeyDown={handleKeyDown}
          disabled={sending}
        />

        <button
          className="chat-send-btn"
          onClick={sendMessage}
          disabled={sending || !text.trim()}
        >
          {sending ? "..." : "➤"}
        </button>
      </div>
    </div>
  );
}

export default Chat;
