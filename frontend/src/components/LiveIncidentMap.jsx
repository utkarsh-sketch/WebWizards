import { useEffect, useMemo } from 'react';
import L from 'leaflet';
import { Circle, CircleMarker, MapContainer, Popup, TileLayer, Tooltip, useMap } from 'react-leaflet';

const defaultCenter = [30.7415, 76.7681];

export default function LiveIncidentMap({ incidents, selectedIncidentId, onSelectIncident, draftLocation }) {
  const positions = useMemo(
    () =>
      incidents
        .map((incident) => ({
          id: incident.id,
          lat: Number(incident.location?.lat),
          lng: Number(incident.location?.lng),
          crisisType: incident.crisisType,
          address: incident.location?.address || 'Unknown location',
          radiusMeters: Number(incident.radiusMeters || 1000),
          respondersCount: incident.responders?.length || 0,
          respondersList: Array.isArray(incident.responders) ? incident.responders : [],
          responderLocations: incident.responderLocations || [],
          createdByName: incident.createdBy?.name || 'Patient',
          anonymous: Boolean(incident.anonymous),
        }))
        .filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng)),
    [incidents]
  );

  const selected = positions.find((item) => item.id === selectedIncidentId) || positions[0] || null;
  const helperMarkers = useMemo(() => {
    if (!selected) {
      return [];
    }

    const locationByResponderId = new Map(
      (selected.responderLocations || [])
        .filter((entry) => Number.isFinite(Number(entry.lat)) && Number.isFinite(Number(entry.lng)))
        .map((entry) => [String(entry.responderId), { lat: Number(entry.lat), lng: Number(entry.lng) }])
    );

    return (selected.respondersList || []).map((responder, index) => {
      const responderId = String(responder.id);
      const located = locationByResponderId.get(responderId);

      if (located) {
        return {
          key: responderId,
          name: responder.name || 'Responder',
          lat: located.lat,
          lng: located.lng,
          pending: false,
        };
      }

      const offset = 0.00035 + index * 0.00012;
      return {
        key: responderId,
        name: responder.name || 'Responder',
        lat: selected.lat + offset,
        lng: selected.lng + offset,
        pending: true,
      };
    });
  }, [selected]);

  return (
    <div className="relative h-72 overflow-hidden rounded-xl border border-slate-200">
      <MapContainer
        center={selected ? [selected.lat, selected.lng] : defaultCenter}
        zoom={13}
        className="h-full w-full"
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <FitToIncidents positions={positions} />

        {positions.map((item) => (
          <CircleMarker
            key={item.id}
            center={[item.lat, item.lng]}
            radius={10}
            pathOptions={{ color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.95, weight: 2 }}
            eventHandlers={{ click: () => onSelectIncident(item.id) }}
          >
            <Tooltip permanent direction="top" offset={[0, -12]}>
              {item.anonymous ? 'Patient (Anonymous)' : `Patient: ${item.createdByName}`}
            </Tooltip>
            <Popup>
              <div className="space-y-1 text-xs">
                <p className="font-semibold">{item.crisisType}</p>
                <p>{item.address}</p>
                <p>Radius: {item.radiusMeters}m</p>
                <p>Responders: {item.respondersCount}</p>
              </div>
            </Popup>
          </CircleMarker>
        ))}

        {selected ? (
          <Circle
            center={[selected.lat, selected.lng]}
            radius={selected.radiusMeters}
            pathOptions={{ color: '#f43f5e', fillColor: '#f43f5e', fillOpacity: 0.15 }}
          />
        ) : null}

        {helperMarkers.map((entry) => {
          return (
            <CircleMarker
              key={`${selected.id}-responder-${entry.key}`}
              center={[entry.lat, entry.lng]}
              radius={8}
              pathOptions={{
                color: entry.pending ? '#f59e0b' : '#22c55e',
                fillColor: entry.pending ? '#f59e0b' : '#16a34a',
                fillOpacity: 0.95,
                dashArray: entry.pending ? '2 3' : undefined,
              }}
            >
              <Tooltip permanent direction="right" offset={[10, 0]}>
                {entry.pending ? `Helper: ${entry.name} (location pending)` : `Helper: ${entry.name}`}
              </Tooltip>
              <Popup>
                <div className="space-y-1 text-xs">
                  <p className="font-semibold">Helper: {entry.name}</p>
                  <p>{entry.pending ? 'Live location pending permission' : `${entry.lat.toFixed(5)}, ${entry.lng.toFixed(5)}`}</p>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}

        {Number.isFinite(draftLocation.lat) && Number.isFinite(draftLocation.lng) ? (
          <Circle
            center={[draftLocation.lat, draftLocation.lng]}
            radius={Number(draftLocation.radiusMeters || 1000)}
            pathOptions={{ color: '#22c55e', fillColor: '#22c55e', fillOpacity: 0.08, dashArray: '4 6' }}
          />
        ) : null}
      </MapContainer>
      <div className="pointer-events-none absolute left-3 top-3 rounded-lg border border-slate-200 bg-white/90 px-2 py-1 text-[10px] text-slate-700 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-rose-500" />
          <span>Patient</span>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
          <span>Helper</span>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500" />
          <span>Helper (location pending)</span>
        </div>
      </div>
    </div>
  );
}

function FitToIncidents({ positions }) {
  const map = useMap();

  useEffect(() => {
    if (!positions.length) {
      return;
    }

    if (positions.length === 1) {
      map.setView([positions[0].lat, positions[0].lng], 14);
      return;
    }

    const bounds = L.latLngBounds(positions.map((item) => [item.lat, item.lng]));
    map.fitBounds(bounds.pad(0.25));
  }, [map, positions]);

  return null;
}
