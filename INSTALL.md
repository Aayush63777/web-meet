# Installation Guide

## Prerequisites

- **Node.js:** v14 or higher ([Download](https://nodejs.org/))
- **npm:** v6 or higher (comes with Node.js)
- **Git:** Latest version ([Download](https://git-scm.com/))
- **Modern Browser:** Chrome, Firefox, Safari, or Edge with WebRTC support

## Installation Steps

### 1. Clone Repository

```bash
git clone https://github.com/yourusername/quickmeet.git
cd quickmeet
```

### 2. Install Dependencies

```bash
npm install
```

This installs all required packages:
- `express` - Web framework
- `socket.io` - Real-time communication
- `uuid` - Room ID generation
- `moment` - Timestamp formatting
- `webrtc-adapter` - WebRTC compatibility
- `nodemon` - Development auto-reload

### 3. Verify Installation

```bash
npm test
```

Expected output:
```
✔ joinRoom tracks participants and state
✔ updateParticipantState and leaveRoom keep room state in sync

Tests: 2 passed
Duration: ~100ms
```

### 4. Start Server

```bash
npm start
```

Output should show:
```
Server is up and running on port 3000
```

### 5. Access Application

Open browser and navigate to:
```
http://localhost:3000
```

You should see the landing page with:
- "QuickMeet - Video Call & Chat" title
- "Create Room" button
- Room code input
- Camera/microphone preview

---

## Development Setup

### With Auto-Reload

```bash
npm run dev
```

This uses `nodemon` to automatically restart the server when files change.

### Watch Mode Tests

```bash
npm run test:watch
```

Runs tests and re-runs them when test files change.

---

## Environment Configuration

### Create .env File

```bash
cp .env.example .env
```

Edit `.env` with your settings:

```env
# Server
PORT=3000
NODE_ENV=development

# Room Configuration
MAX_PARTICIPANTS=200

# WebRTC STUN Server
STUN_SERVER=stun:stun.stunprotocol.org

# Logging
DEBUG=false
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Server port |
| `NODE_ENV` | development | Environment mode |
| `MAX_PARTICIPANTS` | 200 | Max room size |
| `STUN_SERVER` | stun:stun.stunprotocol.org | WebRTC STUN server |
| `DEBUG` | false | Enable debug logging |

---

## Docker Installation

### Build Docker Image

```bash
docker build -t quickmeet .
```

### Run Docker Container

```bash
docker run -p 3000:3000 quickmeet
```

### Docker Compose

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  quickmeet:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
      - MAX_PARTICIPANTS=200
```

Start:
```bash
docker-compose up
```

---

## Cloud Deployment

### Vercel

```bash
npm install -g vercel

vercel deploy

# For production
vercel deploy --prod
```

### Heroku

```bash
# Login
heroku login

# Create app
heroku create quickmeet

# Deploy
git push heroku main

# View logs
heroku logs --tail
```

### AWS

```bash
# Using AWS CLI
aws eb create quickmeet --instance-type t3.micro

# Deploy
eb deploy
```

---

## Troubleshooting

### Port Already in Use

```bash
# Windows - Find process using port 3000
netstat -ano | grep 3000

# Kill the process (replace PID)
taskkill /PID <PID> /F

# Or use different port
PORT=5000 npm start
```

### Dependencies Installation Failed

```bash
# Clear npm cache
npm cache clean --force

# Remove node_modules and package-lock
rm -rf node_modules package-lock.json

# Reinstall
npm install
```

### Module Not Found Error

```bash
# Ensure all dependencies installed
npm install

# Check if node_modules exists
ls node_modules/

# Or
dir node_modules
```

### Socket.io Connection Failed

- Check if server is running on correct port
- Verify browser has WebSocket support
- Check browser console for errors (F12)
- Ensure firewall allows port 3000

---

## Verification Checklist

After installation, verify:

- [ ] `npm install` completed without errors
- [ ] `npm test` shows 2/2 passing
- [ ] `npm start` runs without errors
- [ ] Server listens on port 3000
- [ ] Landing page loads: `http://localhost:3000`
- [ ] Browser console shows no errors (F12)
- [ ] Can create a room
- [ ] Can enter name and join
- [ ] Video preview works
- [ ] WebRTC connects successfully

---

## Next Steps

1. **Development** - See [DEVELOPMENT.md](DEVELOPMENT.md)
2. **Architecture** - See [ARCHITECTURE.md](ARCHITECTURE.md)
3. **Testing** - Run `npm test`
4. **Deployment** - Follow cloud provider guides above

---

## Support

If you encounter issues:

1. Check this guide's troubleshooting section
2. Review browser console (F12 → Console)
3. Check server logs
4. Open an issue on GitHub
5. Check [DEVELOPMENT.md](DEVELOPMENT.md) for more help

---

**Installation Date:** August 11, 2026  
**Version:** 1.0.0  
**Status:** Ready for Production ✅
