import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { FluentProvider, webLightTheme, Button } from '@fluentui/react-components';
import { api, configured, supabase } from './api';
import { can } from './config/navigation';
import { AppShell } from './components/AppShell';
import { EmptyState, PageHead } from './components/Shared';
import { ReportsTable } from './components/ReportsTable';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { CheckpointsPage } from './pages/CheckpointsPage';
import { AuditPage, OperationsPage, RoutesPage, SettingsPage } from './pages/AdminDataPages';
import { RecordDetailDialog } from './components/RecordDetailDialog';
import { PageLoader } from './components/PageLoader';
import { ModerationFlagsPage, StationsPage, TemplatesPage, UsersPage, VehiclesPage } from './pages/ManagementPages';
import { PoliceApp } from './police/PoliceApp';
import { Pagination } from './police/Pagination';
import './styles.css';
import './auth.css';

function PagedResource({ endpoint, session, refreshToken, children }) {
  const [result, setResult] = useState({ items: [], pagination: null });
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [endpoint]);
  useEffect(() => {
    let active = true;
    api(`${endpoint}?page=${page}&pageSize=25`, session)
      .then(response => { if (active) setResult(response); })
      .catch(() => { if (active) setResult({ items: [], pagination: null }); });
    return () => { active = false; };
  }, [endpoint, session, page, refreshToken]);
  return <>{children(result.items || [])}<Pagination pagination={result.pagination} onPageChange={setPage}/></>;
}

function App() {
  const [session, setSession] = useState(null); const [admin, setAdmin] = useState(null); const [page, setPage] = useState('Dashboard'); const [data, setData] = useState({}); const [error, setError] = useState(''); const [loading, setLoading] = useState(true); const [detail, setDetail] = useState(null); const [refreshToken, setRefreshToken] = useState(0);
  const load = async activeSession => { if (!activeSession) return; try { setLoading(true); const me = await api('/me', activeSession); setAdmin(me); const [overview, checkpoints, stations, routes, reports, settings, audit, vehicles, templates, users, flags] = await Promise.all([api('/analytics/overview', activeSession), can(me.role, 'checkpoints:read') ? api('/checkpoints', activeSession) : Promise.resolve([]), can(me.role, 'stations:read') ? api('/stations', activeSession) : Promise.resolve([]), can(me.role, 'routes:read') ? api('/routes', activeSession) : Promise.resolve([]), can(me.role, 'reports:read') ? api('/reports', activeSession) : Promise.resolve([]), can(me.role, 'settings:read') ? api('/settings', activeSession) : Promise.resolve(null), can(me.role, 'audit:read') ? api('/audit-logs', activeSession) : Promise.resolve([]), can(me.role, 'vehicles:read') ? api('/vehicles', activeSession) : Promise.resolve([]), can(me.role, 'templates:read') ? api('/templates', activeSession) : Promise.resolve([]), can(me.role, 'users:read') ? api('/users', activeSession) : Promise.resolve([]), can(me.role, 'moderation:read') ? api('/moderation/flags', activeSession) : Promise.resolve([])]); setData({ overview, checkpoints, stations, routes, reports, settings, audit, vehicles, templates, users, flags }); setError(''); } catch (requestError) { setError(requestError.message); } finally { setLoading(false); } };
  useEffect(() => { if (!configured) { setLoading(false); return; } supabase.auth.getSession().then(({ data: auth }) => { setSession(auth.session); load(auth.session); }); const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => { setSession(nextSession); if (nextSession) load(nextSession); else { setAdmin(null); setData({}); } }); return () => listener.subscription.unsubscribe(); }, []);
  if (!session) return <LoginPage onSession={setSession}/>;
  if (loading) return <PageLoader label="Loading SafeRide operations"/>;
  if (error) return <main className="login"><div><h1>Access unavailable.</h1><p>{error}</p><Button onClick={() => supabase.auth.signOut()}>Sign out</Button></div></main>;
  const reload = () => { setRefreshToken(value => value + 1); load(session); }; const moderate = async (report, decision) => { await api(`/moderation/${report.case_id}/${decision}`, session, { method: 'POST', body: JSON.stringify({ reason: 'Reviewed in admin console' }) }); reload(); };
  const openReport = id => setDetail({ resource: 'reports', id }); const pageContent = { Dashboard: <DashboardPage overview={data.overview} reports={data.reports || []} routes={data.routes || []} setPage={setPage} onSelect={openReport}/>, 'Checkpoints & Roster': <PagedResource endpoint="/checkpoints" session={session} refreshToken={refreshToken}>{rows => <CheckpointsPage rows={rows} session={session} reload={reload} onSelect={id => setDetail({ resource: 'checkpoints', id })}/>}</PagedResource>, Stations: <PagedResource endpoint="/stations" session={session} refreshToken={refreshToken}>{rows => <StationsPage rows={rows} session={session} reload={reload}/>}</PagedResource>, 'Routes & Corridors': <PagedResource endpoint="/routes" session={session} refreshToken={refreshToken}>{rows => <RoutesPage rows={rows} session={session} reload={reload}/>}</PagedResource>, Reports: <PagedResource endpoint="/reports" session={session} refreshToken={refreshToken}>{rows => <ReportsTable rows={rows} onModerate={moderate} onSelect={openReport}/>}</PagedResource>, 'Moderation Flags': <PagedResource endpoint="/moderation/flags" session={session} refreshToken={refreshToken}>{rows => <ModerationFlagsPage rows={rows} session={session} reload={reload}/>}</PagedResource>, 'Live Operations': <OperationsPage reports={data.reports || []} routes={data.routes || []} checkpoints={data.checkpoints || []} onSelect={openReport}/>, Analytics: <DashboardPage overview={data.overview} reports={data.reports || []} routes={data.routes || []} setPage={setPage} onSelect={openReport}/>, Vehicles: <PagedResource endpoint="/vehicles" session={session} refreshToken={refreshToken}>{rows => <VehiclesPage rows={rows} session={session} reload={reload}/>}</PagedResource>, 'Message Templates': <PagedResource endpoint="/templates" session={session} refreshToken={refreshToken}>{rows => <TemplatesPage rows={rows} session={session} reload={reload}/>}</PagedResource>, 'Users & Roles': <PagedResource endpoint="/users" session={session} refreshToken={refreshToken}>{rows => <UsersPage rows={rows} session={session} reload={reload}/>}</PagedResource>, 'Audit Log': <PagedResource endpoint="/audit-logs" session={session} refreshToken={refreshToken}>{rows => <AuditPage rows={rows}/>}</PagedResource>, Settings: <SettingsPage settings={data.settings} session={session} reload={reload}/> };
  return <FluentProvider theme={webLightTheme}><AppShell admin={admin} page={page} setPage={setPage} onLogout={() => supabase.auth.signOut()}>{pageContent[page] || <><PageHead eyebrow="COMING NEXT" title={page}/><EmptyState text="This module is not available for this role yet."/></>}<RecordDetailDialog resource={detail?.resource} id={detail?.id} session={session} reload={reload} onDismiss={() => setDetail(null)}/></AppShell></FluentProvider>;
}
createRoot(document.getElementById('root')).render(window.location.pathname.startsWith('/police') ? <FluentProvider theme={webLightTheme}><PoliceApp/></FluentProvider> : <App/>);
