import { useEffect, useState, useContext, useRef } from "react";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  setDoc,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  updateDoc,
  arrayUnion
} from "firebase/firestore";
import { useParams, useNavigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import app from "../firebase/config";
import "../styles/chat.css";

const db = getFirestore(app);

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

  // Initialize chat.
  useEffect(() => {
    if (!bookingId || !user) return;

    let active = true;

    const initializeChat = async () => {
      try {
        setLoading(true);
        setError("");

        // Get booking information.
        const bookingRef = doc(db, "bookings", bookingId);
        const bookingSnapshot = await getDoc(bookingRef);

        if (!bookingSnapshot.exists()) {
          throw new Error("Booking not found.");
        }

        const booking = bookingSnapshot.data();

        // Verify the logged-in user.
        const isDriver = booking.driverId === user.uid;
        const isPassenger = booking.userId === user.uid;

        if (!isDriver && !isPassenger) {
          throw new Error(
            "You are not authorized to access this chat."
          );
        }

        // Chat is available only after acceptance.
        if (booking.status !== "accepted") {
          throw new Error(
            "Chat is available only for accepted bookings."
          );
        }

        // Use booking ID as the chat document ID.
        const chatRef = doc(db, "chats", bookingId);
        const chatSnapshot = await getDoc(chatRef);

        if (!active) return;

        if (chatSnapshot.exists()) {
          // Existing deterministic chat.
          const chat = chatSnapshot.data();

          if (
            chat.driverId !== booking.driverId ||
            chat.passengerId !== booking.userId
          ) {
            throw new Error("Chat participant information is invalid.");
          }

          setChatId(bookingId);
        } else {
          // Create a new chat document.
          await setDoc(chatRef, {
            bookingId: bookingId,
            rideId: booking.rideId,
            driverId: booking.driverId,
            passengerId: booking.userId,
            createdAt: new Date()
          });

          if (!active) return;

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

  // Listen for real-time messages.
  useEffect(() => {
    if (!chatId || !user) return;

    const messagesQuery = query(
      collection(db, "chats", chatId, "messages"),
      orderBy("createdAt", "asc")
    );

    const unsubscribe = onSnapshot(
      messagesQuery,
      (snapshot) => {
        const messageData = snapshot.docs.map((messageDoc) => ({
          id: messageDoc.id,
          ...messageDoc.data()
        }));

        setMessages(messageData);

        // Mark messages from the other participant as read.
        snapshot.docs.forEach((messageDoc) => {
          const message = messageDoc.data();

          if (
            message.senderId !== user.uid &&
            !message.seenBy?.includes(user.uid)
          ) {
            updateDoc(
              doc(
                db,
                "chats",
                chatId,
                "messages",
                messageDoc.id
              ),
              {
                seenBy: arrayUnion(user.uid)
              }
            ).catch((err) => {
              console.error("Read receipt update error:", err);
            });
          }
        });
      },
      (err) => {
        console.error("Message listener error:", err);

        setError(
          "Unable to load messages. Please check your Firestore permissions."
        );
      }
    );

    return () => unsubscribe();
  }, [chatId, user]);

  // Scroll to the latest message.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: "smooth"
    });
  }, [messages]);

  // Send a message.
  const sendMessage = async () => {
    const messageText = text.trim();

    if (!messageText || !chatId || !user || sending) {
      return;
    }

    try {
      setSending(true);
      setError("");

      await addDoc(
        collection(db, "chats", chatId, "messages"),
        {
          senderId: user.uid,
          senderName: user.displayName || "User",
          senderEmail: user.email || "",
          text: messageText,
          createdAt: new Date(),
          seenBy: [user.uid]
        }
      );

      setText("");
    } catch (err) {
      console.error("Message sending error:", err);

      setError(
        "Unable to send your message. Please try again."
      );
    } finally {
      setSending(false);
    }
  };

  // Send on Enter; allow Shift + Enter for a new line.
  const handleKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  };

  // Loading screen.
  if (loading) {
    return (
      <div className="chat-loading">
        <p>Loading chat...</p>
      </div>
    );
  }

  // Error screen.
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

  // Chat interface.
  return (
    <div className="chat-container">
      {/* Header */}
      <div className="chat-header">
        <button
          className="back-btn"
          onClick={() => navigate(-1)}
        >
          ← Back
        </button>
        <h1>💬 Chat</h1>
      </div>

      {/* Inline Error */}
      {error && (
        <div className="chat-inline-error">
          {error}
        </div>
      )}

      {/* Messages */}
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
                key={msg.id}
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

      {/* Message Input */}
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
