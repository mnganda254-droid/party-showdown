# Party Showdown

## Run locally

Install Node.js 18 or newer, then run:

```bash
npm start
```

Open http://localhost:3000.

## Deploy on Render

Create a **Web Service** from this repository.

- Runtime: Node
- Build command: `npm install`
- Start command: `npm start`

The server reads the port from `process.env.PORT` and binds to `0.0.0.0`.

Note: the current prototype stores active rooms in memory. Rooms are not durable and will be lost if the service restarts or scales to multiple instances. Use a shared database/pub-sub service before relying on it for production events.
