import { Badge, Button } from "@fluentui/react-components";
import {
  ClipboardTaskListLtrRegular,
  LocationRegular,
  MapRegular,
} from "@fluentui/react-icons";
import L from "leaflet";
import { MapContainer, Marker, Polyline, Popup, useMap } from "react-leaflet";
import { useEffect } from "react";
import "leaflet/dist/leaflet.css";
import "./locations.css";

export function PageHead({ eyebrow, title, children }) {
  return (
    <section className="page-head compact">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
      </div>
      {children}
    </section>
  );
}
export function StatusBadge({ value }) {
  const color = ["Active", "Intercepted"].includes(value)
    ? "success"
    : ["Dispatched", "flagged"].includes(value)
      ? "warning"
      : value === "Acknowledged"
        ? "informative"
        : "danger";
  return (
    <Badge appearance="tint" color={color}>
      {value || "Unknown"}
    </Badge>
  );
}
export function EmptyState({ text }) {
  return (
    <div className="empty small">
      <ClipboardTaskListLtrRegular />
      <p>{text}</p>
    </div>
  );
}
export function RelativeTime({ value }) {
  if (!value) return <span>-</span>;
  const seconds = Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 1000),
  );
  const units = [
    [31536000, "y"],
    [2592000, "mo"],
    [86400, "d"],
    [3600, "h"],
    [60, "m"],
  ];
  const match = units.find(([size]) => seconds >= size);
  const text = match
    ? `${Math.floor(seconds / match[0])}${match[1]} ago`
    : "just now";
  const local = new Date(value).toLocaleString("en-UG", { timeZone: "Africa/Kampala", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  return <time className="relative-time" title={local} dateTime={value}><span>{text}</span><small>{local}</small></time>;
}

const colour = (status) =>
  ({
    Dispatched: "#d4891c",
    Acknowledged: "#2b72ae",
    Intercepted: "#34795e",
    Escalated: "#b74b36",
    NotSeen: "#7d6b45",
  })[status] || "#66777a";
const reportIcon = (status) =>
  L.divIcon({
    className: "saferide-pin-wrap",
    html: `<span class="saferide-pin" style="background:${colour(status)}"></span>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
const stationIcon = L.divIcon({ className: "saferide-station-wrap", html: '<span class="saferide-station">S</span>', iconSize: [28, 28], iconAnchor: [14, 14] });
const point = (report) => {
  const lat = Number(report.predicted_lat ?? report.reporter_lat);
  const lng = Number(report.predicted_lng ?? report.reporter_lng);
  return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null;
};
const parseLine = (value) => {
  const line = typeof value === "object" && value?.coordinates ? value.coordinates : null;
  if (Array.isArray(line)) return line.map(([lng, lat]) => [Number(lat), Number(lng)]).filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
  const match = typeof value === "string" && value.replace(/^SRID=\d+;/i, "").match(/^LINESTRING\s*\((.+)\)$/i);
  return match ? match[1]
        .split(",")
        .map((pair) => pair.trim().split(/\s+/).map(Number))
        .filter(([lng, lat]) => Number.isFinite(lat) && Number.isFinite(lng))
        .map(([lng, lat]) => [lat, lng])
    : [];
};
const parsePoint = (value) => {
  if (typeof value === "object" && Array.isArray(value?.coordinates)) return [Number(value.coordinates[1]), Number(value.coordinates[0])];
  const match = typeof value === "string" && value.replace(/^SRID=\d+;/i, "").match(/^POINT\s*\(([^)]+)\)$/i);
  if (!match) return null;
  const [lng, lat] = match[1].trim().split(/\s+/).map(Number);
  return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null;
};
function Bounds({ points }) {
  const map = useMap();
  useEffect(() => {
    if (points.length)
      map.fitBounds(points, { padding: [28, 28], maxZoom: 14 });
  }, [map, points]);
  return null;
}
export function OperationsMap({
  reports = [],
  routes = [],
  checkpoints = [],
  stations = [],
  onSelect,
}) {
  const reportPoints = reports
    .map((report) => ({ report, coordinates: point(report) }))
    .filter((item) => item.coordinates);
  const routesWithLines = routes
    .map((route) => ({ route, coordinates: parseLine(route.map_polyline || route.polyline) }))
    .filter((item) => item.coordinates.length > 1);
  if (!reportPoints.length && !routesWithLines.length)
    return (
      <section className="map-panel">
        <div className="map-title">
          <span>
            <MapRegular /> Live operations map
          </span>
          <small>No mappable records</small>
        </div>
        <div className="location-empty">
          <LocationRegular />
          <div>
            <strong>No live positions available</strong>
            <small>
              Reports with coordinates and mapped routes will appear here.
            </small>
          </div>
        </div>
      </section>
    );
  const center =
    reportPoints[0]?.coordinates || routesWithLines[0].coordinates[0];
  const checkpointPoints = checkpoints
    .filter(
      (item) =>
        Number.isFinite(Number(item.latitude)) &&
        Number.isFinite(Number(item.longitude)),
    )
    .map((item) => ({
      checkpoint: item,
      coordinates: [Number(item.latitude), Number(item.longitude)],
    }));
  const stationPoints = stations
    .map((station) => ({ station, coordinates: parsePoint(station.location) }))
    .filter((item) => item.coordinates);
  const bounds = [
    ...reportPoints.map((item) => item.coordinates),
    ...routesWithLines.flatMap((item) => item.coordinates),
    ...checkpointPoints.map((item) => item.coordinates),
    ...stationPoints.map((item) => item.coordinates),
  ];
  return (
    <section className="map-panel">
      <div className="map-title">
        <span>
          <MapRegular /> Live operations map
        </span>
        <small>SafeRide route, station &amp; case data</small>
      </div>
      <div className="leaflet-map">
        <MapContainer center={center} zoom={12} scrollWheelZoom>
          {routesWithLines.map(({ route, coordinates }) => (
            <Polyline
              key={route.route_id}
              positions={coordinates}
              pathOptions={{ color: "#397c62", weight: 4, opacity: 0.8 }}
            />
          ))}
          {checkpointPoints.map(({ checkpoint, coordinates }) => (
            <Marker key={checkpoint.checkpoint_id} position={coordinates}>
              <Popup>
                <strong>{checkpoint.name}</strong>
                <br />
                {checkpoint.is_active
                  ? "Active checkpoint"
                  : "Inactive checkpoint"}
              </Popup>
            </Marker>
          ))}
          {stationPoints.map(({ station, coordinates }) => (
            <Marker key={station.station_id} position={coordinates} icon={stationIcon}>
              <Popup><strong>{station.name}</strong><br />Police station</Popup>
            </Marker>
          ))}
          {reportPoints.map(({ report, coordinates }) => (
            <Marker
              key={report.case_id}
              position={coordinates}
              icon={reportIcon(report.status)}
            >
              <Popup>
                <strong>{report.case_id}</strong>
                <br />
                {report.route_name}
                <br />
                <StatusBadge value={report.status} />
                <br />
                <Button
                  size="small"
                  appearance="primary"
                  onClick={() => onSelect?.(report.case_id)}
                >
                  Open case
                </Button>
              </Popup>
            </Marker>
          ))}
          <Bounds points={bounds} />
        </MapContainer>
      </div>
    </section>
  );
}
