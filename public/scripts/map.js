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
  new maplibregl.Popup()
  .setLngLat(f.geometry.coordinates)
  .setHTML(`
      <b>${p.agencyId}</b><br>
      <b>${p.currentStopSequence}</b>
      <b>Vehicle:</b> ${p.id}<br>
      <b>Route:</b> ${p.routeId}<br>
      <b>Trip:</b> <a href="/api/trips/${p.agencyId}/${p.tripId}">${p.tripId}</a><br>
    `)
  .addTo(map);
}
map.addControl(new maplibregl.NavigationControl());
map.on("load", () => {
    //Add Trains

    map.addSource('trains', {
        type: "geojson",
        data: "/api/vehicles.geojson"
    });
    map.addLayer({
        id: 'trains-layer',
        type: "circle",
        source: 'trains',
        paint: {
            'circle-radius': 5,
        }

    });

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
