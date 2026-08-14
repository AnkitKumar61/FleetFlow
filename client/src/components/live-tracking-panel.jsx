import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, LocateFixed, Navigation, Radio, Square } from 'lucide-react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { api } from '../lib/api.js';

const DRIVER_TRACKING_STATUSES = ['accepted', 'picked_up', 'in_transit'];
const TERMINAL_STATUSES = ['delivered', 'cancelled', 'failed', 'rescheduled'];
const SEND_INTERVAL_MS = 10000;

function formatTime(value) {
  if (!value) return 'No location received';
  return new Intl.DateTimeFormat('en-IN', { timeStyle: 'short' }).format(new Date(value));
}

function locationState(location, now, trackingEnded) {
  if (!location) return { label: 'Waiting for driver', tone: 'waiting', detail: 'Tracking has not started.' };
  if (trackingEnded) return { label: 'Tracking ended', tone: 'offline', detail: `Last update ${formatTime(location.updatedAt)}` };
  const ageSeconds = Math.max(0, Math.round((now - new Date(location.updatedAt).getTime()) / 1000));
  if (!location.sharing) return { label: 'Sharing stopped', tone: 'offline', detail: `Last update ${formatTime(location.updatedAt)}` };
  if (ageSeconds <= 45) return { label: 'Live location', tone: 'live', detail: `Updated ${ageSeconds || 'just'}${ageSeconds ? ' seconds' : ''} ago` };
  if (ageSeconds <= 120) return { label: 'Weak connection', tone: 'waiting', detail: `Last update ${formatTime(location.updatedAt)}` };
  return { label: 'Driver offline', tone: 'offline', detail: `Last update ${formatTime(location.updatedAt)}` };
}

function DriverMap({ location }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const [mapFailed, setMapFailed] = useState(false);
  const hasCoordinates = Number.isFinite(location?.latitude) && Number.isFinite(location?.longitude);
  const mapUrl = hasCoordinates ? `https://www.openstreetmap.org/?mlat=${location.latitude}&mlon=${location.longitude}#map=16/${location.latitude}/${location.longitude}` : '';

  useEffect(() => {
    if (!hasCoordinates || !containerRef.current || mapRef.current) return undefined;
    if (navigator.userAgent.toLowerCase().includes('jsdom')) {
      setMapFailed(true);
      return undefined;
    }
    try {
      const canvas = document.createElement('canvas');
      if (!canvas.getContext('webgl2') && !canvas.getContext('webgl')) {
        setMapFailed(true);
        return undefined;
      }
    } catch {
      setMapFailed(true);
      return undefined;
    }
    const center = [location.longitude, location.latitude];
    let map;
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        center,
        zoom: 14,
        attributionControl: true,
        style: {
          version: 8,
          sources: {
            openStreetMap: {
              type: 'raster',
              tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
              tileSize: 256,
              attribution: '&copy; OpenStreetMap contributors'
            }
          },
          layers: [{ id: 'openStreetMap', type: 'raster', source: 'openStreetMap' }]
        }
      });
    } catch {
      setMapFailed(true);
      return undefined;
    }
    const markerElement = document.createElement('div');
    markerElement.className = 'driver-map-marker';
    markerElement.setAttribute('aria-label', 'Driver location');
    markerRef.current = new maplibregl.Marker({ element: markerElement }).setLngLat(center).addTo(map);
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    mapRef.current = map;
    return () => {
      markerRef.current = null;
      mapRef.current = null;
      map.remove();
    };
  }, [hasCoordinates]);

  useEffect(() => {
    if (!hasCoordinates || !mapRef.current || !markerRef.current) return;
    const center = [location.longitude, location.latitude];
    markerRef.current.setLngLat(center);
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    mapRef.current.easeTo({ center, duration: reduceMotion ? 0 : 700 });
  }, [hasCoordinates, location?.latitude, location?.longitude]);

  if (!hasCoordinates) return <div className="tracking-map tracking-map--empty"><LocateFixed /><strong>Map waiting for GPS</strong><span>The driver must allow location access and start sharing.</span></div>;
  if (mapFailed) return <div className="tracking-map tracking-map--empty"><LocateFixed /><strong>Map preview is not supported</strong><span>The saved GPS position is still available.</span><a href={mapUrl} target="_blank" rel="noreferrer">Open location in OpenStreetMap <ExternalLink /></a></div>;
  return <div className="tracking-map-wrap">
    <div ref={containerRef} className="tracking-map" aria-label="Map showing the driver's latest location" />
    <a className="tracking-map-link" href={mapUrl} target="_blank" rel="noreferrer">Open larger map <ExternalLink /></a>
  </div>;
}

export function LiveTrackingPanel({ delivery, user, onLocation }) {
  const [now, setNow] = useState(Date.now());
  const [tracking, setTracking] = useState(false);
  const [trackingMessage, setTrackingMessage] = useState('');
  const watchIdRef = useRef(null);
  const lastSentRef = useRef(0);
  const sendingRef = useRef(false);
  const trackingRef = useRef(false);
  const location = delivery.liveLocation;
  const trackingEnded = TERMINAL_STATUSES.includes(delivery.status);
  const state = useMemo(() => locationState(location, now, trackingEnded), [location, now, trackingEnded]);
  const canDriverTrack = user.role === 'driver' && DRIVER_TRACKING_STATUSES.includes(delivery.status);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15000);
    return () => window.clearInterval(timer);
  }, []);

  const clearWatch = useCallback(() => {
    if (watchIdRef.current !== null && navigator.geolocation) navigator.geolocation.clearWatch(watchIdRef.current);
    watchIdRef.current = null;
  }, []);

  const publishPosition = useCallback(async (position) => {
    const timestamp = Date.now();
    if (sendingRef.current || timestamp - lastSentRef.current < SEND_INTERVAL_MS) return;
    sendingRef.current = true;
    try {
      const { latitude, longitude, accuracy, speed, heading } = position.coords;
      const { data } = await api.patch(`/deliveries/${delivery._id}/location`, {
        sharing: true,
        latitude,
        longitude,
        accuracyMeters: accuracy,
        ...(Number.isFinite(speed) && { speedKph: speed * 3.6 }),
        ...(Number.isFinite(heading) && { headingDegrees: heading })
      });
      lastSentRef.current = timestamp;
      setTrackingMessage('Your live location is being shared securely.');
      onLocation(data.data);
    } catch (error) {
      setTrackingMessage(error.response?.data?.error?.message ?? 'Location could not reach FleetFlow. Keep this page open and check your internet.');
    } finally {
      sendingRef.current = false;
    }
  }, [delivery._id, onLocation]);

  const stopTracking = useCallback(async () => {
    clearWatch();
    trackingRef.current = false;
    setTracking(false);
    try {
      const { data } = await api.patch(`/deliveries/${delivery._id}/location`, { sharing: false });
      onLocation(data.data);
      setTrackingMessage('Location sharing stopped.');
    } catch (error) {
      setTrackingMessage(error.response?.data?.error?.message ?? 'Tracking stopped on this phone, but FleetFlow could not confirm it.');
    }
  }, [clearWatch, delivery._id, onLocation]);

  const startTracking = () => {
    setTrackingMessage('');
    if (!navigator.geolocation) {
      setTrackingMessage('This browser does not support GPS location. Try a current mobile browser.');
      return;
    }
    trackingRef.current = true;
    setTracking(true);
    setTrackingMessage('Waiting for GPS permission and the first location...');
    watchIdRef.current = navigator.geolocation.watchPosition(
      publishPosition,
      (error) => {
        clearWatch();
        trackingRef.current = false;
        setTracking(false);
        const messages = {
          1: 'Location permission was denied. Allow location for FleetFlow in your browser settings.',
          2: 'Your phone could not find its location. Turn on GPS and try again.',
          3: 'GPS took too long to respond. Move to an open area and try again.'
        };
        setTrackingMessage(messages[error.code] ?? 'Live location could not start.');
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
  };

  useEffect(() => () => {
    clearWatch();
    if (trackingRef.current) api.patch(`/deliveries/${delivery._id}/location`, { sharing: false }).catch(() => {});
  }, [clearWatch, delivery._id]);

  return <section className="tracking-panel" aria-labelledby="live-tracking-title">
    <header className="tracking-heading">
      <div><h2 id="live-tracking-title">Live driver tracking</h2><p>Location is visible only to this customer, the assigned driver and Admin.</p></div>
      <div className={`tracking-signal tracking-signal--${state.tone}`}><span /><div><strong>{state.label}</strong><small>{state.detail}</small></div></div>
      {canDriverTrack && (tracking
        ? <button className="button button--secondary" type="button" onClick={stopTracking}><Square /> Stop sharing</button>
        : <button className="button" type="button" onClick={startTracking}><Radio /> Start live tracking</button>)}
    </header>
    <div className="tracking-body">
      <DriverMap location={location} />
      <aside className="tracking-readout" aria-label="Latest driver location information">
        <Navigation />
        <div><span>Assigned driver</span><strong>{delivery.assignedDriver?.user?.name ?? 'Driver assigned'}</strong></div>
        <div><span>Last GPS update</span><strong>{formatTime(location?.updatedAt)}</strong></div>
        <div><span>Accuracy</span><strong>{Number.isFinite(location?.accuracyMeters) ? `Within ${Math.round(location.accuracyMeters)} m` : 'Not available'}</strong></div>
        <div><span>Current speed</span><strong>{Number.isFinite(location?.speedKph) ? `${Math.round(location.speedKph)} km/h` : 'Not available'}</strong></div>
      </aside>
    </div>
    {trackingMessage && <p className="tracking-message" role="status">{trackingMessage}</p>}
  </section>;
}
