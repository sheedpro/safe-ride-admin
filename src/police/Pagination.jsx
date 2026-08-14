import { Button } from "@fluentui/react-components";

export function Pagination({ pagination, onPageChange }) {
  if (!pagination || pagination.totalPages <= 1) return null;
  const first = (pagination.page - 1) * pagination.pageSize + 1;
  const last = Math.min(pagination.total, pagination.page * pagination.pageSize);
  return <div className="table-pagination"><small>Showing {first}–{last} of {pagination.total}</small><div><Button size="small" disabled={pagination.page === 1} onClick={() => onPageChange(pagination.page - 1)}>Previous</Button><span>Page {pagination.page} of {pagination.totalPages}</span><Button size="small" disabled={pagination.page === pagination.totalPages} onClick={() => onPageChange(pagination.page + 1)}>Next</Button></div></div>;
}
