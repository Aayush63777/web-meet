# Contributing to QuickMeet

Thank you for your interest in contributing! This document provides guidelines for contributing to the QuickMeet project.

## Code of Conduct

- Be respectful and inclusive
- Provide constructive feedback
- Follow coding standards
- Report security issues responsibly

---

## Getting Started

### 1. Fork the Repository

```bash
# Click "Fork" button on GitHub
```

### 2. Clone Your Fork

```bash
git clone https://github.com/yourusername/quickmeet.git
cd quickmeet
```

### 3. Set Up Development

```bash
npm install
npm run dev
```

### 4. Create Feature Branch

```bash
git checkout -b feature/your-feature-name
```

---

## Development Workflow

### Before Starting

- Check [Issues](https://github.com/yourusername/quickmeet/issues) for existing work
- Create an issue if proposing new feature
- Get consensus before major changes

### While Developing

1. **Write clean code**
   - Follow [JavaScript Style Guide](#javascript-style-guide)
   - Add comments for complex logic
   - Keep functions small and focused

2. **Write tests**
   ```bash
   npm test
   ```
   - Add tests for new features
   - Ensure all tests pass
   - Target >80% coverage

3. **Test in browser**
   - Open F12 DevTools
   - Check console for errors
   - Test on multiple browsers
   - Test on mobile if applicable

4. **Update documentation**
   - Update README.md if needed
   - Add comments to code
   - Update ARCHITECTURE.md if major changes

### Commit Guidelines

**Commit Message Format:**
```
<type>(<scope>): <subject>

<body>

<footer>
```

**Type:**
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation only
- `style:` - Code formatting
- `refactor:` - Code restructuring
- `perf:` - Performance improvement
- `test:` - Test additions/changes
- `chore:` - Build, dependencies, etc.

**Example:**
```
feat(whiteboard): Add color picker to drawing tools

- Added 10-color palette
- Implements color selection UI
- Updates draw events with color data

Fixes #123
```

**Rules:**
- Use present tense ("add" not "added")
- Be descriptive but concise
- Reference issue numbers when applicable
- Each commit should be atomic

---

## JavaScript Style Guide

### Naming

```javascript
// Variables & functions: camelCase
const userId = '123';
function getUserData() { }

// Constants: UPPER_SNAKE_CASE
const MAX_PARTICIPANTS = 200;

// Classes: PascalCase
class RoomStore { }

// Booleans: is/has prefix
const isConnected = true;
const hasError = false;
```

### Structure

```javascript
// Good - clear and organized
function joinRoom(roomId, username) {
  // Validate input
  if (!roomId || !username) {
    return null;
  }

  // Process
  const room = this.createRoom(roomId);
  room.addParticipant({ id: username });

  // Return result
  return room;
}

// Bad - unclear, no comments
function j(r, u) {
  if (!r || !u) return null;
  let x = this.cr(r);
  x.ap({ i: u });
  return x;
}
```

### Formatting

```javascript
// 2 spaces for indentation
if (condition) {
  doSomething();
}

// Multiline objects
const config = {
  port: 3000,
  host: 'localhost',
  maxConnections: 100,
};

// Arrow functions for callbacks
array.forEach(item => {
  console.log(item);
});

// Template literals for strings
const msg = `Hello, ${name}!`;
```

### Comments

```javascript
// ✅ Good - explains why
// Wait for socket connection before joining room
// This prevents race condition where room state hasn't synced
socket.once('connect', emitJoinRoom);

// ❌ Bad - states the obvious
// Set connected to true
connected = true;

// ✅ Good - complex logic
// Implements Exponential Backoff with jitter
// for WebRTC ICE candidate gathering
const delay = Math.random() * Math.pow(2, attempt) * 100;
```

---

## CSS/SCSS Style Guide

### Structure

```scss
// Variables
$primary: #4ecca3;
$dark: #393e46;
$spacing: 16px;

// Mixins
@mixin flex-center {
  display: flex;
  justify-content: center;
  align-items: center;
}

// Components
.button {
  padding: $spacing;
  background: $primary;
  border: none;
  border-radius: 4px;
  cursor: pointer;

  &:hover {
    opacity: 0.9;
  }

  &:active {
    opacity: 0.8;
  }
}
```

### Guidelines

- Use SCSS variables for colors and sizing
- Use nesting for related selectors
- Use mixins for repeated patterns
- Mobile-first responsive design
- Avoid !important (almost always)

---

## Testing

### Writing Tests

```javascript
// tests/myfeature.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { MyModule } = require('../server/mymodule');

test('feature works correctly', () => {
  const result = MyModule.doSomething();
  assert.equal(result, expectedValue);
});

test('handles errors gracefully', () => {
  assert.throws(() => {
    MyModule.doSomething(null);
  });
});
```

### Running Tests

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage (if available)
npm run test:coverage
```

---

## Pull Request Process

### 1. Push to Your Fork

```bash
git push origin feature/your-feature-name
```

### 2. Open Pull Request

- Go to original repository
- Click "Compare & pull request"
- Fill in PR template
- Describe changes clearly

### 3. PR Title Format

```
feat: Add new feature
fix: Resolve issue #123
docs: Update installation guide
```

### 4. PR Description Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Changes Made
- Change 1
- Change 2
- Change 3

## Testing Done
- [ ] Unit tests added
- [ ] Tested in browser
- [ ] Verified on mobile
- [ ] No console errors

## Related Issues
Fixes #123

## Checklist
- [ ] Code follows style guide
- [ ] Tests passing
- [ ] Documentation updated
- [ ] No breaking changes
```

### 5. Code Review

- Address feedback promptly
- Ask for clarification if needed
- Update code as requested
- Push changes to same branch

---

## Bug Reports

### Create an Issue

Title:
```
[BUG] Brief description of issue
```

Description:
```markdown
## Description
What is the bug?

## Steps to Reproduce
1. Step 1
2. Step 2
3. Step 3

## Expected Behavior
What should happen

## Actual Behavior
What actually happens

## Environment
- OS: Windows/Mac/Linux
- Browser: Chrome/Firefox/Safari
- Version: 1.0.0

## Logs/Screenshots
Any relevant console output or screenshots
```

---

## Feature Requests

### Create an Issue

Title:
```
[FEATURE] Brief description of feature
```

Description:
```markdown
## Description
What is the feature?

## Use Case
Why do we need this?

## Proposed Solution
How should it work?

## Alternative Solutions
Any other approaches?

## Additional Context
Any other relevant info
```

---

## Documentation Standards

### Code Comments

```javascript
// Single line comments for brief explanations
// Use on line above or at end of line

/*
 * Multi-line comments for complex explanations
 * Describe what function does, parameters, and return
 */
```

### Documentation Files

- Use Markdown format (.md)
- Include table of contents for long docs
- Add code examples
- Keep up-to-date with changes

### README Section

```markdown
## [Feature Name]

Description of feature.

### Usage

```javascript
// Code example
```

### Related
- Link to related files
- Link to documentation
```

---

## Performance Guidelines

### Frontend

- Minimize DOM queries
- Use event delegation
- Batch DOM updates
- Avoid unnecessary re-renders
- Clean up listeners

### Backend

- Avoid N+1 queries
- Use efficient data structures
- Implement caching
- Monitor memory usage
- Handle connections gracefully

---

## Security Guidelines

### Input Validation

```javascript
// ✅ Good
if (!userId || typeof userId !== 'string') {
  throw new Error('Invalid userId');
}

// ❌ Bad
const user = getUserById(userId); // No validation
```

### XSS Prevention

```javascript
// ❌ Bad - XSS vulnerability
element.innerHTML = userInput;

// ✅ Good
element.textContent = userInput;
// or
sanitize(userInput);
```

### Error Handling

```javascript
// ✅ Good
try {
  const result = performOperation();
  socket.emit('success', result);
} catch (error) {
  console.error('Operation failed:', error);
  socket.emit('error', error.message);
}

// ❌ Bad
const result = performOperation(); // No error handling
```

---

## Debugging Tips

### Browser DevTools

- F12 to open DevTools
- Console tab for logs
- Network tab for requests
- Elements tab for DOM
- Sources tab for debugging

### Server Debugging

```bash
# With detailed logging
DEBUG=* npm run dev

# Check specific module
DEBUG=socket.io npm run dev
```

---

## Resources

- [Git Documentation](https://git-scm.com/doc)
- [GitHub Flow Guide](https://guides.github.com/introduction/flow/)
- [Semantic Versioning](https://semver.org/)
- [Conventional Commits](https://www.conventionalcommits.org/)

---

## Questions?

- Create a discussion on GitHub
- Email: support@quickmeet.app
- Check [DEVELOPMENT.md](DEVELOPMENT.md) for more help

---

## Recognition

Contributors will be:
- Added to CONTRIBUTORS.md
- Mentioned in release notes
- Credited in documentation

---

**Thank you for contributing to QuickMeet!** 🙏

Your efforts help make this a better project for everyone. We appreciate your time and expertise!
