import { useMemo, useState } from "react";
import { Button, Input } from "@fluentui/react-components";

export function RouteMultiSelect({ routes, value, onChange }) {
  const [query, setQuery] = useState("");
  const selected = Array.isArray(value) ? value : [];
  const available = useMemo(() => routes.filter((route) => !selected.includes(route.route_id) && `${route.name} ${route.route_id}`.toLowerCase().includes(query.toLowerCase())).slice(0, 8), [routes, selected, query]);
  const add = (routeId) => { onChange([...selected, routeId]); setQuery(""); };
  return <div className="route-multi-select"><Input value={query} onChange={(_, data) => setQuery(data.value)} placeholder="Search a route or route ID" /><div className="route-selected">{selected.map((routeId) => { const route = routes.find((item) => item.route_id === routeId); return <Button key={routeId} size="small" appearance="secondary" onClick={() => onChange(selected.filter((item) => item !== routeId))}>{route?.name || routeId} ×</Button>; })}{!selected.length && <small>No route selected</small>}</div>{query && <div className="route-options">{available.map((route) => <button key={route.route_id} type="button" onClick={() => add(route.route_id)}><strong>{route.name}</strong><small>{route.route_id}</small></button>)}{!available.length && <small>No matching routes</small>}</div>}</div>;
}
