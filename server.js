require("dotenv").config();
const express = require("express");
const axios = require("axios");
const cors = require("cors");
const admin = require("firebase-admin");

const serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
admin.initializeApp({credential: admin.credential.cert(serviceAccount)});
const db = admin.firestore();
const app = express();
const allowedOrigins = [process.env.FRONTEND_URL, "http://localhost:3000"];

app.use(cors({
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error("Not allowed by CORS"));
        }
    },
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
    credentials: true
}));
app.use(express.json());

let spotifyAccessToken = "";

// 🔹 Get Spotify Access Token
async function getSpotifyToken() {
    const response = await axios.post(
        "https://accounts.spotify.com/api/token",
        "grant_type=client_credentials",
        {
            headers: {
                Authorization: `Basic ${Buffer.from(
                    process.env.SPOTIFY_CLIENT_ID + ":" + process.env.SPOTIFY_CLIENT_SECRET
                ).toString("base64")}`,
                "Content-Type": "application/x-www-form-urlencoded",
            },
        }
    );
    spotifyAccessToken = response.data.access_token;
}

getSpotifyToken(); // Run on startup

// 🔹 Search Songs in Spotify
app.get("/search", async (req, res) => {
    const query = req.query.q;
    if (!query) return res.status(400).json({ error: "Query is required" });

    try {
        const response = await axios.get(
            `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=10`,
            { headers: { Authorization: `Bearer ${spotifyAccessToken}` } }
        );
        
        res.json(response.data.tracks.items);
    } catch (error) {
        res.status(500).json({ error: "Spotify API error" });
    }
});

// Endpoint to get all added songs from Firestore
app.get("/added-songs", async (req, res) => {
    try {
        const snapshot = await db.collection("playlist").get();
        const songs = snapshot.docs.map((doc) => doc.data());
        res.json(songs);
    } catch (error) {
        res.status(500).json({ error: "Error fetching added songs" });
    }
});

// Endpoint to update song with a new nickname
app.post("/update-song", async (req, res) => {
    const { songId, newNickname } = req.body;

    if (!songId || !newNickname) {
        return res.status(400).json({ error: "Song ID and nickname are required" });
    }

    try {
        // Reference to the 'playlist' collection in Firestore
        const playlistRef = db.collection("playlist");

        // Query to find the song by its unique ID (assuming 'song.id' is the unique identifier)
        const songSnapshot = await playlistRef.where('song.id', '==', songId).get();

        // If no song was found
        if (songSnapshot.empty) {
            return res.status(404).json({ error: "Song not found" });
        }

        // Get the first matching song document (you should only expect one match)
        const songDoc = songSnapshot.docs[0];
        const songData = songDoc.data();

        // Append the new nickname to the existing nicknames array
        const updatedNicknames = [...songData.nicknames, newNickname];

        // Update the song document in Firestore with the new list of nicknames
        await songDoc.ref.update({
            nicknames: updatedNicknames
        });

        // Return success message
        res.json({ message: "Nickname added successfully!" });
    } catch (error) {
        console.error("Error updating song:", error);
        res.status(500).json({ error: "Error updating song" });
    }
});

// 🔹 Add Selected Song + Nickname to Firestore
app.post("/add-song", async (req, res) => {
    const { song, nickname } = req.body;
    if (!song) return res.status(400).json({ error: "Song & nickname required" });

    try {
        await db.collection("playlist").add({ song, nickname, timestamp: Date.now() });
        res.json({ message: "Song added successfully!" });
    } catch (error) {
        res.status(500).json({ error: "Error adding song" });
    }
});


app.listen(5001, () => console.log("Server running on port 5001"));