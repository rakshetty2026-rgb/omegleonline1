# OmegleOnline

Random stranger video + text chat. WebRTC (peer-to-peer video) + Socket.IO (matching/signaling).

## Run locally
    npm install
    npm start        # http://localhost:3000  (camera works on localhost)

## Deploy (needs Node 18+ and HTTPS — camera/mic are blocked on plain http)
- **Render / Railway / Heroku / Fly:** upload/connect the folder. Build: `npm install`, Start: `npm start`. They set PORT and HTTPS automatically.
- **Docker:** `docker build -t omegleonline . && docker run -p 3000:3000 omegleonline`
- **VPS:** `npm install && npm i -g pm2 && pm2 start server.js`, then put Nginx/Caddy in front with HTTPS and WebSocket upgrade enabled.

## Important for production
- **TURN server:** STUN alone fails for ~15-20% of users. Set `ICE_SERVERS` env var (see .env.example) with a TURN service (Twilio, Metered, or self-hosted coturn).
- **Scale:** matching state is in memory = one server instance. For multiple instances use the Socket.IO Redis adapter + a shared queue.
- **Moderation:** includes 18+ gate, Report button, auto 1-hour ban after 5 reports, message rate limiting. Omegle shut down largely over abuse; add stronger moderation (e.g. nudity detection, legal/Terms/Privacy pages, abuse contact) before public launch.
