const larouteColors = {
    801: "#0072BC",
    802: "#EB131B",
    803: "#58A738",
    804: "#FDB913",
    805: "#A05DA5",
    807: "#E56DB1",
    unknown: "#AAAAAA"
};

const map = new maplibregl.Map({
    container: "map",
    style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
    center: [-118.25, 34.05],
    zoom: 9
});

map.addControl(new maplibregl.NavigationControl());

let selectedTrainId = null;
let selectedUpdatedAt = null;

function routeKey(p) {
    return (p.route_code || p.routeId || "unknown").toString();
}
function routeColor(p) {
    return larouteColors[routeKey(p)] || larouteColors.unknown;
}
function fmtCoord(n) {
    const x = Number(n);
    return Number.isFinite(x) ? x.toFixed(6) : "—";
}
function fmtSpeed(v) {
    const x = Number(v);
    if (!Number.isFinite(x)) return "—";
    const mph = x * 2.236936; // if x is m/s
    return `${x.toFixed(2)} m/s (${mph.toFixed(1)} mph)`;
}
function fmtUpdated(ms) {
    const x = Number(ms);
    return Number.isFinite(x) ? new Date(x).toLocaleString() : "—";
}
function fmtAge(ms) {
    const x = Number(ms);
    if (!Number.isFinite(x)) return "—";
    const s = Math.max(0, Math.round((Date.now() - x) / 1000));
    return `${s}s ago`;
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value ?? "—";
}

function updateSidePanel(feature) {
    const p = feature.properties || {};
    const [lon, lat] = feature.geometry?.coordinates || [];

    selectedTrainId = (p.id || "").toString();
    selectedUpdatedAt = Number(p.updated_at);

    const rk = routeKey(p);
    const rc = routeColor(p);

    // header
    const dot = document.getElementById("routeDot");
    if (dot) dot.style.background = rc;

    setText("sideTitle", `Train ${p.id || p.label || "—"}`);
    setText("sideSub", `Route ${rk} • ${p.currentStatus || "—"}`);

    // cells
    setText("routeId", p.routeId || p.route_code || "—");
    setText("trainId", p.id || p.label || "—");
    setText("tripId", p.tripId || "—");
    setText("stopId", p.stopId || "—");
    setText("status", p.currentStatus || "—");
    setText("speed", fmtSpeed(p.speed));
    setText("lat", fmtCoord(lat));
    setText("lon", fmtCoord(lon));
    setText("updatedAt", fmtUpdated(p.updated_at));
    setText("age", fmtAge(p.updated_at));

    highlightSelected();
}

function highlightSelected() {
    if (!map.getLayer("train-selected")) return;
    if (!selectedTrainId) {
        map.setFilter("train-selected", ["==", ["get", "id"], "___none___"]);
    } else {
        map.setFilter("train-selected", ["==", ["get", "id"], selectedTrainId]);
    }
}

async function refreshTrains() {
    try {
        const r = await fetch("/api/vehicles.geojson", { cache: "no-store" });
        if (!r.ok) return;
        const geojson = await r.json();
        const src = map.getSource("trains");
        if (src) src.setData(geojson);
        highlightSelected();
    } catch (e) {
        console.error("refreshTrains:", e);
    }
}

// Update “Age” live (without refetch)
setInterval(() => {
    if (!selectedUpdatedAt) return;
    setText("age", fmtAge(selectedUpdatedAt));
}, 1000);

map.on("load", () => {
    map.addSource("trains", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] }
    });
    map.addSource("stops",{
        type: "geojson",
        data: "/api/gtfs/stops",
    })
    map.addSource("routes", {
        type: "geojson",
        data: "/api/gtfs/shapes",
    })

    map.addLayer({
        id: "routes-layer",
        type: "line",
        source: "routes",
        paint: {
            "line-width":2,
            "line-color": ["get","route_color"]
        }

    });
    map.addLayer({
        id: "stops-layer",
        type: "circle",
        source: "stops",
        paint: {
            "circle-radius": 4,
            "circle-color": "#ffffff",
            "circle-stroke-width": 1,
            "circle-stroke-color": "#000000"
        }
    })
    map.addLayer({
        id: "trains-layer",
        type: "circle",
        source: "trains",
        paint: {
            "circle-radius": 5,
            "circle-color": [
                "match",
                ["coalesce", ["get", "route_code"], ["get", "routeId"]],
                "801",
                larouteColors["801"],
                "802",
                larouteColors["802"],
                "803",
                larouteColors["803"],
                "804",
                larouteColors["804"],
                "805",
                larouteColors["805"],
                "807",
                larouteColors["807"],
                larouteColors.unknown
            ],
            "circle-stroke-width": 1,
            "circle-stroke-color": "#ffffff"
        }
    });
    map.addLayer({
        id: "train-selected",
        type: "circle",
        source: "trains",
        paint: {
            "circle-radius": 9,
            "circle-color": "rgba(0,0,0,0)",
            "circle-stroke-width": 3,
            "circle-stroke-color": "#000"
        },
        filter: ["==", ["get", "id"], "___none___"]
    });

    refreshTrains();
    setInterval(refreshTrains, 5000); // ✅ every 5 seconds

    map.on("click", "trains-layer", (e) => {
        const f = e.features?.[0];
        if (f) updateSidePanel(f);
    });

    map.on("mouseenter", "trains-layer", () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", "trains-layer", () => (map.getCanvas().style.cursor = ""));
});
