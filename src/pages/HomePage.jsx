import { useState, useEffect } from "react";
import { fetchEvents, fetchEventMatches } from "../lib/api";

const DEFAULT_EVENT_KEY = "2026caasv";
const DEFAULT_EVENT_CODE = "caasv";
const DEFAULT_EVENT_LABEL = "CA District Aerospace Valley Event";

function formatEventLabel(event) {
  if (!event) {
    return DEFAULT_EVENT_LABEL;
  }

  return event.city ? `${event.name} (${event.city})` : event.name;
}

function isAerospaceValleyEvent(event) {
  const key = String(event.key || "").toLowerCase();
  const eventCode = String(event.event_code || "").toLowerCase();
  const name = String(event.name || "").toLowerCase();

  return (
    key === DEFAULT_EVENT_KEY ||
    eventCode === DEFAULT_EVENT_CODE ||
    name.includes("district aerospace valley event")
  );
}

function HomePage({ onNavigate }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(localStorage.getItem("selectedEvent") || "");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  async function loadEvents(year = 2026) {
    try {
      setLoading(true);
      setError("");
      
      const data = await fetchEvents(year);
      
      if (!data || data.length === 0) {
        if (year === 2026) {
          console.log("No 2026 events, trying 2025...");
          loadEvents(2025); // Fallback to 2025 to test connection
        } else {
          setError(`No events found for ${year}.`);
        }
      } else {
        setEvents(data.sort((a, b) => new Date(a.start_date) - new Date(b.start_date)));
      }
    } catch (e) {
      console.error(e);
      setError(e.message || "Failed to load events.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (events.length === 0 && !error) loadEvents();
  }, []);

  function findDefaultEvent(eventList) {
    return eventList.find(isAerospaceValleyEvent);
  }

  async function syncSelectedEvent(key) {
    setSelectedEvent(key);
    if (!key) {
      localStorage.removeItem("selectedEvent");
      localStorage.removeItem("matchSchedule");
      return;
    }

    setStatus("Fetching schedule...");
    try {
      const matches = await fetchEventMatches(key);
      localStorage.setItem("selectedEvent", key);
      localStorage.setItem("matchSchedule", JSON.stringify(matches));
      setStatus("Schedule synced!");
    } catch (err) {
      setStatus("Error fetching schedule");
    }
  }

  useEffect(() => {
    function retryAfterSignIn() {
      if (selectedEvent) syncSelectedEvent(selectedEvent);
      else loadEvents();
    }
    window.addEventListener("morscout-session-restored", retryAfterSignIn);
    return () => window.removeEventListener("morscout-session-restored", retryAfterSignIn);
  }, [selectedEvent]);

  useEffect(() => {
    if (events.length === 0) return;

    const defaultEvent = findDefaultEvent(events);
    if (!defaultEvent) {
      setError(`Could not find ${DEFAULT_EVENT_LABEL} in TBA.`);
      return;
    }

    if (selectedEvent !== defaultEvent.key) {
      syncSelectedEvent(defaultEvent.key);
    }
  }, [events, selectedEvent]);

  const activeEvent =
    events.find((event) => event.key === selectedEvent) ||
    findDefaultEvent(events) ||
    null;

  return (
    <section className="home-page" style={{ display: 'grid', gap: '2rem' }}>
      <div className="form" style={{ padding: '1.2rem' }}>
        <h3 style={{ fontSize: '0.9rem', marginBottom: '0.8rem' }}>📍 Competition Context</h3>
        
        <label>
          Active Event
          <input
            value={loading && !activeEvent ? "Loading event..." : formatEventLabel(activeEvent)}
            readOnly
            style={{ opacity: 0.9 }}
          />
        </label>

        {error && (
          <div style={{ marginTop: '1rem', display: 'grid', gap: '0.5rem' }}>
            <p style={{ fontSize: '0.8rem', color: '#ff4d4d' }}>⚠️ {error}</p>
            <button 
              className="primary-button" 
              style={{ padding: '0.5rem', fontSize: '0.8rem' }} 
              onClick={() => loadEvents()}
            >
              Retry Load
            </button>
          </div>
        )}
        
        {status && <p style={{ fontSize: '0.8rem', color: 'var(--accent)', margin: '0.5rem 0 0' }}>{status}</p>}
        {status === "Error fetching schedule" && selectedEvent && (
          <button type="button" className="secondary-button" onClick={() => syncSelectedEvent(selectedEvent)}>Retry Schedule</button>
        )}
      </div>

      <div className="card-grid">
        <button type="button" className="feature-card" onClick={() => onNavigate("pit")}>
          <h3>Pit Scouting</h3>
          <p>Capture robot specs & photos.</p>
        </button>
        <button type="button" className="feature-card" onClick={() => onNavigate("match")}>
          <h3>Match Scouting</h3>
          <p>Real-time match performance tracking.</p>
        </button>
        <button type="button" className="feature-card" onClick={() => onNavigate("rankings")}>
          <h3>Rankings</h3>
          <p>Aggregated team stats and pick lists.</p>
        </button>
      </div>
    </section>
  );
}

export default HomePage;
