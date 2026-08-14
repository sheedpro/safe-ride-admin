import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Field,
  Select,
  Textarea,
} from "@fluentui/react-components";
import { useEffect, useState } from "react";
import { api } from "../api";
import { StatusBadge } from "./Shared";
import { CaseConversation } from "./CaseConversation";
const value = (item) =>
  item == null || item === ""
    ? "Not recorded"
    : Array.isArray(item)
      ? item.join(", ")
      : String(item);
const statuses = [
  "Dispatched",
  "Acknowledged",
  "Intercepted",
  "NotSeen",
  "Escalated",
  "Closed",
  "Rejected",
];
function Detail({ label, children }) {
  return (
    <div>
      <small>{label}</small>
      <div>{children}</div>
    </div>
  );
}
export function RecordDetailDialog({
  resource,
  id,
  session,
  onDismiss,
  reload,
}) {
  const [record, setRecord] = useState(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!id) return;
    setRecord(null);
    setError("");
    api(`/${resource}/${encodeURIComponent(id)}`, session)
      .then(setRecord)
      .catch((error) => setError(error.message));
  }, [resource, id, session]);
  const report = resource === "reports" ? record : null;
  const entity = record?.checkpoint || record?.route || record?.user || record;
  const history = record?.history || [];
  async function saveStatus() {
    try {
      setSaving(true);
      await api(`/reports/${encodeURIComponent(id)}/status`, session, {
        method: "PATCH",
        body: JSON.stringify({ status, reason }),
      });
      reload();
      onDismiss();
    } catch (error) {
      setError(error.message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <Dialog
      open={Boolean(id)}
      onOpenChange={(_, data) => !data.open && onDismiss()}
    >
      <DialogSurface>
        <DialogBody>
          <DialogTitle>
            {report
              ? `Case ${id}`
              : value(
                  entity?.name || entity?.plate_number || entity?.email || id,
                )}
          </DialogTitle>
          <DialogContent>
            {error && <p className="form-error">{error}</p>}
            {!record && !error && <p>Loading record...</p>}
            {report && (
              <>
                <section className="detail-grid">
                  <Detail label="Status">
                    <StatusBadge value={report.status} />
                  </Detail>
                  <Detail label="Reported">
                    {new Date(report.reported_at).toLocaleString()}
                  </Detail>
                  <Detail label="Route">{value(report.route_name)}</Detail>
                  <Detail label="Vehicle">
                    {value(report.plate_number || report.vehicle_description)}
                  </Detail>
                  <Detail label="Violation">
                    {value(report.violation_type)}
                  </Detail>
                  <Detail label="Dispatch target">
                    {value(report.dispatch_target_name)}
                  </Detail>
                  <Field label="Override status">
                    <Select
                      value={status}
                      onChange={(_, data) => setStatus(data.value)}
                    >
                      <option value="">Select a status</option>
                      {statuses.map((item) => (
                        <option key={item}>{item}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Reason for override">
                    <Textarea
                      value={reason}
                      onChange={(_, data) => setReason(data.value)}
                    />
                  </Field>
                </section>
                <CaseConversation caseId={id} session={session} />
              </>
            )}
            {entity && !report && (
              <section className="detail-grid">
                {Object.entries(entity)
                  .filter(
                    ([key]) =>
                      !["location", "polyline", "duty_officers"].includes(key),
                  )
                  .map(([key, item]) => (
                    <Detail key={key} label={key.replaceAll("_", " ")}>
                      {value(item)}
                    </Detail>
                  ))}
              </section>
            )}
            {history.length > 0 && (
              <section className="detail-history">
                <strong>Change history</strong>
                {history.map((item) => (
                  <p key={item.id}>
                    {new Date(item.created_at).toLocaleString()} - {item.action}
                    {item.reason ? `: ${item.reason}` : ""}
                  </p>
                ))}
              </section>
            )}
          </DialogContent>
          <DialogActions>
            {report && (
              <Button
                appearance="primary"
                disabled={!status || !reason.trim() || saving}
                onClick={saveStatus}
              >
                {saving ? "Saving..." : "Save status"}
              </Button>
            )}
            <Button onClick={onDismiss}>Close</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
