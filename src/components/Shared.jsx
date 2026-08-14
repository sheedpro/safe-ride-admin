import { Badge, Button } from '@fluentui/react-components';
import { ClipboardTaskListLtrRegular, LocationRegular, MapRegular } from '@fluentui/react-icons';
import L from 'leaflet';
import { MapContainer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import { useEffect } from 'react';
import 'leaflet/dist/leaflet.css';
import './locations.css';

export function PageHead({ eyebrow, title, children }) { return <section className="page-head compact"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1></div>{children}</section>; }
export function StatusBadge({ value }) { const color = ['Active','Intercepted'].includes(value) ? 'success' : ['Dispatched','flagged'].includes(value) ? 'warning' : value === 'Acknowledged' ? 'informative' : 'danger'; return <Badge appearance="tint" color={color}>{value || 'Unknown'}</Badge>; }
export function EmptyState({ text }) { return <div className="empty small"><ClipboardTaskListLtrRegular/><p>{text}</p></div>; }

const colour = status => ({ Dispatched: '#d4891c', Acknowledged: '#2b72ae', Intercepted: '#34795e', Escalated: '#b74b36', NotSeen: '#7d6b45' }[status] || '#66777a');
const reportIcon = status => L.divIcon({ className: 'saferide-pin-wrap', html: `<span class="saferide-pin" style="background:${colour(status)}"></span>`, iconSize: [18, 18], iconAnchor: [9, 9] });
const point = report => { const lat = Number(report.predicted_lat ?? report.reporter_lat); const lng = Number(report.predicted_lng ?? report.reporter_lng); return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null; };
const parseLine = value => { const match = typeof value === 'string' && value.match(/^LINESTRING\s*\((.+)\)$/i); return match ? match[1].split(',').map(pair => pair.trim().split(/\s+/).map(Number)).filter(([lng, lat]) => Number.isFinite(lat) && Number.isFinite(lng)).map(([lng, lat]) => [lat, lng]) : []; };
function Bounds({ points }) { const map = useMap(); useEffect(() => { if (points.length) map.fitBounds(points, { padding: [28, 28], maxZoom: 14 }); }, [map, points]); return null; }
export function OperationsMap({ reports = [], routes = [], onSelect }) {
  const reportPoints = reports.map(report => ({ report, coordinates: point(report) })).filter(item => item.coordinates);
  const routesWithLines = routes.map(route => ({ route, coordinates: parseLine(route.polyline) })).filter(item => item.coordinates.length > 1);
  if (!reportPoints.length && !routesWithLines.length) return <section className="map-panel"><div className="map-title"><span><MapRegular/> Live operations map</span><small>No mappable records</small></div><div className="location-empty"><LocationRegular/><div><strong>No live positions available</strong><small>Reports with coordinates and mapped routes will appear here.</small></div></div></section>;
  const center = reportPoints[0]?.coordinates || routesWithLines[0].coordinates[0];
  const bounds = [...reportPoints.map(item => item.coordinates), ...routesWithLines.flatMap(item => item.coordinates)];
  return <section className="map-panel"><div className="map-title"><span><MapRegular/> Live operations map</span><small>Internal SafeRide map</small></div><div className="leaflet-map"><MapContainer center={center} zoom={12} scrollWheelZoom>{routesWithLines.map(({ route, coordinates }) => <Polyline key={route.route_id} positions={coordinates} pathOptions={{ color: '#397c62', weight: 4, opacity: .8 }}/>) }{reportPoints.map(({ report, coordinates }) => <Marker key={report.case_id} position={coordinates} icon={reportIcon(report.status)}><Popup><strong>{report.case_id}</strong><br/>{report.route_name}<br/><StatusBadge value={report.status}/><br/><Button size="small" appearance="primary" onClick={() => onSelect?.(report.case_id)}>Open case</Button></Popup></Marker>)}<Bounds points={bounds}/></MapContainer></div></section>;
}
