import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
} from "@fluentui/react-components";
import { useEffect, useState } from "react";
import { EmptyState, StatusBadge } from "./Shared";
import { paginateRows, TablePagination } from "./TablePagination";
export function ReportsTable({ rows = [], onModerate, onSelect }) {
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [rows]);
  const { items, page: currentPage, totalPages } = paginateRows(rows, page);
  return (
    <section className="surface">
      <div className="section-heading">
        <div>
          <p className="eyebrow">REPORTS</p>
          <h2>Operational record</h2>
        </div>
      </div>
      <Table size="small">
        <TableHeader>
          <TableRow>
            {[
              "Case",
              "Route",
              "Vehicle",
              "Issue",
              "Target",
              "Status",
              "Review",
            ].map((item) => (
              <TableHeaderCell key={item}>{item}</TableHeaderCell>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((row) => (
            <TableRow key={row.case_id}>
              <TableCell className="mono">
                <Button
                  appearance="transparent"
                  size="small"
                  onClick={() => onSelect?.(row.case_id)}
                >
                  {row.case_id}
                </Button>
              </TableCell>
              <TableCell>{row.route_name}</TableCell>
              <TableCell>
                {row.plate_number || row.vehicle_description || "Unknown"}
              </TableCell>
              <TableCell>{row.violation_type}</TableCell>
              <TableCell>
                {row.dispatch_target_name || "Station fallback"}
              </TableCell>
              <TableCell>
                <StatusBadge value={row.status} />
              </TableCell>
              <TableCell>
                {row.moderation_status === "flagged" && onModerate ? (
                  <Button
                    size="small"
                    onClick={() => onModerate(row, "dismiss")}
                  >
                    Review
                  </Button>
                ) : (
                  <Button
                    appearance="subtle"
                    size="small"
                    onClick={() => onSelect?.(row.case_id)}
                  >
                    View
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <TablePagination page={currentPage} totalPages={totalPages} onPageChange={setPage} />
      {!rows.length && (
        <EmptyState text="No reports match the selected view." />
      )}
    </section>
  );
}
