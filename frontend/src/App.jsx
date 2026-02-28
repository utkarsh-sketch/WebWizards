import { useEffect, useMemo, useState } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { io } from 'socket.io-client';
import SectionCard from './components/SectionCard';
import LiveIncidentMap from './components/LiveIncidentMap';
import EmergencyCallDock from './components/EmergencyCallDock';
import { api } from './lib/api';

const STORAGE_KEY = 'nearhelp-auth';

const crisisOptions = [
  { label: 'Medical Emergency', value: 'medical' },
  { label: 'Car Breakdown', value: 'breakdown' },
  { label: 'Gas Leak', value: 'gas_leak' },
  { label: 'Other Urgent Help', value: 'other' },
];

const radiusOptions = [500, 1000, 2000];

const resources = [
  'AED - Green Park Clinic (350m)',
  'Fire Extinguisher - Metro Gate 3 (220m)',
  'Police Station - Civil Lines (1.1km)',
  '24x7 Pharmacy - Hope Medico (420m)',
];

export default function App() {
  const [authMode, setAuthMode] = useState('login');
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '', skills: '' });
  const [auth, setAuth] = useState(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : { token: '', user: null };
  });

  const [socketConnected, setSocketConnected] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const [sosForm, setSosForm] = useState({
    crisisType: 'medical',
    radiusMeters: 1000,
    address: 'Sector 8, Chandigarh',
    lat: 30.7415,
    lng: 76.7681,
    description: '',
    anonymous: false,
  });

  const [incidents, setIncidents] = useState([]);
  const [myIncidents, setMyIncidents] = useState([]);
  const [stats, setStats] = useState({ activeUsers: 0, activeIssues: 0, resolvedToday: 0 });
  const [alertPrefs, setAlertPrefs] = useState({ notifications: true, sound: true });
  const [userLocation, setUserLocation] = useState(null);
  const [selectedIncidentId, setSelectedIncidentId] = useState('');
  const [resolveNote, setResolveNote] = useState('');

  const [aiContext, setAiContext] = useState('Victim fainted near bus stand. Breathing is shallow. Crowd present.');
  const [aiOutput, setAiOutput] = useState(null);

  const selectedIncident = useMemo(
    () => incidents.find((item) => item.id === selectedIncidentId) || incidents[0] || null,
    [incidents, selectedIncidentId]
  );
  const responderIncidents = useMemo(
    () => incidents.filter((item) => String(item.createdBy?.id || '') !== String(auth.user?.id || '')),
    [incidents, auth.user?.id]
  );
  const selectedResponderIncident = useMemo(
    () => responderIncidents.find((item) => item.id === selectedIncidentId) || responderIncidents[0] || null,
    [responderIncidents, selectedIncidentId]
  );

  const hasJoinedSelectedIncident = Boolean(
    selectedResponderIncident?.responders?.some((responder) => String(responder.id) === String(auth.user?.id))
  );

  useEffect(() => {
    if (auth.token) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [auth]);

  useEffect(() => {
    if (!auth.token || !navigator.geolocation) {
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          lat: Number(position.coords.latitude),
          lng: Number(position.coords.longitude),
        });
      },
      () => {
        setUserLocation(null);
      },
      { enableHighAccuracy: true, timeout: 5000 }
    );
  }, [auth.token]);

  useEffect(() => {
    if (!auth.token) {
      return;
    }
    requestNotificationPermission();
  }, [auth.token]);

  useEffect(() => {
    if (!auth.token) {
      setSocketConnected(false);
      return undefined;
    }

    const wsUrl = import.meta.env.VITE_API_URL;

    if (!wsUrl) {
      console.error("VITE_API_URL is not defined");
      return;
    }
    const socket = io(wsUrl, {
      transports: ['websocket', 'polling'],
      auth: { token: `Bearer ${auth.token}` },
    });

    socket.on('connect', () => setSocketConnected(true));
    socket.on('disconnect', () => setSocketConnected(false));

    socket.on('sos:new', (payload) => {
      setIncidents((prev) => normalizeActiveIncidents([payload, ...prev]));
      if (payload.createdBy?.id && String(payload.createdBy.id) === String(auth.user?.id)) {
        setMyIncidents((prev) => upsertIncident(prev, payload));
      }
      refreshStats();
      if (String(payload.createdBy?.id || '') !== String(auth.user?.id || '')) {
        triggerSosAlert(payload, {
          alertPrefs,
          userLocation,
          currentUserId: auth.user?.id,
        });
      }
    });

    socket.on('sos:updated', (payload) => {
      setIncidents((prev) => normalizeActiveIncidents(upsertIncident(prev, payload)));
      setMyIncidents((prev) => (prev.some((x) => x.id === payload.id) ? upsertIncident(prev, payload) : prev));
      refreshStats();
    });

    socket.on('sos:responder_joined', (payload) => {
      setIncidents((prev) => normalizeActiveIncidents(upsertIncident(prev, payload)));
      setMyIncidents((prev) => (prev.some((x) => x.id === payload.id) ? upsertIncident(prev, payload) : prev));
      refreshStats();
    });

    socket.on('sos:resolved', (payload) => {
      setIncidents((prev) => normalizeActiveIncidents(upsertIncident(prev, payload)));
      setMyIncidents((prev) => (prev.some((x) => x.id === payload.id) ? upsertIncident(prev, payload) : prev));
      refreshStats();
    });

    return () => socket.disconnect();
  }, [auth.token, auth.user?.id, alertPrefs, userLocation]);

  useEffect(() => {
    if (!auth.token) return;
    refreshData();
  }, [auth.token]);

  async function refreshStats() {
    try {
      if (!auth.token) return;
      const statsResp = await api.getSosStats(auth.token);
      setStats(statsResp?.stats || { activeUsers: 0, activeIssues: 0, resolvedToday: 0 });
    } catch {
      // silent fail for passive stats polling via socket triggers
    }
  }

  useEffect(() => {
    if (!auth.token) return;
    if (!responderIncidents.length) {
      return;
    }

    const selectedInResponderList = responderIncidents.some((item) => item.id === selectedIncidentId);
    if (!selectedInResponderList) {
      setSelectedIncidentId(responderIncidents[0].id);
    }
  }, [auth.token, responderIncidents, selectedIncidentId]);

  async function refreshData() {
    try {
      const [{ incidents: activeIncidents }, myResp, statsResp] = await Promise.all([
        api.getActiveSos(auth.token),
        api.getMySos(auth.token),
        api.getSosStats(auth.token),
      ]);
      setIncidents(normalizeActiveIncidents(activeIncidents || []));
      setMyIncidents(myResp.incidents || []);
      setStats(statsResp?.stats || { activeUsers: 0, activeIssues: 0, resolvedToday: 0 });
      setSelectedIncidentId(activeIncidents?.[0]?.id || '');
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleAuthSubmit(event) {
    event.preventDefault();
    setError('');
    setStatus('');

    try {
      const payload =
        authMode === 'register'
          ? {
              name: authForm.name,
              email: authForm.email,
              password: authForm.password,
              skills: authForm.skills
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean),
            }
          : { email: authForm.email, password: authForm.password };

      const result = authMode === 'register' ? await api.register(payload) : await api.login(payload);
      setAuth({ token: result.token, user: result.user });
      setStatus(`${authMode === 'register' ? 'Registered' : 'Logged in'} as ${result.user.name}`);
    } catch (err) {
      setError(err.message);
    }
  }

  function logout() {
    setAuth({ token: '', user: null });
    setIncidents([]);
    setMyIncidents([]);
    setSelectedIncidentId('');
    setAiOutput(null);
  }

  async function handleCreateSos() {
    try {
      setError('');
      let lat = Number(sosForm.lat);
      let lng = Number(sosForm.lng);

      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        const current = await getCurrentLocation();
        if (current) {
          lat = current.lat;
          lng = current.lng;
          setSosForm((f) => ({ ...f, lat: current.lat, lng: current.lng }));
        } else {
          throw new Error('Please enter latitude/longitude or allow location access');
        }
      }

      const response = await api.createSos(auth.token, {
        crisisType: sosForm.crisisType,
        radiusMeters: Number(sosForm.radiusMeters),
        address: sosForm.address,
        lat,
        lng,
        description: sosForm.description,
        anonymous: sosForm.anonymous,
      });

      const created = response?.sos;
      if (created) {
        setIncidents((prev) => normalizeActiveIncidents(upsertIncident(prev, created)));
        setMyIncidents((prev) => upsertIncident(prev, created));
        setSelectedIncidentId(created.id);
      }
      setStatus('SOS broadcasted successfully');
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleUseMyLocation() {
    setError('');
    const current = await getCurrentLocation();
    if (!current) {
      setError('Location access denied or unavailable');
      return;
    }

    setSosForm((f) => ({ ...f, lat: current.lat, lng: current.lng }));
    setStatus('Live location captured');
  }

  async function handleRespond(id) {
    try {
      setError('');
      const incident = incidents.find((item) => item.id === id);
      if (!incident) {
        throw new Error('Selected SOS not found');
      }
      if (String(incident.createdBy?.id || '') === String(auth.user?.id || '')) {
        throw new Error('You cannot respond to your own SOS request');
      }
      const alreadyJoined = hasJoinedSelectedIncident;
      const location = await getCurrentLocation();
      const response = await api.respondToSos(auth.token, id, location || {});
      const updated = response?.sos;
      if (updated) {
        setIncidents((prev) => normalizeActiveIncidents(upsertIncident(prev, updated)));
        setSelectedIncidentId(updated.id);
        setMyIncidents((prev) => (prev.some((x) => x.id === updated.id) ? upsertIncident(prev, updated) : prev));
      }

      setStatus(
        alreadyJoined
          ? location
            ? 'Responder location updated'
            : 'Already responding to this SOS'
          : location
          ? 'Joined as responder and shared location'
          : 'Joined as responder'
      );
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleResolve(id) {
    try {
      setError('');
      const incident = incidents.find((item) => item.id === id);
      if (!incident) {
        throw new Error('Selected SOS not found');
      }
      if (String(incident.createdBy?.id || '') === String(auth.user?.id || '')) {
        throw new Error('You cannot resolve your own SOS request');
      }
      const response = await api.resolveSos(auth.token, id, resolveNote);
      const updated = response?.sos;
      if (updated) {
        setIncidents((prev) => normalizeActiveIncidents(upsertIncident(prev, updated)));
        setMyIncidents((prev) => (prev.some((x) => x.id === updated.id) ? upsertIncident(prev, updated) : prev));
      }
      setResolveNote('');
      setStatus('SOS resolved');
      await refreshData();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleCloseOwnFromFeed(id) {
    try {
      setError('');
      const response = await api.resolveSos(auth.token, id, 'Closed by creator');
      const updated = response?.sos;
      if (updated) {
        setIncidents((prev) => normalizeActiveIncidents(upsertIncident(prev, updated)));
        setMyIncidents((prev) => (prev.some((x) => x.id === updated.id) ? upsertIncident(prev, updated) : prev));
      }
      setStatus('SOS closed successfully');
      await refreshData();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleGenerateGuidance() {
    try {
      setError('');
      const result = await api.getCrisisAssist(auth.token, {
        crisisType: selectedIncident?.crisisType || sosForm.crisisType,
        context: aiContext,
      });
      setAiOutput(result);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="min-h-screen px-4 py-8 pb-28 sm:px-8 sm:pb-32 lg:px-12">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="relative overflow-hidden rounded-[2rem] border border-slate-200 bg-white px-6 py-7 shadow-glow sm:px-10">
          <div className="absolute -left-12 -top-10 h-52 w-52 rounded-full bg-cyan-100 blur-3xl" />
          <div className="absolute right-8 top-8 h-32 w-32 rounded-full bg-rose-100 blur-2xl" />
          <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />

          <div className="relative z-10">
            <div className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1.5">
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-emerald-700">Hack de Science OJASS 2026</p>
            </div>

            <h1 className="mt-4 text-3xl font-semibold leading-tight text-slate-900 sm:text-5xl">NearHelp Crisis Response Console</h1>
            {auth.user ? (
              <>
                <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-cyan-200 bg-cyan-50 px-4 py-1.5 text-cyan-700">
                      Logged in: {auth.user.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => setAlertPrefs((p) => ({ ...p, notifications: !p.notifications }))}
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                        alertPrefs.notifications
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'border-slate-200 bg-slate-100 text-slate-600'
                      }`}
                    >
                      Alerts {alertPrefs.notifications ? 'On' : 'Off'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAlertPrefs((p) => ({ ...p, sound: !p.sound }))}
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                        alertPrefs.sound
                          ? 'border-sky-200 bg-sky-50 text-sky-700'
                          : 'border-slate-200 bg-slate-100 text-slate-600'
                      }`}
                    >
                      Sound {alertPrefs.sound ? 'On' : 'Off'}
                    </button>
                  </div>
                  <button
                    onClick={logout}
                    className="rounded-full border border-slate-300 bg-white px-4 py-1.5 font-medium text-slate-800 transition hover:border-slate-400 hover:bg-slate-100"
                  >
                    Logout
                  </button>
                </div>

                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <StatBox label="Active Users" value={stats?.activeUsers ?? 0} tone="emerald" />
                    <StatBox label="Active Issues" value={stats?.activeIssues ?? 0} tone="rose" />
                    <StatBox label="Resolved Today" value={stats?.resolvedToday ?? 0} tone="sky" />
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </header>

        {!auth.token ? (
          <SectionCard title="Account Access" subtitle="Single registration type for all users">
            <div className="mb-4 flex gap-2">
              <button
                type="button"
                onClick={() => setAuthMode('register')}
                className={`rounded-lg px-3 py-2 text-sm font-medium ${authMode === 'register' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700'}`}
              >
                Register
              </button>
              <button
                type="button"
                onClick={() => setAuthMode('login')}
                className={`rounded-lg px-3 py-2 text-sm font-medium ${authMode === 'login' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700'}`}
              >
                Login
              </button>
            </div>

            <form onSubmit={handleAuthSubmit} className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {authMode === 'register' ? (
                <input
                  className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-800"
                  placeholder="Name"
                  value={authForm.name}
                  onChange={(e) => setAuthForm((f) => ({ ...f, name: e.target.value }))}
                />
              ) : null}
              <input
                className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-800"
                placeholder="Email"
                type="email"
                value={authForm.email}
                onChange={(e) => setAuthForm((f) => ({ ...f, email: e.target.value }))}
              />
              <input
                className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-800"
                placeholder="Password"
                type="password"
                value={authForm.password}
                onChange={(e) => setAuthForm((f) => ({ ...f, password: e.target.value }))}
              />
              {authMode === 'register' ? (
                <input
                  className="md:col-span-2 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-800"
                  placeholder="Skills (optional, comma-separated)"
                  value={authForm.skills}
                  onChange={(e) => setAuthForm((f) => ({ ...f, skills: e.target.value }))}
                />
              ) : null}
              <div className="md:col-span-2 flex flex-wrap gap-2">
                <button className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500" type="submit">
                  {authMode === 'register' ? 'Create Account' : 'Login'}
                </button>
              </div>
            </form>
          </SectionCard>
        ) : (
          <>
            <nav className="flex flex-wrap gap-2">
              <NavLink to="/sos" className={({ isActive }) => `rounded-xl px-4 py-2 text-sm font-semibold ${isActive ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-700'}`}>
                Send SOS
              </NavLink>
              <NavLink to="/respond" className={({ isActive }) => `rounded-xl px-4 py-2 text-sm font-semibold ${isActive ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700'}`}>
                Respond
              </NavLink>
            </nav>

            {status ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">{status}</p> : null}
            {error ? <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</p> : null}

            <Routes>
              <Route
                path="/"
                element={<Navigate to="/sos" replace />}
              />
              <Route
                path="/sos"
                element={
                  <SendSosPage
                    incidents={incidents}
                    myIncidents={myIncidents}
                    authUserId={auth.user?.id}
                    selectedIncident={selectedIncident}
                    selectedIncidentId={selectedIncidentId}
                    setSelectedIncidentId={setSelectedIncidentId}
                    sosForm={sosForm}
                    setSosForm={setSosForm}
                    handleCreateSos={handleCreateSos}
                    handleUseMyLocation={handleUseMyLocation}
                    handleCloseOwnFromFeed={handleCloseOwnFromFeed}
                  />
                }
              />
              <Route
                path="/respond"
                element={
                  <RespondPage
                    incidents={responderIncidents}
                    selectedIncident={selectedResponderIncident}
                    selectedIncidentId={selectedIncidentId}
                    setSelectedIncidentId={setSelectedIncidentId}
                    hasJoinedSelectedIncident={hasJoinedSelectedIncident}
                    handleRespond={handleRespond}
                    resolveNote={resolveNote}
                    setResolveNote={setResolveNote}
                    handleResolve={handleResolve}
                    sosForm={sosForm}
                    aiContext={aiContext}
                    setAiContext={setAiContext}
                    aiOutput={aiOutput}
                    handleGenerateGuidance={handleGenerateGuidance}
                  />
                }
              />
            </Routes>
          </>
        )}

        <footer className="pb-4 text-center text-xs text-slate-500">
          NearHelp: route-based workflow with a single user account type.
        </footer>
      </div>
      <EmergencyCallDock />
    </div>
  );
}

function SendSosPage({
  incidents,
  myIncidents,
  authUserId,
  selectedIncident,
  selectedIncidentId,
  setSelectedIncidentId,
  sosForm,
  setSosForm,
  handleCreateSos,
  handleUseMyLocation,
  handleCloseOwnFromFeed,
}) {
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
      <div className="space-y-6 xl:col-span-2">
        <SectionCard tone="danger" title="Send SOS" subtitle="Create and broadcast emergency request">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="space-y-3">
              <label className="block text-sm text-slate-600">Crisis Type</label>
              <select
                className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-800"
                value={sosForm.crisisType}
                onChange={(e) => setSosForm((f) => ({ ...f, crisisType: e.target.value }))}
              >
                {crisisOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>

              <label className="block text-sm text-slate-600">Broadcast Radius</label>
              <div className="flex flex-wrap gap-2">
                {radiusOptions.map((r) => (
                  <button
                    key={r}
                    onClick={() => setSosForm((f) => ({ ...f, radiusMeters: r }))}
                    className={`rounded-lg px-4 py-2 text-sm font-medium ${sosForm.radiusMeters === r ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-700'}`}
                    type="button"
                  >
                    {r / 1000 >= 1 ? `${r / 1000}km` : `${r}m`}
                  </button>
                ))}
              </div>

              <input
                className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-800"
                placeholder="Address"
                value={sosForm.address}
                onChange={(e) => setSosForm((f) => ({ ...f, address: e.target.value }))}
              />

              <button type="button" onClick={handleUseMyLocation} className="w-full rounded-xl border border-emerald-500/50 bg-emerald-500/15 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-500/25">
                Use My Live Location
              </button>

              <div className="grid grid-cols-2 gap-2">
                <input
                  className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-800"
                  placeholder="Latitude"
                  type="number"
                  value={sosForm.lat}
                  onChange={(e) => setSosForm((f) => ({ ...f, lat: e.target.value }))}
                />
                <input
                  className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-800"
                  placeholder="Longitude"
                  type="number"
                  value={sosForm.lng}
                  onChange={(e) => setSosForm((f) => ({ ...f, lng: e.target.value }))}
                />
              </div>

              <textarea
                className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-800"
                rows={3}
                placeholder="Short description"
                value={sosForm.description}
                onChange={(e) => setSosForm((f) => ({ ...f, description: e.target.value }))}
              />

              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={sosForm.anonymous} onChange={(e) => setSosForm((f) => ({ ...f, anonymous: e.target.checked }))} />
                Anonymous SOS
              </label>

              <button onClick={handleCreateSos} className="mt-1 w-full rounded-xl bg-danger px-4 py-3 font-semibold text-white hover:bg-rose-500" type="button">
                Broadcast Live SOS
              </button>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="mb-3 flex items-center justify-between">
                <h4 className="text-sm font-semibold text-slate-800">Live Incident Map</h4>
                <span className="rounded-full bg-emerald-400/20 px-3 py-1 text-xs text-emerald-700">{incidents.length} active incidents</span>
              </div>
              <LiveIncidentMap
                incidents={incidents}
                selectedIncidentId={selectedIncident?.id || ''}
                onSelectIncident={setSelectedIncidentId}
                draftLocation={{ lat: Number(sosForm.lat), lng: Number(sosForm.lng), radiusMeters: Number(sosForm.radiusMeters) }}
              />
            </div>
          </div>
        </SectionCard>
      </div>

      <div className="space-y-6">
        <SectionCard title="Active SOS Feed" subtitle="Live active incidents">
          <div className="space-y-3">
            {incidents.length ? incidents.map((item) => (
              <button
                key={item.id}
                className={`w-full rounded-xl border p-3 text-left ${selectedIncidentId === item.id ? 'border-rose-500 bg-rose-500/10' : 'border-slate-200 bg-white'}`}
                onClick={() => setSelectedIncidentId(item.id)}
                type="button"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-rose-700">{item.id}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">{item.status}</span>
                    {String(item.createdBy?.id || '') === String(authUserId || '') ? (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCloseOwnFromFeed(item.id);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            e.stopPropagation();
                            handleCloseOwnFromFeed(item.id);
                          }
                        }}
                        className="rounded-full border border-rose-300 bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 hover:bg-rose-100"
                      >
                        Close
                      </span>
                    ) : null}
                  </div>
                </div>
                <p className="mt-1 text-sm text-slate-800">{item.crisisType}</p>
                <p className="text-xs text-slate-500">{item.location.address || `${item.location.lat}, ${item.location.lng}`}</p>
              </button>
            )) : <p className="text-sm text-slate-500">No active SOS incidents.</p>}
          </div>
        </SectionCard>

        <SectionCard title="My Requests" subtitle="All your requests with status">
          <div className="mb-3 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg border border-slate-200 bg-white p-3 text-slate-700">Active: {myIncidents.filter((item) => item.status === 'active').length}</div>
            <div className="rounded-lg border border-slate-200 bg-white p-3 text-slate-700">Resolved: {myIncidents.filter((item) => item.status === 'resolved').length}</div>
          </div>
          {myIncidents.length ? (
            <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Incident</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Responders</th>
                  </tr>
                </thead>
                <tbody>
                  {myIncidents.map((item) => (
                    <tr key={item.id} className="border-t border-slate-200 text-slate-700">
                      <td className="px-3 py-2">{item.id.slice(-8)}</td>
                      <td className="px-3 py-2">{item.crisisType}</td>
                      <td className="px-3 py-2">{item.status}</td>
                      <td className="px-3 py-2">{item.responders?.length || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-slate-500">No requests created yet.</p>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

function RespondPage({
  incidents,
  selectedIncident,
  selectedIncidentId,
  setSelectedIncidentId,
  hasJoinedSelectedIncident,
  handleRespond,
  resolveNote,
  setResolveNote,
  handleResolve,
  sosForm,
  aiContext,
  setAiContext,
  aiOutput,
  handleGenerateGuidance,
}) {
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-4">
      <div className="space-y-6 xl:col-span-3">
        <SectionCard tone="success" title="Responder Flow" subtitle="Join selected SOS and coordinate live">
          {selectedIncident ? (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
                <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">Selected: {selectedIncident.id}</span>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">{selectedIncident.crisisType}</span>
                <button onClick={() => handleRespond(selectedIncident.id)} className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-500" type="button">
                  {hasJoinedSelectedIncident ? 'Responding' : "I'm Responding"}
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-slate-500">
                    <tr className="border-b border-slate-200">
                      <th className="py-2">Responder</th>
                      <th className="py-2">Trust Score</th>
                      <th className="py-2">Skills</th>
                      <th className="py-2">Verified</th>
                      <th className="py-2">Live Location</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedIncident.responders.length ? selectedIncident.responders.map((responder) => (
                      <tr key={responder.id} className="border-b border-slate-200 text-slate-700">
                        <td className="py-2">{responder.name}</td>
                        <td className="py-2">{Number(responder.trustScore).toFixed(1)}</td>
                        <td className="py-2">{responder.skills?.join(', ') || '-'}</td>
                        <td className="py-2">{responder.verified ? 'Yes' : 'No'}</td>
                        <td className="py-2">{formatResponderLocation(selectedIncident, responder.id)}</td>
                      </tr>
                    )) : (
                      <tr><td className="py-3 text-slate-500" colSpan={5}>No responders yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <input
                  className="flex-1 rounded-xl border border-slate-200 bg-white p-2 text-sm text-slate-800"
                  placeholder="Resolution note"
                  value={resolveNote}
                  onChange={(e) => setResolveNote(e.target.value)}
                />
                <button onClick={() => handleResolve(selectedIncident.id)} className="rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400" type="button">
                  Mark Resolved
                </button>
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-500">No active incident selected.</p>
          )}
        </SectionCard>

        <SectionCard tone="success" title="Live Rescue Map" subtitle="Patient and all helper locations">
          <LiveIncidentMap
            incidents={incidents}
            selectedIncidentId={selectedIncident?.id || ''}
            onSelectIncident={setSelectedIncidentId}
            draftLocation={{ lat: Number(sosForm.lat), lng: Number(sosForm.lng), radiusMeters: Number(sosForm.radiusMeters) }}
          />
        </SectionCard>

        <SectionCard tone="warn" title="AI Crisis Assistant" subtitle="Guidance for selected emergency">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div>
              <label className="text-sm text-slate-600">Crisis Context</label>
              <textarea className="mt-2 h-36 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-800" value={aiContext} onChange={(e) => setAiContext(e.target.value)} />
              <button className="mt-3 rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400" type="button" onClick={handleGenerateGuidance}>
                Generate Guidance
              </button>
            </div>
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-700">
              <p className="font-semibold">AI Output</p>
              {aiOutput?.guidance?.length ? (
                <>
                  {aiOutput.guidance.map((item) => <p key={item} className="mt-2">- {item}</p>)}
                  <div className="mt-3 rounded-lg bg-white p-3 text-xs text-slate-700">{aiOutput.summary}</div>
                </>
              ) : <p className="mt-2 text-amber-700/80">Generate guidance to see response steps.</p>}
            </div>
          </div>
        </SectionCard>
      </div>

      <div className="space-y-6">
        <SectionCard title="Active SOS Feed" subtitle="Select incident to respond">
          <div className="space-y-3">
            {incidents.length ? incidents.map((item) => (
              <button
                key={item.id}
                className={`w-full rounded-xl border p-3 text-left ${selectedIncidentId === item.id ? 'border-rose-500 bg-rose-500/10' : 'border-slate-200 bg-white'}`}
                onClick={() => setSelectedIncidentId(item.id)}
                type="button"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-rose-700">{item.id}</p>
                  <span className="text-xs text-slate-500">{item.status}</span>
                </div>
                <p className="mt-1 text-sm text-slate-800">{item.crisisType}</p>
                <p className="text-xs text-slate-500">{item.location.address || `${item.location.lat}, ${item.location.lng}`}</p>
                <p className="mt-1 text-xs text-emerald-700">Radius: {item.radiusMeters}m</p>
              </button>
            )) : <p className="text-sm text-slate-500">No active SOS incidents.</p>}
          </div>
        </SectionCard>

        <SectionCard title="Skill Registry & Resources" subtitle="Nearby emergency resources and responders">
          <ul className="space-y-2 text-sm text-slate-700">
            {resources.map((resource) => (
              <li key={resource} className="rounded-lg border border-slate-200 bg-white p-3">{resource}</li>
            ))}
            {selectedIncident?.responders?.length ? selectedIncident.responders.map((responder) => (
              <li key={responder.id} className="rounded-lg border border-emerald-600/40 bg-emerald-500/10 p-3">
                {responder.name} - {responder.skills?.join(', ') || 'General responder'}
              </li>
            )) : null}
          </ul>
        </SectionCard>
      </div>
    </div>
  );
}

function normalizeActiveIncidents(incidents) {
  return incidents.filter((item) => item.status === 'active');
}

function upsertIncident(items, incoming) {
  const exists = items.some((item) => item.id === incoming.id);
  if (!exists) return [incoming, ...items];
  return items.map((item) => (item.id === incoming.id ? incoming : item));
}

function StatBox({ label, value, tone }) {
  const toneClass = {
    emerald: 'text-emerald-700 border-emerald-200 bg-emerald-50',
    rose: 'text-rose-700 border-rose-200 bg-rose-50',
    sky: 'text-sky-700 border-sky-200 bg-sky-50',
  }[tone];

  return (
    <div className={`rounded-xl border p-3 backdrop-blur-sm ${toneClass}`}>
      <p className="text-xs uppercase tracking-wide text-slate-600">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function formatResponderLocation(incident, responderId) {
  const entry = incident?.responderLocations?.find((item) => String(item.responderId) === String(responderId));
  if (!entry || !Number.isFinite(entry.lat) || !Number.isFinite(entry.lng)) return 'Not shared';
  return `${entry.lat.toFixed(4)}, ${entry.lng.toFixed(4)}`;
}

function getCurrentLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({ lat: Number(position.coords.latitude), lng: Number(position.coords.longitude) });
      },
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 4000 }
    );
  });
}

function requestNotificationPermission() {
  if (!('Notification' in window)) {
    return;
  }

  if (Notification.permission === 'default') {
    Notification.requestPermission().catch(() => {});
  }
}

function triggerSosAlert(incident, context) {
  const { alertPrefs, userLocation } = context;
  const incidentLat = Number(incident.location?.lat);
  const incidentLng = Number(incident.location?.lng);
  const incidentRadius = Number(incident.radiusMeters || 2000);

  let isNearby = true;
  if (userLocation && Number.isFinite(incidentLat) && Number.isFinite(incidentLng)) {
    const distance = haversineMeters(userLocation.lat, userLocation.lng, incidentLat, incidentLng);
    isNearby = distance <= Math.max(incidentRadius, 2000);
  }

  if (!isNearby) {
    return;
  }

  if (alertPrefs.notifications && 'Notification' in window && Notification.permission === 'granted') {
    const title = 'Nearby SOS Alert';
    const body = `${incident.crisisType || 'Emergency'} at ${incident.location?.address || 'nearby area'}`;
    new Notification(title, { body, tag: `sos-${incident.id}` });
  }

  if (alertPrefs.sound) {
    playAlertTone();
  }
}

function playAlertTone() {
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) {
    return;
  }

  const ctx = new AudioContextCtor();
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();

  oscillator.type = 'sine';
  oscillator.frequency.value = 880;
  gainNode.gain.value = 0.0001;
  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);

  const now = ctx.currentTime;
  gainNode.gain.exponentialRampToValueAtTime(0.2, now + 0.02);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
  oscillator.start(now);
  oscillator.stop(now + 0.55);
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const toRad = (v) => (v * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
