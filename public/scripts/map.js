const larouteColors = {
    "801": "#0072BC",
    "802": "#EB131B",
    "803": "#58A738",
    "804": "#FDB913",
    "805": "#A05DA5",
    "807": "#E56DB1",
    "Antelope Valley Line": "#1d9d02",
    "San Bernardino Line": "#a32236",
    "Ventura County Line": "#f6a706",
    "Orange County Line": "#ff7602",
    "unknown": "#AAAAAA",
};
const map = new maplibregl.Map({
    container: "map",
    style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
    center: [-118.25, 34.05],
    zoom: 9
});
function showTrainPopup(e) {
    const f = e.features[0];
    const p = f.properties;

    // p values from GeoJSON are strings in MapLibre; keep that in mind
    const route = p.route_code || p.routeId || "unknown";
    const vehicleId = p.id || p.label || "unknown";
    const tripId = p.tripId || "unknown";
    const stopId = p.stopId || "unknown";
    const speed = p.speed ?? "n/a";
    const status = p.currentStatus || "n/a";

    new maplibregl.Popup()
        .setLngLat(f.geometry.coordinates)
        .setHTML(`
          <div style="min-width:220px">
            <div><b>Vehicle:</b> ${vehicleId}</div>
            <div><b>Route:</b> ${route}</div>
            <div><b>Status:</b> ${status}</div>
            <div><b>Stop:</b> ${stopId}</div>
            <div><b>Seq:</b> ${p.currentStopSequence ?? "n/a"}</div>
            <div><b>Speed:</b> ${speed}</div>
            <div><b>Trip:</b> ${tripId}</div>
          </div>
    `)
        .addTo(map);
}
async function refreshTrains(format, data) {
    try {
        const r = await fetch("/api/vehicles.geojson", { cache: "no-store" });
        if (!r.ok) return;

        const geojson = await r.json();
        const src = map.getSource("trains");
        if (src) src.setData(geojson, data);
    } catch (err) {
        console.error("refreshTrains error:", err);
    }
}
map.addControl(new maplibregl.NavigationControl());
function getRouteColor(p) {
    const key = (p.route_code || p.routeId || "unknown").toString();
    return larouteColors[key] || larouteColors.unknown;
}


map.on("load", () => {
    //Add Trains

    map.addSource("trains", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] }, // start empty
    });
    map.addLayer({
        id: 'trains-layer',
        type: "circle",
        source: 'trains',
        paint: {
            'circle-radius': 5,
            "circle-color": [
                "match",
                ["coalesce", ["get", "route_code"], ["get", "routeId"]],
                "801", larouteColors["801"],
                "802", larouteColors["802"],
                "803", larouteColors["803"],
                "804", larouteColors["804"],
                "805", larouteColors["805"],
                "807", larouteColors["807"],
                larouteColors.unknown
            ],
            "circle-stroke-width": 1,
            "circle-stroke-color": "#ffffff",
        }

    });
    refreshTrains();
    setInterval(refreshTrains, 5000);
    map.on("click", "stations-layer", (e) => {
        const f = e.features[0];
        const p = f.properties;
        new maplibregl.Popup()
            .setLngLat(f.geometry.coordinates)
            .setHTML(`<strong>${p.name}</strong> (${p.code})<br>${p.city}, ${p.state}`)
            .addTo(map);
    });
    map.on("click", "trains-layer", showTrainPopup);
    map.on("click", "lametro_rail-layer", showTrainPopup);

});
