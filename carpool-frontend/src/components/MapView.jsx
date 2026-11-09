import { MapContainer, TileLayer, Marker, Polyline } from "react-leaflet";

import "../styles/mapview.css";

function MapView({ pickupCoords, destCoords, route }) {
  if (!pickupCoords || !destCoords) return null;

  return (
    <MapContainer
      center={pickupCoords}
      zoom={6}
      className="map-view-container"
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {/* Pickup and Destination Markers */}
      <Marker position={pickupCoords} />
      <Marker position={destCoords} />

      {/* Route Visualization */}
      {route && <Polyline positions={route} color="blue" />}
    </MapContainer>
  );
}

export default MapView;