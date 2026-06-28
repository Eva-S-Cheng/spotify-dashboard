import { useState, useEffect, useCallback } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis, Cell, PieChart, Pie } from "recharts";

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const REDIRECT_URI = "https://eva-s-cheng.github.io/spotify-dashboard/";
const SCOPES = [
  "user-top-read",
  "user-read-recently-played",
  "user-read-private",
].join(" ");

// ─── PKCE HELPERS ────────────────────────────────────────────────────────────
function generateCodeVerifier(length = 128) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => chars[b % chars.length]).join("");
}

async function generateCodeChallenge(verifier) {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

// ─── SPOTIFY API ─────────────────────────────────────────────────────────────
async function fetchSpotify(endpoint, token) {
  const res = await fetch(`https://api.spotify.com/v1${endpoint}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Spotify error ${res.status}`);
  return res.json();
}

// ─── COLOUR PALETTE ──────────────────────────────────────────────────────────
const C = {
  bg: "#0D0D0D",
  surface: "#161616",
  card: "#1C1C1C",
  border: "#2A2A2A",
  green: "#1DB954",
  greenDim: "#158a3e",
  text: "#FFFFFF",
  muted: "#888",
  accent: "#B3FF5C",
};

const GENRE_COLORS = ["#1DB954","#B3FF5C","#FF6B6B","#4ECDC4","#FFE66D","#A29BFE"];

// ─── SUB-COMPONENTS ──────────────────────────────────────────────────────────
function Card({ children, style = {} }) {
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`,
      borderRadius: 16, padding: "24px", ...style
    }}>
      {children}
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <p style={{ color: C.muted, fontSize: 11, fontFamily: "monospace",
      letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 16 }}>
      {children}
    </p>
  );
}

function ArtistRow({ artist, rank }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14,
      padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
      <span style={{ color: C.muted, fontSize: 12, width: 20, textAlign: "right",
        fontFamily: "monospace" }}>{rank}</span>
      {artist.images?.[0] && (
        <img src={artist.images[0].url} alt={artist.name}
          style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover" }} />
      )}
      <div style={{ flex: 1 }}>
        <div style={{ color: C.text, fontSize: 14, fontWeight: 500 }}>{artist.name}</div>
        <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>
          {artist.genres?.slice(0, 2).join(" · ")}
        </div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ color: C.green, fontSize: 12 }}>
          {artist.popularity}<span style={{ color: C.muted, fontSize: 10 }}>/100</span>
        </div>
      </div>
    </div>
  );
}

function TrackRow({ track, rank }) {
  const duration = track.duration_ms
    ? `${Math.floor(track.duration_ms / 60000)}:${String(Math.floor((track.duration_ms % 60000) / 1000)).padStart(2, "0")}`
    : "";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14,
      padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
      <span style={{ color: C.muted, fontSize: 12, width: 20, textAlign: "right",
        fontFamily: "monospace" }}>{rank}</span>
      {track.album?.images?.[0] && (
        <img src={track.album.images[0].url} alt={track.name}
          style={{ width: 40, height: 40, borderRadius: 8, objectFit: "cover" }} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: C.text, fontSize: 14, fontWeight: 500,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {track.name}
        </div>
        <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>
          {track.artists?.map(a => a.name).join(", ")}
        </div>
      </div>
      <div style={{ color: C.muted, fontSize: 11, fontFamily: "monospace" }}>{duration}</div>
    </div>
  );
}

function RecentRow({ item }) {
  const track = item.track;
  const playedAt = new Date(item.played_at);
  const timeAgo = (() => {
    const diff = (Date.now() - playedAt) / 1000;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  })();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12,
      padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
      {track.album?.images?.[0] && (
        <img src={track.album.images[0].url} alt={track.name}
          style={{ width: 36, height: 36, borderRadius: 6, objectFit: "cover" }} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: C.text, fontSize: 13, fontWeight: 500,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {track.name}
        </div>
        <div style={{ color: C.muted, fontSize: 11 }}>
          {track.artists?.map(a => a.name).join(", ")}
        </div>
      </div>
      <div style={{ color: C.muted, fontSize: 11, fontFamily: "monospace",
        whiteSpace: "nowrap" }}>{timeAgo}</div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function SpotifyDashboard() {
  const [clientId, setClientId] = useState(() => localStorage.getItem("sp_client_id") || "");
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [timeRange, setTimeRange] = useState("medium_term");
  const [activeTab, setActiveTab] = useState("artists");
  const [setupStep, setSetupStep] = useState("input"); // input | guide

  // ── Handle OAuth callback ──
  useEffect(() => {
    const code = sessionStorage.getItem("sp_code");
    if (!code) return;
  
    const verifier = sessionStorage.getItem("sp_verifier");
    const savedId = sessionStorage.getItem("sp_client_id");
    if (!verifier || !savedId) return;
  
    sessionStorage.removeItem("sp_code");
  
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("https://accounts.spotify.com/api/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: savedId,
            grant_type: "authorization_code",
            code,
            redirect_uri: "https://eva-s-cheng.github.io/spotify-dashboard/",
            code_verifier: verifier,
          }),
        });
        const json = await res.json();
        if (json.access_token) {
          setToken(json.access_token);
          localStorage.setItem("sp_client_id", savedId);
        } else {
          setError("Erreur: " + JSON.stringify(json));
        }
      } catch (e) {
        setError("Erreur réseau: " + e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ── Fetch Spotify data ──
  useEffect(() => {
    if (!token) return;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [topArtists, topTracks, recent, profile] = await Promise.all([
          fetchSpotify(`/me/top/artists?limit=20&time_range=${timeRange}`, token),
          fetchSpotify(`/me/top/tracks?limit=20&time_range=${timeRange}`, token),
          fetchSpotify("/me/player/recently-played?limit=30", token),
          fetchSpotify("/me", token),
        ]);

        // Genre aggregation
        const genreCounts = {};
        topArtists.items.forEach(a =>
          a.genres.forEach(g => { genreCounts[g] = (genreCounts[g] || 0) + 1; })
        );
        const topGenres = Object.entries(genreCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([name, count]) => ({ name: name.length > 18 ? name.slice(0, 16) + "…" : name, count }));

        setData({ topArtists: topArtists.items, topTracks: topTracks.items,
          recent: recent.items, topGenres, profile });
      } catch (e) {
        setError("Erreur lors du chargement des données Spotify.");
      } finally {
        setLoading(false);
      }
    })();
  }, [token, timeRange]);

  // ── Login handler ──
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

  // ─── SETUP SCREEN ───────────────────────────────────────────────────────────
  if (!token) {
    return (
      <div style={{ background: C.bg, minHeight: "100vh", display: "flex",
        alignItems: "center", justifyContent: "center", fontFamily: "'Inter', sans-serif",
        padding: 24 }}>
        <div style={{ maxWidth: 480, width: "100%" }}>
          {/* Logo area */}
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🎧</div>
            <h1 style={{ color: C.text, fontSize: 28, fontWeight: 700, margin: 0 }}>
              Spotify Analytics
            </h1>
            <p style={{ color: C.muted, marginTop: 8, fontSize: 14 }}>
              Explore tes habitudes d'écoute en profondeur
            </p>
          </div>

          <Card>
            {/* Tabs */}
            <div style={{ display: "flex", gap: 0, marginBottom: 24,
              borderBottom: `1px solid ${C.border}` }}>
              {[["input", "Se connecter"], ["guide", "Comment configurer ?"]].map(([key, label]) => (
                <button key={key} onClick={() => setSetupStep(key)} style={{
                  flex: 1, padding: "10px", background: "none", border: "none",
                  color: setupStep === key ? C.green : C.muted,
                  borderBottom: `2px solid ${setupStep === key ? C.green : "transparent"}`,
                  cursor: "pointer", fontSize: 13, fontWeight: 500, transition: "color 0.2s"
                }}>{label}</button>
              ))}
            </div>

            {setupStep === "input" ? (
              <div>
                <label style={{ color: C.muted, fontSize: 12, letterSpacing: "0.1em",
                  textTransform: "uppercase", fontFamily: "monospace" }}>
                  Spotify Client ID
                </label>
                <input
                  type="text"
                  value={clientId}
                  onChange={e => setClientId(e.target.value)}
                  placeholder="ex: 4a8e6b2c1d3f..."
                  onKeyDown={e => e.key === "Enter" && handleLogin()}
                  style={{
                    width: "100%", marginTop: 8, padding: "12px 16px",
                    background: C.surface, border: `1px solid ${C.border}`,
                    borderRadius: 10, color: C.text, fontSize: 14, outline: "none",
                    boxSizing: "border-box", fontFamily: "monospace",
                  }}
                />
                <p style={{ color: C.muted, fontSize: 12, marginTop: 8 }}>
                  URI de redirection à configurer sur Spotify :{" "}
                  <code style={{ color: C.accent, fontSize: 11 }}>{REDIRECT_URI}</code>
                </p>
                <button onClick={handleLogin} disabled={!clientId.trim()}
                  style={{
                    width: "100%", marginTop: 20, padding: "14px",
                    background: clientId.trim() ? C.green : C.border,
                    border: "none", borderRadius: 50, color: clientId.trim() ? "#000" : C.muted,
                    fontSize: 15, fontWeight: 700, cursor: clientId.trim() ? "pointer" : "default",
                    transition: "all 0.2s",
                  }}>
                  Connecter avec Spotify →
                </button>
                {error && (
                  <p style={{ color: "#FF6B6B", fontSize: 13, marginTop: 12, textAlign: "center" }}>
                    {error}
                  </p>
                )}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.8 }}>
                {[
                  ["1", "Va sur", "developer.spotify.com/dashboard", "https://developer.spotify.com/dashboard"],
                  null,
                  ["2", "Clique sur", "Create app", null],
                  null,
                  ["3", "Remplis :", null, null],
                ].map((step, i) => step ? (
                  <p key={i} style={{ margin: "6px 0" }}>
                    <span style={{ color: C.green, fontWeight: 700 }}>{step[0]}.</span>{" "}
                    {step[1]}{" "}
                    {step[2] && (step[3]
                      ? <a href={step[3]} target="_blank" rel="noreferrer"
                          style={{ color: C.accent }}>{step[2]}</a>
                      : <strong style={{ color: C.text }}>{step[2]}</strong>
                    )}
                  </p>
                ) : null)}
                <div style={{ background: C.surface, borderRadius: 10, padding: 14,
                  margin: "12px 0", fontSize: 12, fontFamily: "monospace" }}>
                  <div><span style={{ color: C.muted }}>Redirect URI :</span>{" "}
                    <span style={{ color: C.accent }}>{REDIRECT_URI}</span></div>
                  <div style={{ marginTop: 4 }}><span style={{ color: C.muted }}>APIs :</span>{" "}
                    <span style={{ color: C.text }}>Web API</span></div>
                </div>
                <p style={{ margin: "6px 0" }}>
                  <span style={{ color: C.green, fontWeight: 700 }}>4.</span>{" "}
                  Copie le <strong style={{ color: C.text }}>Client ID</strong> depuis les settings de l'app
                </p>
                <p style={{ margin: "6px 0" }}>
                  <span style={{ color: C.green, fontWeight: 700 }}>5.</span>{" "}
                  Colle-le dans l'onglet "Se connecter"
                </p>
              </div>
            )}
          </Card>
        </div>
      </div>
    );
  }

  // ─── LOADING ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ background: C.bg, minHeight: "100vh", display: "flex",
        alignItems: "center", justifyContent: "center", fontFamily: "'Inter', sans-serif" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 16,
            animation: "spin 1.5s linear infinite" }}>🎵</div>
          <p style={{ color: C.muted, fontSize: 14 }}>Chargement de tes données…</p>
        </div>
        <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
      </div>
    );
  }

  if (!data) return null;

  const { topArtists, topTracks, recent, topGenres, profile } = data;
  const avgPopularity = Math.round(topArtists.reduce((s, a) => s + a.popularity, 0) / topArtists.length);

  const TIME_LABELS = {
    short_term: "4 dernières semaines",
    medium_term: "6 derniers mois",
    long_term: "Tout le temps",
  };

  // ─── DASHBOARD ──────────────────────────────────────────────────────────────
  return (
    <div style={{ background: C.bg, minHeight: "100vh", fontFamily: "'Inter', sans-serif",
      color: C.text, padding: "24px 16px", maxWidth: 1100, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
        marginBottom: 32, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {profile.images?.[0] && (
            <img src={profile.images[0].url} alt={profile.display_name}
              style={{ width: 48, height: 48, borderRadius: "50%", objectFit: "cover",
                border: `2px solid ${C.green}` }} />
          )}
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>
              {profile.display_name}
            </h1>
            <p style={{ margin: 0, color: C.muted, fontSize: 12 }}>
              {profile.followers?.total?.toLocaleString()} followers · {TIME_LABELS[timeRange]}
            </p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {Object.entries(TIME_LABELS).map(([key, label]) => (
            <button key={key} onClick={() => setTimeRange(key)} style={{
              padding: "6px 14px", borderRadius: 50, fontSize: 12,
              background: timeRange === key ? C.green : C.card,
              border: `1px solid ${timeRange === key ? C.green : C.border}`,
              color: timeRange === key ? "#000" : C.muted,
              cursor: "pointer", fontWeight: timeRange === key ? 700 : 400,
              transition: "all 0.2s",
            }}>{label}</button>
          ))}
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
        gap: 16, marginBottom: 24 }}>
        {[
          { label: "Artistes suivis", value: topArtists.length, suffix: "top" },
          { label: "Titres écoutés", value: topTracks.length, suffix: "top" },
          { label: "Popularité moy.", value: avgPopularity, suffix: "/100" },
          { label: "Genres distincts", value: topGenres.length, suffix: "genres" },
        ].map(({ label, value, suffix }) => (
          <Card key={label} style={{ padding: "20px 18px" }}>
            <SectionLabel>{label}</SectionLabel>
            <div style={{ fontSize: 32, fontWeight: 800, color: C.green,
              lineHeight: 1, fontFamily: "monospace" }}>
              {value}
              <span style={{ fontSize: 13, color: C.muted, fontWeight: 400,
                marginLeft: 4 }}>{suffix}</span>
            </div>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20,
        borderBottom: `1px solid ${C.border}`, paddingBottom: 0 }}>
        {[
          ["artists", "🎤 Artistes"],
          ["tracks", "🎵 Titres"],
          ["genres", "🎨 Genres"],
          ["history", "🕐 Historique"],
        ].map(([key, label]) => (
          <button key={key} onClick={() => setActiveTab(key)} style={{
            padding: "10px 16px", background: "none", border: "none",
            color: activeTab === key ? C.green : C.muted,
            borderBottom: `2px solid ${activeTab === key ? C.green : "transparent"}`,
            cursor: "pointer", fontSize: 13, fontWeight: activeTab === key ? 600 : 400,
            transition: "color 0.2s", marginBottom: -1,
          }}>{label}</button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "artists" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <Card>
            <SectionLabel>Top 10 artistes</SectionLabel>
            {topArtists.slice(0, 10).map((a, i) => (
              <ArtistRow key={a.id} artist={a} rank={i + 1} />
            ))}
          </Card>
          <Card>
            <SectionLabel>Popularité des artistes</SectionLabel>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={topArtists.slice(0, 10).map(a => ({
                name: a.name.length > 10 ? a.name.slice(0, 10) + "…" : a.name,
                popularité: a.popularity,
              }))} layout="vertical" margin={{ left: 0, right: 20 }}>
                <XAxis type="number" domain={[0, 100]} tick={{ fill: C.muted, fontSize: 11 }}
                  axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fill: C.muted, fontSize: 11 }}
                  axisLine={false} tickLine={false} width={90} />
                <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.border}`,
                  borderRadius: 8, color: C.text }} />
                <Bar dataKey="popularité" fill={C.green} radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>
      )}

      {activeTab === "tracks" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <Card>
            <SectionLabel>Top 10 titres</SectionLabel>
            {topTracks.slice(0, 10).map((t, i) => (
              <TrackRow key={t.id} track={t} rank={i + 1} />
            ))}
          </Card>
          <Card>
            <SectionLabel>Popularité des titres</SectionLabel>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={topTracks.slice(0, 10).map(t => ({
                name: t.name.length > 12 ? t.name.slice(0, 12) + "…" : t.name,
                popularité: t.popularity,
              }))} layout="vertical" margin={{ left: 0, right: 20 }}>
                <XAxis type="number" domain={[0, 100]} tick={{ fill: C.muted, fontSize: 11 }}
                  axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fill: C.muted, fontSize: 11 }}
                  axisLine={false} tickLine={false} width={100} />
                <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.border}`,
                  borderRadius: 8, color: C.text }} />
                <Bar dataKey="popularité" radius={[0, 6, 6, 0]}>
                  {topTracks.slice(0, 10).map((_, i) => (
                    <Cell key={i} fill={GENRE_COLORS[i % GENRE_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>
      )}

      {activeTab === "genres" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <Card>
            <SectionLabel>Répartition des genres</SectionLabel>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={topGenres} dataKey="count" nameKey="name"
                  cx="50%" cy="50%" outerRadius={110} innerRadius={50}
                  paddingAngle={3} label={({ name, percent }) =>
                    percent > 0.06 ? `${(percent * 100).toFixed(0)}%` : ""
                  } labelLine={false}>
                  {topGenres.map((_, i) => (
                    <Cell key={i} fill={GENRE_COLORS[i % GENRE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.border}`,
                  borderRadius: 8, color: C.text }}
                  formatter={(v, n) => [v + " artistes", n]} />
              </PieChart>
            </ResponsiveContainer>
          </Card>
          <Card>
            <SectionLabel>Top genres</SectionLabel>
            {topGenres.map((g, i) => (
              <div key={g.name} style={{ display: "flex", alignItems: "center",
                gap: 12, padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%",
                  background: GENRE_COLORS[i % GENRE_COLORS.length], flexShrink: 0 }} />
                <div style={{ flex: 1, color: C.text, fontSize: 13 }}>{g.name}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 80, height: 4, background: C.border, borderRadius: 2 }}>
                    <div style={{ width: `${(g.count / topGenres[0].count) * 100}%`,
                      height: "100%", borderRadius: 2,
                      background: GENRE_COLORS[i % GENRE_COLORS.length] }} />
                  </div>
                  <span style={{ color: C.muted, fontSize: 12, fontFamily: "monospace",
                    width: 20 }}>{g.count}</span>
                </div>
              </div>
            ))}
          </Card>
        </div>
      )}

      {activeTab === "history" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <Card>
            <SectionLabel>Écoutes récentes</SectionLabel>
            {recent.slice(0, 15).map((item, i) => (
              <RecentRow key={`${item.track.id}-${i}`} item={item} />
            ))}
          </Card>
          <Card>
            <SectionLabel>Activité par heure</SectionLabel>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={(() => {
                const hours = Array(24).fill(0).map((_, h) => ({ heure: `${h}h`, écoutes: 0 }));
                recent.forEach(item => {
                  const h = new Date(item.played_at).getHours();
                  hours[h].écoutes++;
                });
                return hours;
              })()}>
                <XAxis dataKey="heure" tick={{ fill: C.muted, fontSize: 10 }}
                  axisLine={false} tickLine={false} interval={3} />
                <YAxis tick={{ fill: C.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.border}`,
                  borderRadius: 8, color: C.text }} />
                <Bar dataKey="écoutes" fill={C.green} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>
      )}

      {/* Footer */}
      <div style={{ textAlign: "center", marginTop: 40, color: C.muted, fontSize: 12 }}>
        Données via Spotify Web API · 
        <button onClick={() => { setToken(null); setData(null); }}
          style={{ background: "none", border: "none", color: C.muted,
            cursor: "pointer", fontSize: 12, textDecoration: "underline", marginLeft: 4 }}>
          Se déconnecter
        </button>
      </div>
    </div>
  );
}
