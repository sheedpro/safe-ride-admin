import { useEffect, useState } from "react";
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
const ugandaNumber = (value) => {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.startsWith("256")
    ? `+${digits}`
    : `+256${digits.replace(/^0/, "")}`;
};
export function OfficersPage({ session, checkpoints, reload }) {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    checkpoint_id: "",
    name: "",
    badgeId: "",
    whatsapp: "",
    routeIds: "",
  });
  const [error, setError] = useState("");
  const load = () =>
    policeApi("/officers", session)
      .then(setRows)
      .catch((error) => setError(error.message));
  useEffect(() => {
    load();
  }, [session]);
  const set = (key, value) =>
    setForm((current) => ({ ...current, [key]: value }));
  async function create() {
    try {
      await policeApi("/officers", session, {
        method: "POST",
        body: JSON.stringify({
          ...form,
          whatsapp: ugandaNumber(form.whatsapp),
          routeIds: form.routeIds
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
        }),
      });
      setOpen(false);
      setForm({
        checkpoint_id: "",
        name: "",
        badgeId: "",
        whatsapp: "",
        routeIds: "",
      });
      load();
      reload();
    } catch (error) {
      setError(error.message);
    }
  }
  async function duty(row) {
    await policeApi(
      `/officers/${encodeURIComponent(row.badgeId)}/duty`,
      session,
      {
        method: "PATCH",
        body: JSON.stringify({
          checkpoint_id: row.checkpoint_id,
          onDuty: !row.onDuty,
        }),
      },
    );
    load();
    reload();
  }
  return (
    <>
      <PageHead eyebrow="ROSTER" title="Officers & assignments">
        <Button appearance="primary" onClick={() => setOpen((value) => !value)}>
          {open ? "Cancel" : "Add officer"}
        </Button>
      </PageHead>
      {open && (
        <section className="police-create surface">
          <div className="settings-grid">
            <Label>
              Officer name
              <Input
                value={form.name}
                onChange={(_, data) => set("name", data.value)}
              />
            </Label>
            <Label>
              Badge ID
              <Input
                value={form.badgeId}
                onChange={(_, data) => set("badgeId", data.value)}
              />
            </Label>
            <Label>
              WhatsApp number
              <Input
                value={form.whatsapp}
                contentBefore="+256"
                placeholder="778482785"
                input={{ inputMode: "numeric" }}
                onChange={(_, data) => set("whatsapp", data.value)}
              />
              <small>Enter the nine digits after +256.</small>
            </Label>
            <Label>
              Checkpoint
              <select
                value={form.checkpoint_id}
                onChange={(event) => set("checkpoint_id", event.target.value)}
              >
                <option value="">Select checkpoint</option>
                {checkpoints.map((item) => (
                  <option key={item.checkpoint_id} value={item.checkpoint_id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </Label>
            <Label className="wide">
              Route IDs, comma separated
              <Input
                value={form.routeIds}
                onChange={(_, data) => set("routeIds", data.value)}
              />
            </Label>
            <div className="wide">
              <Button
                appearance="primary"
                disabled={
                  !form.name ||
                  !form.badgeId ||
                  !form.whatsapp ||
                  !form.checkpoint_id
                }
                onClick={create}
              >
                Create officer
              </Button>
            </div>
          </div>
        </section>
      )}
      <section className="surface">
        <Table>
          <TableHeader>
            <TableRow>
              {[
                "Officer",
                "Checkpoint",
                "Coverage",
                "Status",
                "Cases",
                "Duty",
              ].map((item) => (
                <TableHeaderCell key={item}>{item}</TableHeaderCell>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.badgeId}>
                <TableCell>
                  <strong>{row.name}</strong>
                  <small className="mono">{row.badgeId}</small>
                </TableCell>
                <TableCell>{row.checkpoint_name}</TableCell>
                <TableCell>{row.route_ids?.join(", ")}</TableCell>
                <TableCell>
                  <StatusBadge value={row.status} />
                </TableCell>
                <TableCell>
                  {row.active_cases?.map((item) => item.case_id).join(", ") ||
                    "None"}
                </TableCell>
                <TableCell>
                  <Button size="small" onClick={() => duty(row)}>
                    {row.onDuty ? "Mark off duty" : "Mark on duty"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {!rows.length && <EmptyState text="No officers are assigned yet." />}
      </section>
      {error && <p className="form-error">{error}</p>}
    </>
  );
}
