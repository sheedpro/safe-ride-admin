import { useState } from "react";
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
