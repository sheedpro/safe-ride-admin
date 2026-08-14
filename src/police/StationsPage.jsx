import { useState } from "react";
import L from "leaflet";
import { MapContainer, Marker, TileLayer, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";

const mapTilerKey = import.meta.env.VITE_MAPTILER_KEY;
import {
  Button,
  Input,
  Label,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
} from "@fluentui/react-components";
import { policeApi } from "../api";
import { EmptyState, PageHead, StatusBadge } from "../components/Shared";

const blank = {
  station_id: "",
  name: "",
  whatsapp: "",
  phone_number: "",
  latitude: "",
  longitude: "",
  reason: "",
};

const normaliseUgandaNumber = (value) => {
  const digits = String(value || "").replace(/\D/g, "");
  return digits ? `+256${digits.replace(/^256/, "").replace(/^0/, "")}` : "";
};

const markerIcon = L.divIcon({
  className: "saferide-station-picker-wrap",
  html: '<span class="saferide-station-picker">+</span>',
  iconSize: [30, 30],
  iconAnchor: [15, 15],
});

function MapClick({ onPick }) {
  useMapEvents({ click: (event) => onPick(event.latlng) });
  return null;
}

function StationMapPicker({ latitude, longitude, onPick }) {
  const selected = Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude))
    ? [Number(latitude), Number(longitude)]
    : null;
  return (
    <div className="station-map-picker">
      <MapContainer center={selected || [0.3476, 32.5825]} zoom={selected ? 14 : 11} scrollWheelZoom>
        {mapTilerKey && <TileLayer url={`https://api.maptiler.com/maps/streets-v4/256/{z}/{x}/{y}.png?key=${mapTilerKey}`} attribution='&copy; <a href="https://www.maptiler.com/copyright/" target="_blank" rel="noreferrer">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>' crossOrigin />}
        <MapClick onPick={(point) => onPick(point.lat, point.lng)} />
        {selected && <Marker position={selected} icon={markerIcon} draggable eventHandlers={{ dragend: (event) => { const point = event.target.getLatLng(); onPick(point.lat, point.lng); } }} />}
      </MapContainer>
      <small>Click to place the station. Drag the marker to refine its position. This map uses only SafeRide data.</small>
    </div>
  );
}

export function StationsPage({ session, stations, reload }) {
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const reset = () => { setForm(blank); setEditing(null); setOpen(false); setError(""); };

  function startEdit(station) {
    setEditing(station.station_id);
    setOpen(true);
    setForm({
      ...blank,
      station_id: station.station_id,
      name: station.name,
      whatsapp: station.whatsapp || "",
      phone_number: station.phone_number || "",
      reason: "Update station details",
    });
  }

  async function submit() {
    try {
      setError("");
      const payload = {
        name: form.name,
        whatsapp: normaliseUgandaNumber(form.whatsapp),
        phone_number: form.phone_number,
        location: form.latitude && form.longitude ? `POINT(${form.longitude} ${form.latitude})` : undefined,
        reason: form.reason,
      };
      if (editing) {
        await policeApi(`/stations/${encodeURIComponent(editing)}`, session, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await policeApi("/stations", session, {
          method: "POST",
          body: JSON.stringify({
            ...payload,
            station_id: form.station_id,
            location: `POINT(${form.longitude} ${form.latitude})`,
          }),
        });
      }
      reset();
      reload();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  return (
    <>
      <PageHead eyebrow="STATION COVERAGE" title="Police stations">
        <Button appearance="primary" onClick={() => { reset(); setOpen(true); }}>
          Add station
        </Button>
      </PageHead>
      {open && (
        <section className="police-create surface">
          <div className="section-heading">
            <strong>{editing ? "Edit station" : "New station"}</strong>
            <Button appearance="subtle" onClick={reset}>Cancel</Button>
          </div>
          <div className="settings-grid">
            <Label>Station ID<Input disabled={Boolean(editing)} value={form.station_id} onChange={(_, data) => set("station_id", data.value)} /></Label>
            <Label>Station name<Input value={form.name} onChange={(_, data) => set("name", data.value)} /></Label>
            <Label>WhatsApp number<Input contentBefore="+256" placeholder="778482785" value={form.whatsapp.replace(/^\+?256/, "")} onChange={(_, data) => set("whatsapp", data.value)} /></Label>
            <Label>Desk phone<Input value={form.phone_number} onChange={(_, data) => set("phone_number", data.value)} /></Label>
            <Label>Latitude<Input input={{ inputMode: "decimal" }} value={form.latitude} onChange={(_, data) => set("latitude", data.value)} /></Label>
            <Label>Longitude<Input input={{ inputMode: "decimal" }} value={form.longitude} onChange={(_, data) => set("longitude", data.value)} /></Label>
            <div className="wide"><StationMapPicker latitude={form.latitude} longitude={form.longitude} onPick={(latitude, longitude) => setForm((current) => ({ ...current, latitude: latitude.toFixed(6), longitude: longitude.toFixed(6) }))} /></div>
            <Label className="wide">Operational reason<Input value={form.reason} onChange={(_, data) => set("reason", data.value)} /></Label>
            <div className="wide"><Button appearance="primary" disabled={!form.station_id || !form.name || !form.reason || (!editing && (!form.latitude || !form.longitude))} onClick={submit}>{editing ? "Save station" : "Create station"}</Button>{error && <p className="form-error">{error}</p>}</div>
          </div>
        </section>
      )}
      <section className="surface">
        <Table>
          <TableHeader><TableRow>{["Station", "WhatsApp", "Desk phone", "Status", "Action"].map((item) => <TableHeaderCell key={item}>{item}</TableHeaderCell>)}</TableRow></TableHeader>
          <TableBody>{stations.map((station) => <TableRow key={station.station_id}><TableCell><strong>{station.name}</strong><small className="mono">{station.station_id}</small></TableCell><TableCell>{station.whatsapp || "Not set"}</TableCell><TableCell>{station.phone_number || "Not set"}</TableCell><TableCell><StatusBadge value={station.is_active ? "Active" : "Inactive"} /></TableCell><TableCell><Button size="small" onClick={() => startEdit(station)}>Edit</Button></TableCell></TableRow>)}</TableBody>
        </Table>
        {!stations.length && <EmptyState text="No police stations configured." />}
      </section>
    </>
  );
}
