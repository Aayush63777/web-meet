# Development Guide

## Getting Started

### Prerequisites
- Node.js v14+
- npm v6+
- Code editor (VS Code recommended)
- Git

### Setup Development Environment

```bash
# Clone and install
git clone https://github.com/yourusername/quickmeet.git
cd quickmeet
npm install

# Start development server with auto-reload
npm run dev

# In another terminal, run tests
npm test
```

---

## Development Workflow

### File Structure

```
quickmeet/
├── index.js                    # Express server entry point
├── server/
│   └── roomStore.js           # Room state management
├── public/
│   ├── index.html             # Landing page UI
│   ├── room.html              # Meeting room UI
│   ├── js/
│   │   ├── landing.js         # Landing page logic
│   │   └── room.js            # Meeting room & WebRTC logic
│   └── css/
│       ├── style.scss         # SCSS source (edit this)
│       └── style.css          # Compiled CSS (auto-generated)
└── tests/
    └── roomStore.test.js      # Unit tests
```

### Key Files

#### index.js - Express Server
- Sets up Express app
- Configures Socket.io
- Defines API routes
- Handles socket events

#### server/roomStore.js - State Management
- Manages room creation/deletion
- Tracks participants
- Handles media state
- Persists whiteboard data

#### public/js/room.js - Main Logic (850+ lines)
- WebRTC peer connection setup
- Signaling (offer/answer/ICE)
- Whiteboard functionality
- Chat implementation
- Media control handling

#### public/js/landing.js - Landing Logic
- Room creation
- Room code entry
- Device preview
- Media permission handling

---

## Common Development Tasks

### Add a New Feature

1. **Identify the module**
   - Frontend feature → Edit `public/js/room.js` or `landing.js`
   - Backend feature → Edit `index.js` or `server/roomStore.js`

2. **Implement the feature**
   ```javascript
   // Example: Add typing indicator
   socket.on('user-typing', (userId) => {
     // Handle typing indicator
   });
   ```

3. **Write tests**
   ```bash
   npm test
   ```

4. **Test in browser**
   - F12 → Console tab
   - Check for errors
   - Verify functionality

### Fix a Bug

1. **Reproduce the bug**
   - Open browser (F12)
   - Note exact steps to reproduce
   - Check console for errors

2. **Locate the code**
   - Use browser's source map (CTRL+Shift+P in DevTools)
   - Search code for relevant functions

3. **Debug and fix**
   ```javascript
   // Add console.log for debugging
   console.log('Debug value:', variable);
   ```

4. **Test the fix**
   - Verify bug is gone
   - Check for new issues
   - Run tests

### Add a Style

1. **Edit SCSS file**
   ```bash
   # Edit style.scss
   nano public/css/style.scss
   ```

2. **Compile to CSS**
   ```bash
   # Using SASS compiler (or online tools)
   sass public/css/style.scss public/css/style.css
   ```

3. **Verify in browser**
   - Hard refresh (Ctrl+Shift+R)
   - Check styles applied

### Add a Unit Test

1. **Create test file** (or edit existing)
   ```javascript
   // tests/roomStore.test.js
   test('new feature works correctly', () => {
     // Test code here
   });
   ```

2. **Run tests**
   ```bash
   npm test
   ```

3. **Fix until passing**

---

## Debugging

### Browser Console (F12)

View logs and errors:
```javascript
// Good console output
✅ Socket connected: abc123xyz
Joined room: room-id as YourName

// Bad console output (red errors)
❌ Socket disconnected
Uncaught ReferenceError: variable is not defined
```

### Server Logs

```bash
# Start server with detailed logging
DEBUG=* npm run dev

# Output shows:
Server is up and running on port 3000
✅ Socket connected: abc123xyz
User 'Alice' joined room: room-123
```

### Browser DevTools

**Elements Tab:** Inspect HTML structure
```html
<div class="video-box">
  <video class="video-frame"></video>
  <div class="nametag">Alice</div>
</div>
```

**Network Tab:** Check socket.io connection
- Look for WebSocket upgrades
- Check status codes (101 = good)

**Console Tab:** Run JavaScript
```javascript
// Check socket status
console.log(socket.connected);  // true/false

// Check peer connections
console.log(connections);       // List of connections

// Manually emit event
socket.emit('message', 'test', 'TestUser', 'room-123');
```

---

## Testing

### Run Tests

```bash
# Run all tests once
npm test

# Watch mode (re-run on changes)
npm run test:watch
```

### Expected Output

```
✔ joinRoom tracks participants and state (0.97ms)
✔ updateParticipantState and leaveRoom keep room state in sync (0.20ms)

Tests: 2 passed
Suites: 1
Duration: 102ms
```

### Write a Test

```javascript
// tests/myfeature.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { MyModule } = require('../server/mymodule');

test('my feature works', () => {
  const result = MyModule.doSomething();
  assert.equal(result, expectedValue);
});
```

---

## Code Style

### JavaScript Style Guide

**Naming Conventions:**
```javascript
// Variables & functions: camelCase
const roomId = 'room-123';
function joinRoom() { }

// Constants: UPPER_SNAKE_CASE
const MAX_PARTICIPANTS = 200;
const STUN_SERVER = 'stun:stun.stunprotocol.org';

// Classes: PascalCase
class RoomStore { }

// Boolean: is/has prefix
const isConnected = true;
const hasParticipants = false;
```

**Formatting:**
```javascript
// Good
if (condition) {
  doSomething();
}

// Good - multiline
const config = {
  port: 3000,
  maxParticipants: 200,
};

// Bad - avoid single letter variables (except i in loops)
const x = getValue();
const a = x + 5;

// Good
const value = getValue();
const total = value + 5;
```

### CSS Style Guide

**Use SCSS:**
```scss
// Use variables
$primary: #4ecca3;
$dark: #393e46;

// Use nesting
.button {
  background: $primary;
  
  &:hover {
    opacity: 0.8;
  }
}

// Use mixins
@mixin flex-center {
  display: flex;
  justify-content: center;
  align-items: center;
}
```

---

## Performance Optimization

### Frontend Optimization

```javascript
// ❌ Bad - DOM queries in loops
for (let i = 0; i < 1000; i++) {
  document.querySelector('.item').innerHTML += 'text';
}

// ✅ Good - Query once, batch updates
const container = document.querySelector('.item');
let html = '';
for (let i = 0; i < 1000; i++) {
  html += 'text';
}
container.innerHTML = html;
```

### Event Delegation

```javascript
// ❌ Bad - Listener on each element
document.querySelectorAll('.btn').forEach(btn => {
  btn.addEventListener('click', handler);
});

// ✅ Good - Single listener on parent
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('btn')) {
    handler();
  }
});
```

### Memory Management

```javascript
// Remove listeners when done
socket.off('message');
socket.off('connect');

// Clear references
connections[socketId] = null;
delete connections[socketId];

// Use const, not global variables
const someValue = 123;  // ✅ Good
globalThis.someValue = 123;  // ❌ Bad
```

---

## Version Control

### Git Workflow

```bash
# Create feature branch
git checkout -b feature/new-feature

# Make changes
git add .
git commit -m "feat: Add new feature"

# Push to remote
git push origin feature/new-feature

# Create pull request on GitHub
```

### Commit Messages

```
feat: Add typing indicator feature
fix: Resolve chat XSS vulnerability
docs: Update installation guide
style: Format CSS with prettier
refactor: Extract video creation to function
test: Add unit tests for roomStore
chore: Update dependencies
```

### Branch Naming

```
feature/user-authentication
fix/socket-connection-error
docs/api-documentation
refactor/whiteboard-module
```

---

## Deployment

### Before Deploying

1. **Run tests**
   ```bash
   npm test
   ```

2. **Check for errors**
   - Run server: `npm start`
   - Open browser console (F12)
   - Check for red errors

3. **Build optimizations**
   - Minify CSS & JS (if applicable)
   - Remove debug statements
   - Set NODE_ENV=production

4. **Security checks**
   - Fix XSS vulnerabilities
   - Validate user input
   - Check environment variables

### Deployment Checklist

- [ ] All tests passing
- [ ] No console errors
- [ ] Environment variables configured
- [ ] Security issues addressed
- [ ] Performance acceptable
- [ ] Documentation updated

---

## Resources

### Documentation
- [Express.js Docs](https://expressjs.com/)
- [Socket.io Docs](https://socket.io/docs/)
- [WebRTC MDN Guide](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API)
- [Node.js Docs](https://nodejs.org/api/)

### Tools
- [VS Code](https://code.visualstudio.com/) - Code editor
- [Chrome DevTools](https://developer.chrome.com/docs/devtools/) - Debugging
- [Postman](https://www.postman.com/) - API testing
- [Git Docs](https://git-scm.com/doc) - Version control

### Learning
- [WebRTC Academy](https://webrtcfordummies.com/)
- [Socket.io Tutorial](https://socket.io/get-started/chat)
- [Express Tutorial](https://developer.mozilla.org/en-US/docs/Learn/Server-side/Express_Nodejs)

---

## FAQ

### Q: How do I debug Socket.io events?
**A:** Add logging in event handlers:
```javascript
socket.on('connect', () => {
  console.log('✅ Connected:', socket.id);
});
```

### Q: How do I add a new Socket.io event?
**A:** In `index.js`:
```javascript
socket.on('new-event', (data) => {
  console.log('Event received:', data);
});
```

### Q: How do I test on mobile?
**A:** 
```bash
# Get your IP
ipconfig  # Windows
ifconfig  # Mac/Linux

# Access from mobile on same network
http://<YOUR-IP>:3000
```

### Q: How do I handle errors better?
**A:**
```javascript
try {
  // Code that might fail
} catch (error) {
  console.error('Error:', error);
  socket.emit('error', error.message);
}
```

---

## Support

- Check [README.md](README.md) for overview
- Check [ARCHITECTURE.md](ARCHITECTURE.md) for design
- See [INSTALL.md](INSTALL.md) for setup help
- Open issue on GitHub for problems

---

**Last Updated:** August 11, 2026  
**Version:** 1.0.0  
**Status:** Active Development ✅
