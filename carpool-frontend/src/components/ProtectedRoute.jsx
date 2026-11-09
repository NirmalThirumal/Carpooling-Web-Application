import { useContext } from "react";
import { Navigate } from "react-router-dom";

import { AuthContext } from "../context/AuthContext";
import "../styles/protectedroute.css";

function ProtectedRoute({ children }) {
  const { user, loading } = useContext(AuthContext);

  if (loading) {
    return (
      <div className="protected-route-loading">
        Checking authentication...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/signup" replace />;
  }

  return children;
}

export default ProtectedRoute;