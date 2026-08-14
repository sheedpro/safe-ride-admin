import { useEffect, useState } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, Polyline, TileLayer, useMapEvents } from 'react-leaflet';
import { Button } from '@fluentui/react-components';
import 'leaflet/dist/leaflet.css';
import './locations.css';

const mapTilerKey = import.meta.env.VITE_MAPTILER_KEY;
const defaultCentre = [0.3476, 32.5825];
const toWkt = points => points.length < 2 ? '' : `LINESTRING(${points.map(([lat, lng]) => `${lng.toFixed(6)} ${lat.toFixed(6)}`).join(', ')})`;
const fromWkt = value => {
  const match = String(value || '').match(/^LINESTRING\s*\((.+)\)$/i);
  if (!match) return [];
  return match[1].split(',').map(part => part.trim().split(/\s+/).map(Number)).filter(([lng, lat]) => Number.isFinite(lat) && Number.isFinite(lng)).map(([lng, lat]) => [lat, lng]);
};
const pointIcon = number => L.divIcon({ className: 'saferide-route-point-wrap', html: `<span class="saferide-route-point">${number}</span>`, iconSize: [28, 28], iconAnchor: [14, 14] });
function LineClicks({ onAdd }) { useMapEvents({ click: event => onAdd([event.latlng.lat, event.latlng.lng]) }); return null; }

export function RouteMapPicker({ value, onChange }) {
  const [points, setPoints] = useState(() => fromWkt(value));
  useEffect(() => setPoints(fromWkt(value)), [value]);
  const update = next => { setPoints(next); onChange(toWkt(next)); };
  const centre = points[0] || defaultCentre;
  return <div className="route-map-picker"><MapContainer center={centre} zoom={points.length ? 13 : 11} scrollWheelZoom>{mapTilerKey && <TileLayer url={`https://api.maptiler.com/maps/streets-v4/256/{z}/{x}/{y}.png?key=${mapTilerKey}`} attribution='&copy; <a href="https://www.maptiler.com/copyright/" target="_blank" rel="noreferrer">MapTiler</a> &copy; OpenStreetMap contributors' crossOrigin />}<LineClicks onAdd={point => update([...points, point])}/>{points.length > 1 && <Polyline positions={points} pathOptions={{ color: '#28765c', weight: 5 }}/>} {points.map((point, index) => <Marker key={index} position={point} icon={pointIcon(index + 1)} draggable eventHandlers={{ dragend: event => { const next = [...points]; const moved = event.target.getLatLng(); next[index] = [moved.lat, moved.lng]; update(next); } }}/>)}</MapContainer><div className="route-map-picker-footer"><span>{points.length < 2 ? 'Click at least two points to create a route line.' : `${points.length} corridor points selected.`}</span><div><Button size="small" disabled={!points.length} onClick={() => update(points.slice(0, -1))}>Undo point</Button><Button size="small" disabled={!points.length} onClick={() => update([])}>Clear</Button></div></div></div>;
}
