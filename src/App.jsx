import { useState, useEffect, useCallback } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, LineChart, Line } from "recharts";

const REDIRECT_URI = "https://eva-s-cheng.github.io/spotify-dashboard/";
const SCOPES = ["user-top-read", "user-read-recently-played", "user-read-private"].join(" ");

function generateCodeVerifier(length = 128) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => chars[b % chars.length]).join("");
}

async function generateCodeChallenge(verifier) {
  const d = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", d);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function fetchSpotify(endpoint, token) {
  const res = await fetch(`https://api.spotify.com/v1${endpoint}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Spotify ${res.status}`);
  return res.json();
}

const C = {
  bg: "#0D0D0D", surface: "#161616", card: "#1C1C1C", border: "#2A2A2A",
  green: "#1DB954", text: "#FFFFFF", muted: "#888", accent: "#B3FF5C",
  dim: "#333",
};
const COLORS = ["#1DB954","#B3FF5C","#FF6B6B","#4ECDC4","#FFE66D","#A29BFE","#FF9F43","#EE5A6F","#0ABDE3","#5F27CD"];

function Card({ children, style = {} }) {
  return <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: "24px", ...style }}>{children}</div>;
}
function Label({ children }) {
  return <p style={{ color: C.muted, fontSize: 11, fontFamily: "monospace", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 14, marginTop: 0 }}>{children}</p>;
}
function StatCard({ label, value, sub }) {
  return (
    <Card style={{ padding: "20px 18px" }}>
      <Label>{label}</Label>
      <div style={{ fontSize: 28, fontWeight: 800, color: C.green, fontFamily: "monospace", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>{sub}</div>}
    </Card>
  );
}

function ArtistRow({ artist, rank, extra }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
      <span style={{ color: C.muted, fontSize: 11, width: 24, textAlign: "right", fontFamily: "monospace" }}>{rank}</span>
      {artist.images?.[0] ? (
        <img src={artist.images[artist.images.length > 1 ? 1 : 0].url} alt="" style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover" }} />
      ) : (
        <div style={{ width: 36, height: 36, borderRadius: "50%", background: C.dim, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>🎤</div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: C.text, fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{artist.name}</div>
        {(artist.genres || []).length > 0 && (
          <div style={{ color: C.muted, fontSize: 10, marginTop: 1 }}>{artist.genres.slice(0, 2).join(" · ")}</div>
        )}
      </div>
      {extra && <div style={{ color: C.accent, fontSize: 11, fontFamily: "monospace", whiteSpace: "nowrap" }}>{extra}</div>}
    </div>
  );
}

function TrackRow({ track, rank, extra }) {
  const dur = track.duration_ms ? `${Math.floor(track.duration_ms / 60000)}:${String(Math.floor((track.duration_ms % 60000) / 1000)).padStart(2, "0")}` : "";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
      <span style={{ color: C.muted, fontSize: 11, width: 24, textAlign: "right", fontFamily: "monospace" }}>{rank}</span>
      {track.album?.images?.[0] ? (
        <img src={track.album.images[track.album.images.length > 1 ? 1 : 0].url} alt="" style={{ width: 36, height: 36, borderRadius: 6, objectFit: "cover" }} />
      ) : (
        <div style={{ width: 36, height: 36, borderRadius: 6, background: C.dim, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>🎵</div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: C.text, fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{track.name}</div>
        <div style={{ color: C.muted, fontSize: 10, marginTop: 1 }}>{(track.artists || []).map(a => a.name).join(", ")}</div>
      </div>
      <div style={{ color: C.muted, fontSize: 11, fontFamily: "monospace", whiteSpace: "nowrap" }}>{extra || dur}</div>
    </div>
  );
}

function formatMinutes(mins) {
  if (mins < 60) return `${Math.round(mins)}min`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return `${h}h${m > 0 ? m.toString().padStart(2, "0") : ""}`;
}

export default function App() {
  const [clientId, setClientId] = useState(() => localStorage.getItem("sp_client_id") || "");
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [timeRange, setTimeRange] = useState("medium_term");
  const [activeTab, setActiveTab] = useState("overview");
  const [setupStep, setSetupStep] = useState("input");

  // OAuth
  useEffect(() => {
    const code = sessionStorage.getItem("sp_code");
    if (!code) { setLoading(false); return; }
    const verifier = sessionStorage.getItem("sp_verifier");
    const savedId = sessionStorage.getItem("sp_client_id");
    if (!verifier || !savedId) { setLoading(false); return; }
    sessionStorage.removeItem("sp_code");
    (async () => {
      try {
        const res = await fetch("https://accounts.spotify.com/api/token", {
          method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ client_id: savedId, grant_type: "authorization_code", code, redirect_uri: REDIRECT_URI, code_verifier: verifier }),
        });
        const json = await res.json();
        if (json.access_token) { setToken(json.access_token); localStorage.setItem("sp_client_id", savedId); }
        else { setError("Erreur: " + (json.error_description || json.error)); setLoading(false); }
      } catch (e) { setError("Erreur réseau: " + e.message); setLoading(false); }
    })();
  }, []);

  // Fetch data
  useEffect(() => {
    if (!token) return;
    setLoading(true); setError(null);
    (async () => {
      try {
        // Fetch top artists (up to 99: 50 + 49)
        const [a1, a2, t1, t2, recent, profile] = await Promise.all([
          fetchSpotify(`/me/top/artists?limit=50&offset=0&time_range=${timeRange}`, token),
          fetchSpotify(`/me/top/artists?limit=49&offset=50&time_range=${timeRange}`, token).catch(() => ({ items: [] })),
          fetchSpotify(`/me/top/tracks?limit=50&offset=0&time_range=${timeRange}`, token),
          fetchSpotify(`/me/top/tracks?limit=49&offset=50&time_range=${timeRange}`, token).catch(() => ({ items: [] })),
          fetchSpotify("/me/player/recently-played?limit=50", token),
          fetchSpotify("/me", token),
        ]);

        const topArtists = [...(a1.items || []), ...(a2.items || [])];
        const topTracks = [...(t1.items || []), ...(t2.items || [])];
        const recentItems = recent.items || [];

        // Genre aggregation
        const genreCounts = {};
        topArtists.forEach(a => (a.genres || []).forEach(g => { genreCounts[g] = (genreCounts[g] || 0) + 1; }));
        const topGenres = Object.entries(genreCounts).sort((a, b) => b[1] - a[1]).slice(0, 10)
          .map(([name, count]) => ({ name: name.length > 20 ? name.slice(0, 18) + "\u2026" : name, count }));

        // Listening time from recent plays
        const totalRecentMs = recentItems.reduce((s, item) => s + (item.track?.duration_ms || 0), 0);
        const totalRecentMin = totalRecentMs / 60000;

        // Artist listening time from recent
        const artistTimeMap = {};
        recentItems.forEach(item => {
          const track = item.track;
          if (!track) return;
          const durMin = (track.duration_ms || 0) / 60000;
          (track.artists || []).forEach(a => {
            if (!artistTimeMap[a.id]) artistTimeMap[a.id] = { name: a.name, id: a.id, minutes: 0, plays: 0 };
            artistTimeMap[a.id].minutes += durMin;
            artistTimeMap[a.id].plays += 1;
          });
        });
        const artistsByTime = Object.values(artistTimeMap).sort((a, b) => b.minutes - a.minutes).slice(0, 15);

        // Hourly distribution
        const hourly = Array(24).fill(0).map((_, h) => ({ h: `${h}h`, nb: 0 }));
        recentItems.forEach(item => { hourly[new Date(item.played_at).getHours()].nb++; });

        // Daily distribution (group by date)
        const dailyMap = {};
        recentItems.forEach(item => {
          const d = new Date(item.played_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
          if (!dailyMap[d]) dailyMap[d] = { date: d, nb: 0, min: 0 };
          dailyMap[d].nb++;
          dailyMap[d].min += (item.track?.duration_ms || 0) / 60000;
        });
        const daily = Object.values(dailyMap).reverse();

        // Track play counts from recent
        const trackPlayMap = {};
        recentItems.forEach(item => {
          const t = item.track;
          if (!t) return;
          if (!trackPlayMap[t.id]) trackPlayMap[t.id] = { ...t, playCount: 0 };
          trackPlayMap[t.id].playCount++;
        });
        const mostPlayed = Object.values(trackPlayMap).sort((a, b) => b.playCount - a.playCount).slice(0, 15);

        setData({ topArtists, topTracks, recentItems, topGenres, profile, totalRecentMin, artistsByTime, hourly, daily, mostPlayed });
      } catch (e) { setError("Erreur: " + e.message); }
      finally { setLoading(false); }
    })();
  }, [token, timeRange]);

  const handleLogin = useCallback(async () => {
    if (!clientId.trim()) return;
    const verifier = generateCodeVerifier();
    const challenge = await generateCodeChallenge(verifier);
    sessionStorage.setItem("sp_verifier", verifier);
    sessionStorage.setItem("sp_client_id", clientId.trim());
    const url = new URL("https://accounts.spotify.com/authorize");
    url.searchParams.set("client_id", clientId.trim());
    url.searchParams.set("response_type", "code");
    url.searchParams.set("redirect_uri", REDIRECT_URI);
    url.searchParams.set("scope", SCOPES);
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("code_challenge", challenge);
    window.location.href = url.toString();
  }, [clientId]);

  // --- LOADING ---
  if (loading) {
    return (
      <div style={{ background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Inter', sans-serif" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16, animation: "spin 1.5s linear infinite" }}>🎵</div>
          <p style={{ color: C.muted, fontSize: 14 }}>Analyse en cours…</p>
        </div>
        <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
      </div>
    );
  }

  // --- ERROR ---
  if (error && !token) {
    return (
      <div style={{ background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Inter', sans-serif", padding: 24 }}>
        <div style={{ textAlign: "center", maxWidth: 400 }}>
          <p style={{ color: "#FF6B6B", fontSize: 14, marginBottom: 20 }}>{error}</p>
          <button onClick={() => setError(null)} style={{ padding: "12px 24px", background: C.green, border: "none", borderRadius: 50, color: "#000", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Réessayer</button>
        </div>
      </div>
    );
  }

  // --- SETUP ---
  if (!token) {
    return (
      <div style={{ background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Inter', sans-serif", padding: 24 }}>
        <div style={{ maxWidth: 480, width: "100%" }}>
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🎧</div>
            <h1 style={{ color: C.text, fontSize: 28, fontWeight: 700, margin: 0 }}>Your Spotify, Uncovered.</h1>
            <p style={{ color: C.muted, marginTop: 8, fontSize: 14 }}>Explore tes habitudes d'écoute en profondeur</p>
          </div>
          <Card>
            <div style={{ display: "flex", marginBottom: 24, borderBottom: `1px solid ${C.border}` }}>
              {[["input", "Se connecter"], ["guide", "Comment faire ?"]].map(([k, l]) => (
                <button key={k} onClick={() => setSetupStep(k)} style={{ flex: 1, padding: "10px", background: "none", border: "none", color: setupStep === k ? C.green : C.muted, borderBottom: `2px solid ${setupStep === k ? C.green : "transparent"}`, cursor: "pointer", fontSize: 13, fontWeight: 500 }}>{l}</button>
              ))}
            </div>
            {setupStep === "input" ? (
              <div>
                <label style={{ color: C.muted, fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: "monospace" }}>Spotify Client ID</label>
                <input type="text" value={clientId} onChange={e => setClientId(e.target.value)} placeholder="ex: 4a8e6b2c1d3f..."
                  onKeyDown={e => e.key === "Enter" && handleLogin()}
                  style={{ width: "100%", marginTop: 8, padding: "12px 16px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, color: C.text, fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "monospace" }} />
                <p style={{ color: C.muted, fontSize: 12, marginTop: 8 }}>Redirect URI : <code style={{ color: C.accent, fontSize: 11 }}>{REDIRECT_URI}</code></p>
                <button onClick={handleLogin} disabled={!clientId.trim()}
                  style={{ width: "100%", marginTop: 20, padding: "14px", background: clientId.trim() ? C.green : C.border, border: "none", borderRadius: 50, color: clientId.trim() ? "#000" : C.muted, fontSize: 15, fontWeight: 700, cursor: clientId.trim() ? "pointer" : "default" }}>
                  Connecter avec Spotify →
                </button>
              </div>
            ) : (
              <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.8 }}>
                <p><span style={{ color: C.green, fontWeight: 700 }}>1.</span> Va sur <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer" style={{ color: C.accent }}>developer.spotify.com/dashboard</a></p>
                <p><span style={{ color: C.green, fontWeight: 700 }}>2.</span> Create app → Redirect URI : <code style={{ color: C.accent }}>{REDIRECT_URI}</code></p>
                <p><span style={{ color: C.green, fontWeight: 700 }}>3.</span> APIs : <strong style={{ color: C.text }}>Web API</strong></p>
                <p><span style={{ color: C.green, fontWeight: 700 }}>4.</span> Copie le <strong style={{ color: C.text }}>Client ID</strong> → colle-le → connecte-toi</p>
              </div>
            )}
          </Card>
        </div>
      </div>
    );
  }

  // --- WAITING ---
  if (!data) {
    return (
      <div style={{ background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Inter', sans-serif" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16, animation: "spin 1.5s linear infinite" }}>🎵</div>
          <p style={{ color: C.muted, fontSize: 14 }}>Récupération des données…</p>
          {error && <p style={{ color: "#FF6B6B", fontSize: 13, marginTop: 12 }}>{error}</p>}
        </div>
        <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
      </div>
    );
  }

  // --- DASHBOARD ---
  const { topArtists, topTracks, recentItems, topGenres, profile, totalRecentMin, artistsByTime, hourly, daily, mostPlayed } = data;
  const hasGenres = topGenres.length > 0;
  const TIME_LABELS = { short_term: "4 semaines", medium_term: "6 mois", long_term: "Tout le temps" };

  const tabs = [
    ["overview", "📊 Vue d'ensemble"],
    ["artists", "🎤 Artistes"],
    ["tracks", "🎵 Titres"],
    ...(hasGenres ? [["genres", "🎨 Genres"]] : []),
    ["trends", "📈 Tendances"],
    ["history", "🕐 Historique"],
  ];

  return (
    <div style={{ background: C.bg, minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: C.text, padding: "24px 16px", maxWidth: 1200, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {profile.images?.[0] && <img src={profile.images[0].url} alt="" style={{ width: 48, height: 48, borderRadius: "50%", objectFit: "cover", border: `2px solid ${C.green}` }} />}
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{profile.display_name || "Mon profil"}</h1>
            <p style={{ margin: 0, color: C.muted, fontSize: 12 }}>{(profile.followers?.total || 0).toLocaleString()} followers · {TIME_LABELS[timeRange]}</p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {Object.entries(TIME_LABELS).map(([k, l]) => (
            <button key={k} onClick={() => setTimeRange(k)} style={{ padding: "6px 14px", borderRadius: 50, fontSize: 11, background: timeRange === k ? C.green : C.card, border: `1px solid ${timeRange === k ? C.green : C.border}`, color: timeRange === k ? "#000" : C.muted, cursor: "pointer", fontWeight: timeRange === k ? 700 : 400 }}>{l}</button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 2, marginBottom: 20, borderBottom: `1px solid ${C.border}`, overflowX: "auto" }}>
        {tabs.map(([k, l]) => (
          <button key={k} onClick={() => setActiveTab(k)} style={{ padding: "10px 14px", background: "none", border: "none", color: activeTab === k ? C.green : C.muted, borderBottom: `2px solid ${activeTab === k ? C.green : "transparent"}`, cursor: "pointer", fontSize: 12, fontWeight: activeTab === k ? 600 : 400, marginBottom: -1, whiteSpace: "nowrap" }}>{l}</button>
        ))}
      </div>

      {/* ═══ OVERVIEW ═══ */}
      {activeTab === "overview" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14, marginBottom: 20 }}>
            <StatCard label="Top artistes" value={topArtists.length} />
            <StatCard label="Top titres" value={topTracks.length} />
            <StatCard label="Écoutes récentes" value={recentItems.length} sub="50 dernières écoutes" />
            <StatCard label="Temps écouté" value={formatMinutes(totalRecentMin)} sub="sur les 50 dernières écoutes" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <Card>
              <Label>Top 5 artistes</Label>
              {topArtists.slice(0, 5).map((a, i) => <ArtistRow key={a.id} artist={a} rank={i + 1} />)}
            </Card>
            <Card>
              <Label>Les plus écoutés récemment (temps)</Label>
              {artistsByTime.slice(0, 5).map((a, i) => (
                <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ color: C.muted, fontSize: 11, width: 24, textAlign: "right", fontFamily: "monospace" }}>{i + 1}</span>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: COLORS[i % COLORS.length], display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>🎤</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: C.text, fontSize: 13, fontWeight: 500 }}>{a.name}</div>
                    <div style={{ color: C.muted, fontSize: 10 }}>{a.plays} écoutes</div>
                  </div>
                  <div style={{ color: C.accent, fontSize: 12, fontFamily: "monospace" }}>{formatMinutes(a.minutes)}</div>
                </div>
              ))}
            </Card>
          </div>
        </>
      )}

      {/* ═══ ARTISTS ═══ */}
      {activeTab === "artists" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <Card>
            <Label>Top {topArtists.length} artistes</Label>
            <div style={{ maxHeight: 700, overflowY: "auto" }}>
              {topArtists.map((a, i) => <ArtistRow key={a.id} artist={a} rank={i + 1} extra={a.popularity ? `${a.popularity}` : undefined} />)}
            </div>
          </Card>
          <Card>
            <Label>Artistes par temps d'écoute récent</Label>
            {artistsByTime.length > 0 ? (
              <ResponsiveContainer width="100%" height={Math.max(300, artistsByTime.length * 32)}>
                <BarChart data={artistsByTime.map(a => ({ name: a.name.length > 14 ? a.name.slice(0, 12) + "…" : a.name, min: Math.round(a.minutes) }))} layout="vertical" margin={{ left: 0, right: 10 }}>
                  <XAxis type="number" tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} width={100} />
                  <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text }} formatter={(v) => [`${v} min`, "Écoute"]} />
                  <Bar dataKey="min" radius={[0, 6, 6, 0]}>
                    {artistsByTime.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p style={{ color: C.muted, fontSize: 13 }}>Pas assez de données récentes</p>
            )}
          </Card>
        </div>
      )}

      {/* ═══ TRACKS ═══ */}
      {activeTab === "tracks" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <Card>
            <Label>Top {topTracks.length} titres</Label>
            <div style={{ maxHeight: 700, overflowY: "auto" }}>
              {topTracks.map((t, i) => <TrackRow key={t.id} track={t} rank={i + 1} />)}
            </div>
          </Card>
          <Card>
            <Label>Les plus joués récemment</Label>
            {mostPlayed.map((t, i) => (
              <TrackRow key={t.id} track={t} rank={i + 1} extra={`${t.playCount}x`} />
            ))}
            <p style={{ color: C.muted, fontSize: 10, marginTop: 12, fontStyle: "italic" }}>Basé sur les 50 dernières écoutes</p>
          </Card>
        </div>
      )}

      {/* ═══ GENRES ═══ */}
      {activeTab === "genres" && hasGenres && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <Card>
            <Label>Répartition des genres</Label>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={topGenres} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={110} innerRadius={50} paddingAngle={3}
                  label={({ percent }) => percent > 0.05 ? `${(percent * 100).toFixed(0)}%` : ""} labelLine={false}>
                  {topGenres.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text }} formatter={(v, n) => [`${v} artistes`, n]} />
              </PieChart>
            </ResponsiveContainer>
          </Card>
          <Card>
            <Label>Top genres</Label>
            {topGenres.map((g, i) => (
              <div key={g.name} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: COLORS[i % COLORS.length], flexShrink: 0 }} />
                <div style={{ flex: 1, color: C.text, fontSize: 13 }}>{g.name}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 80, height: 4, background: C.border, borderRadius: 2 }}>
                    <div style={{ width: `${(g.count / topGenres[0].count) * 100}%`, height: "100%", borderRadius: 2, background: COLORS[i % COLORS.length] }} />
                  </div>
                  <span style={{ color: C.muted, fontSize: 11, fontFamily: "monospace" }}>{g.count}</span>
                </div>
              </div>
            ))}
          </Card>
        </div>
      )}

      {/* ═══ TRENDS ═══ */}
      {activeTab === "trends" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <Card>
            <Label>Activité par heure</Label>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={hourly}>
                <XAxis dataKey="h" tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} interval={2} />
                <YAxis tick={{ fill: C.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text }} formatter={(v) => [`${v} écoutes`]} />
                <Bar dataKey="nb" fill={C.green} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
          <Card>
            <Label>Écoutes par jour</Label>
            {daily.length > 1 ? (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={daily}>
                  <XAxis dataKey="date" tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: C.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text }}
                    formatter={(v, name) => [name === "nb" ? `${v} écoutes` : `${Math.round(v)} min`]} />
                  <Line type="monotone" dataKey="nb" stroke={C.green} strokeWidth={2} dot={{ fill: C.green, r: 3 }} />
                  <Line type="monotone" dataKey="min" stroke={C.accent} strokeWidth={2} dot={{ fill: C.accent, r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p style={{ color: C.muted, fontSize: 13 }}>Pas assez de données</p>
            )}
            <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 12, height: 3, background: C.green, borderRadius: 2 }} />
                <span style={{ color: C.muted, fontSize: 10 }}>Écoutes</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 12, height: 3, background: C.accent, borderRadius: 2 }} />
                <span style={{ color: C.muted, fontSize: 10 }}>Minutes</span>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* ═══ HISTORY ═══ */}
      {activeTab === "history" && (
        <Card>
          <Label>50 dernières écoutes</Label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 24px" }}>
            {recentItems.map((item, i) => {
              const track = item.track;
              const diff = (Date.now() - new Date(item.played_at)) / 1000;
              const ago = diff < 3600 ? `${Math.floor(diff / 60)}m` : diff < 86400 ? `${Math.floor(diff / 3600)}h` : `${Math.floor(diff / 86400)}j`;
              return (
                <div key={`${track.id}-${i}`} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: `1px solid ${C.border}` }}>
                  {track.album?.images?.[0] && <img src={track.album.images[track.album.images.length > 1 ? 1 : 0].url} alt="" style={{ width: 32, height: 32, borderRadius: 4, objectFit: "cover" }} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: C.text, fontSize: 12, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{track.name}</div>
                    <div style={{ color: C.muted, fontSize: 10 }}>{(track.artists || []).map(a => a.name).join(", ")}</div>
                  </div>
                  <div style={{ color: C.muted, fontSize: 10, fontFamily: "monospace" }}>{ago}</div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Footer */}
      <div style={{ textAlign: "center", marginTop: 40, padding: "20px 0", color: C.muted, fontSize: 11 }}>
        Données via Spotify Web API · Les stats de temps sont basées sur les 50 dernières écoutes ·
        <button onClick={() => { setToken(null); setData(null); }} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 11, textDecoration: "underline", marginLeft: 4 }}>Déconnexion</button>
      </div>
    </div>
  );
}