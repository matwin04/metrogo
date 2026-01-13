import express from "express";
import path from "path";
import dotenv from "dotenv";
import { engine } from "express-handlebars";
import { fileURLToPath } from "url";
import fs from "node:fs/promises";
import {WebSocket} from "ws";
dotenv.config();

const app = express();


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VIEWS_DIR = path.join(__dirname, "views");
const PARTIALS_DIR = path.join(VIEWS_DIR, "partials");
const WS_VEHICLES_URL = "wss://api.metro.net/ws/LACMTA_Rail/vehicle_positions";
const WS_UPDATES_URL = "wss://api.metro.net/ws/LACMTA_Rail/trip_updates";
const VEHICLES = new Map(); // vehicle_id -> { updated_at, msg }
const UPDATES = new Map();
const STALE_AFTER_SECONDS = 240;
// Error tracking
let LAST_VEHICLES_ERROR = null;
let LAST_UPDATES_ERROR = null;

function getVehicleId(msg) {
    return (
        msg?.id ||
        msg?.vehicle?.vehicle?.id ||
        msg?.vehicle?.vehicle?.label ||
        null
    );
}
function getTripId(msg) {
    return (
        msg?.tripUpdate?.trip?.tripId ||
        msg?.vehicle?.trip?.tripId ||   // in case something else carries it
        msg?.id?.toString()?.split("_")?.[0] || // fallback for ids like "63612545_1190-1195_45000"
        null
    );
}
function cleanupStale() {
    const now = Date.now();
    for (const [vid, v] of VEHICLES.entries()) {
        if ((now - v.updated_at) / 1000 > STALE_AFTER_SECONDS) {
            VEHICLES.delete(vid);
        }
    }
}
function connectVehicles() {
    const ws = new WebSocket(WS_VEHICLES_URL);

    ws.on("open", () => console.log("WS connected"));

    ws.on("message", (buf) => {
        try {
            const msg = JSON.parse(buf.toString("utf8"));
            const vid = getVehicleId(msg);
            if (!vid) return;

            VEHICLES.set(vid, { updated_at: Date.now(), msg });
            LAST_VEHICLES_ERROR = null;
        } catch (e) {
            LAST_VEHICLES_ERROR = `JSON parse error: ${e.message}`;
        }
    });

    ws.on("error", (err) => {
        LAST_VEHICLES_ERROR = String(err);
    });

    ws.on("close", () => {
        console.log("WS closed, reconnecting...");
        setTimeout(connect, 2000);
    });
}

function connectTrips() {
    const ws = new WebSocket(WS_UPDATES_URL);

    ws.on("open", () => console.log("WS tripUpdates connected"));

    ws.on("message", (buf) => {
        try {
            const msg = JSON.parse(buf.toString("utf8"));
            const tripId = getTripId(msg);
            if (!tripId) return;

            UPDATES.set(String(tripId), { updated_at: Date.now(), msg });
            LAST_UPDATES_ERROR = null;
        } catch (e) {
            LAST_UPDATES_ERROR = `tripUpdates JSON parse error: ${e.message}`;
        }
    });

    ws.on("error", (err) => {
        LAST_UPDATES_ERROR = String(err);
    });

    ws.on("close", () => {
        console.log("WS tripUpdates closed, reconnecting...");
        setTimeout(connectTrips, 2000);
    });
}
connectVehicles();
connectTrips();
app.engine("html", engine({ extname: ".html", defaultLayout: false, partialsDir: PARTIALS_DIR }));
app.set("view engine", "html");
app.set("views", VIEWS_DIR);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/public", express.static(path.join(__dirname, "public")));
app.get("/", async (req, res) => {
    res.render("index");
});
app.get("/index.html", (req, res) => {
    res.render("index")
})
app.get("/about", (req, res) => {
    res.render("about");
});
app.get("/trips/:tripId", async (req, res) => {
    const tripId = req.params.tripId;
    try {
        const response = await fetch(`https://api.metro.net/LACMTA_Rail/stop_times/trip_id/${tripId}`)
        const data = await response.json();
        console.log(data);
        res.render("trip", {
            tripId: tripId,
            stops: data
        })
    } catch (error) {
        console.error(error);
    }
})
app.get("/api/vehicles", (req, res) => {
    cleanupStale();
    const vehicles = Array.from(VEHICLES.values()).map(v => v.msg);
    res.json({
        ok: true,
        count: vehicles.length,
        stale_after_seconds: STALE_AFTER_SECONDS,
        vehicles
    });
});
app.get("/api/vehicle/:vehicleId", (req, res) => {
    const v = VEHICLES.get(req.params.vehicleId);
    if (!v) return res.status(404).json({ ok: false, error: "Not found" });
    res.json({ ok: true, vehicle: v.msg });
});
app.get("/api/updates", (req, res) => {
    cleanupStale(UPDATES);
    const tripUpdates = Array.from(UPDATES.values()).map((t) => t.msg);
    res.json({
        ok: true,
        count: tripUpdates.length,
        stale_after_seconds: STALE_AFTER_SECONDS,
        tripUpdates,
    });
});
app.get("/api/updates/:tripId", (req, res) => {
    const t = UPDATES.get(String(req.params.tripId));
    if (!t) return res.status(404).json({ ok: false, error: "Not found" });
    res.json({ ok: true, trip: t.msg });
});

app.get("/api/health", (req, res) => {
    cleanupStale(VEHICLES);
    cleanupStale(UPDATES);
    res.json({
        ok: true,
        vehicles_count: VEHICLES.size,
        tripUpdates_count: UPDATES.size,
        vehicles_error: LAST_VEHICLES_ERROR,
        tripUpdates_error: LAST_UPDATES_ERROR,
    });
});
function msgToFeature(entry) {
    const msg = entry.msg;
    const pos = msg?.vehicle?.position || {};
    const lat = pos.latitude;
    const lon = pos.longitude;
    if (lat == null || lon == null) return null;

    const trip = msg?.vehicle?.trip || {};
    const vehicleObj = msg?.vehicle?.vehicle || {};

    return {
        type: "Feature",
        geometry: { type: "Point", coordinates: [lon, lat] },
        properties: {
            id: msg.id,
            label: vehicleObj.label,
            route_code: msg.route_code,
            routeId: trip.routeId,
            tripId: trip.tripId,
            directionId: trip.directionId,
            startTime: trip.startTime,
            startDate: trip.startDate,
            currentStopSequence: msg?.vehicle?.currentStopSequence,
            currentStatus: msg?.vehicle?.currentStatus,
            timestamp: msg?.vehicle?.timestamp,
            stopId: msg?.vehicle?.stopId,
            speed: pos.speed,
            updated_at: entry.updated_at,
        },
    };
}

app.get("/api/vehicles.geojson", (req, res) => {
    cleanupStale(VEHICLES);
    const routeFilter = (req.query.route || "").toString().trim();
    const features = [];
    for (const entry of VEHICLES.values()) {
        const msg = entry.msg;

        if (routeFilter) {
            const routeCode = msg?.route_code?.toString();
            const routeId = msg?.vehicle?.trip?.routeId?.toString();
            if (routeCode !== routeFilter && routeId !== routeFilter) continue;
        }

        const f = msgToFeature(entry);
        if (f) features.push(f);
    }

    res.json({ type: "FeatureCollection", features });
});
// START SERVER
if (!process.env.VERCEL && !process.env.NOW_REGION) {
    const PORT = process.env.PORT || 8088;
    app.listen(PORT, () => {
        console.log(`Server running: http://localhost:${PORT}`);
        console.log(`📘 Auto-generated API docs will appear at http://localhost:${PORT}/api-docs`);
    });
}

export default app;