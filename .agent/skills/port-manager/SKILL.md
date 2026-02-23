---
name: Port Manager
description: Protocol for preventing port collisions, zombie processes, and browser cache conflicts when running multiple dev servers simultaneously
---

# Port Manager

A comprehensive protocol for managing multiple local development servers without conflicts. Use this skill whenever setting up a new project, starting dev servers, or debugging "glitchy" behavior caused by port collisions.

## Purpose

When working on multiple projects that each run a local dev server, things break in subtle ways:

- Two servers try to bind to the same port (e.g., `3000`)
- Zombie processes hold onto ports after a crash
- Browser caches serve stale assets from a different project
- Service workers from one project intercept requests for another

This skill prevents all of that.

## Prerequisites

- Node.js / npm installed
- macOS (uses `lsof` and `kill` — adjust for Linux/Windows if needed)

## Instructions

### Step 1: Assign a Unique Port to the Project

Every project MUST have its own dedicated port. Use this registry as a reference, and update it when adding new projects.

**Port Registry (update as needed):**

| Project | Port | Status |
|---|---|---|
| `finance-dashboard` | `3000` | ✅ Configured |
| `notary-course-final` | `3001` | ✅ Configured |
| `octadre-web` | `3002` | ✅ Configured |
| *Next project* | `3003+` | — |

Set the port explicitly in the project's server file (e.g., `server.js`):

```javascript
require('dotenv').config(); // if using .env
const PORT = process.env.PORT || 3001; // unique default per project
```

**Expected Outcome:** Each project always starts on its designated port, even without a `.env` file.

### Step 2: Create a `.env` File

In the project root, create a `.env` file:

```
PORT=3001
```

Make sure `.env` is in `.gitignore`:

```
echo ".env" >> .gitignore
```

Install `dotenv` if the project uses Node.js and doesn't already have it:

```bash
npm install dotenv
```

Then load it at the top of your server entry point:

```javascript
require('dotenv').config();
```

**Expected Outcome:** The port is configured externally and can be changed without editing code.

### Step 3: Kill Zombie Processes Before Starting

Before starting a dev server, clear any stale process on the target port.

**Manual check:**

```bash
lsof -i :<PORT>
```

**Kill it:**

```bash
kill -9 $(lsof -t -i :<PORT>)
```

**Automate it in `package.json`:**

```json
{
  "scripts": {
    "predev": "kill -9 $(lsof -t -i :$npm_package_config_port) 2>/dev/null; true",
    "dev": "node server.js",
    "config": {
      "port": "3001"
    }
  }
}
```

Or use the helper script included with this skill:

```bash
.agent/skills/port-manager/scripts/clear-port.sh <PORT>
```

**Expected Outcome:** The port is guaranteed to be free before the server starts.

### Step 4: Use Separate Terminal Tabs

Always run each project's server in its **own terminal tab or window**. Never stack multiple servers in one terminal session.

Benefits:
- Independent log streams per project
- Can restart one without affecting the other
- Easy to identify which project is producing errors

**Expected Outcome:** Clean, isolated log output per project.

### Step 5: Handle Browser-Side Conflicts

When switching between projects served on `localhost`, the browser can cause issues:

1. **Hard refresh** — `Cmd + Shift + R` (Mac) / `Ctrl + Shift + R` (Windows/Linux)
2. **Incognito window** — Bypass all cached assets, service workers, and cookies
3. **Clear site data** — DevTools → Application → Storage → "Clear site data"
4. **Disable cache in DevTools** — Network tab → check "Disable cache" (only active while DevTools is open)

**Expected Outcome:** No stale CSS, JS, or service workers bleeding across projects.

### Step 6: Verify the Setup

After configuring a project, run through this checklist:

- [ ] Project has a unique port assigned (check the Port Registry above)
- [ ] `.env` file exists with `PORT=<unique_port>`
- [ ] `.env` is in `.gitignore`
- [ ] `server.js` (or equivalent) reads from `process.env.PORT`
- [ ] `package.json` has a `predev` script to kill stale processes
- [ ] Project runs in its own dedicated terminal tab

## Examples

### Example 1: Setting Up a New Project

```bash
# 1. Create the project
mkdir my-new-app && cd my-new-app
npm init -y

# 2. Install dotenv
npm install dotenv

# 3. Create .env with the next available port
echo "PORT=3003" > .env
echo ".env" >> .gitignore

# 4. In server.js
require('dotenv').config();
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3003;

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
```

### Example 2: Clearing All Dev Ports at Once

```bash
# Using npx
npx kill-port 3000 3001 3002 3003

# Or using the helper script
.agent/skills/port-manager/scripts/clear-port.sh 3000 3001 3002 3003
```

### Example 3: Debugging a Port Conflict

```bash
# "Address already in use" error? Find who's using the port:
lsof -i :3000

# Output shows the PID — kill it:
kill -9 <PID>

# Or one-liner:
kill -9 $(lsof -t -i :3000)
```

## Best Practices

1. **Never rely on default ports** — Always set the port explicitly in `.env` and code
2. **Update the Port Registry** — Keep the table in Step 1 current when adding/removing projects
3. **Use `predev` scripts** — Automate port cleanup so you never forget
4. **One terminal per server** — Keeps logs clean and restarts independent
5. **Hard refresh after switching projects** — Especially if they share `localhost`
6. **Use incognito for testing** — Eliminates cache/cookie interference entirely

## Troubleshooting

**Problem:** `EADDRINUSE: address already in use :::3000`
**Solution:** Run `kill -9 $(lsof -t -i :3000)` then start the server again. If this happens often, add a `predev` script.

**Problem:** Styles from Project A showing up in Project B
**Solution:** Projects are on different ports but the browser cached assets. Hard refresh (`Cmd + Shift + R`) or open in incognito.

**Problem:** Service worker from another project intercepting requests
**Solution:** DevTools → Application → Service Workers → Unregister all. Then hard refresh.

**Problem:** `lsof` shows nothing but port is still "in use"
**Solution:** The OS may be holding the port in `TIME_WAIT` state. Wait 30 seconds or use a different port temporarily.

## Related Skills

- Skill Creator — for creating more skills like this one
