# Spotify Token Generator

A simple web service for generating anonymous Spotify tokens.

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Vercel Ready](https://img.shields.io/badge/Vercel-Serverless-black.svg)](https://vercel.com/)

---

## Table of Contents

- [Overview](#overview)
- [How It Works](#how-it-works)
  - [Authentication Mechanism](#authentication-mechanism)
  - [Algorithm Breakdown](#algorithm-breakdown)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Running the Server](#running-the-server)
- [API Reference](#api-reference)
  - [GET /api/getToken](#get-apigettoken)
  - [GET /api/health](#get-apihealth)
  - [GET /](#get-)
- [Automation and Secret Management](#automation-and-secret-management)
- [Deployment](#deployment)
  - [Deploying to Vercel](#deploying-to-vercel)
  - [Deploying with PM2 or Docker](#deploying-with-pm2-or-docker)
- [Client Integration Examples](#client-integration-examples)
  - [cURL](#curl)
  - [JavaScript (Fetch API)](#javascript-fetch-api)
  - [Python (requests)](#python-requests)

---

## Overview

Spotify Web Player relies on time-based one-time password (TOTP) challenges to issue anonymous access tokens for client sessions. These tokens allow web clients to query metadata, search catalogs, and access player capabilities without requiring full user OAuth login.

This project automates the entire lifecycle:
- Scrapes the latest JavaScript bundles from the Spotify Web Player.
- Extracts and indexes versioned cryptographic secrets.
- Synchronizes with Spotify official server time.
- Generates valid 6-digit TOTP codes using Spotify customized cipher.
- Exchanges TOTP verification for access tokens via Spotify internal API.
- Exposes a clean, CORS-enabled REST API ready for serverless or standalone deployment.

---

## How It Works

### Authentication Mechanism

```
+--------------------------+       1. Scrape bundle URL       +--------------------------+
|                          | -------------------------------> |                          |
|  Secret Scraper Service  |                                  |   Spotify Web Player     |
|                          | <------------------------------- |   (open.spotify.com)     |
+--------------------------+    2. Extract versioned secret   +--------------------------+
             |
             v
+--------------------------+       3. Fetch Server Time       +--------------------------+
|                          | -------------------------------> |   Spotify Server Time    |
|   Token Generator Core   | <------------------------------- |   (/api/server-time)     |
|                          |       4. Return timestamp        +--------------------------+
|                          |
|                          |       5. Request Token (TOTP)    +--------------------------+
|                          | -------------------------------> |   Spotify Token API      |
|                          | <------------------------------- |   (/api/token)           |
+--------------------------+       6. Return Access Token     +--------------------------+
             |
             v
     [ Client / App ]
```

1. **Secret Harvesting**: The service inspects `https://open.spotify.com/` to locate the active `web-player.[hash].js` bundle and extracts the embedded `{ secret, version }` definitions.
2. **Server Time Sync**: It queries `https://open.spotify.com/api/server-time` to ensure clock drift does not invalidate the time counter.
3. **TOTP Calculation**: It applies a custom XOR byte transformation to the secret array, runs an HMAC-SHA1 hash over the 30-second time counter, and extracts the 6-digit code.
4. **Token Exchange**: It performs a GET request to `https://open.spotify.com/api/token` with the generated TOTP parameters and returns the JSON payload.

### Algorithm Breakdown

The TOTP generation follows standard RFC 6238 time-step principles with Spotify proprietary secret obfuscation:

```javascript
// Step 1: XOR transform on secret byte array
const transformed = secretArray.map((byte, idx) => byte ^ ((idx % 33) + 9));

// Step 2: Convert to byte buffer and calculate 30-second interval counter
const counter = Math.floor(serverTimestamp / 30);
const counterBuffer = Buffer.alloc(8);
counterBuffer.writeBigUInt64BE(BigInt(counter));

// Step 3: Compute HMAC-SHA1 signature
const hmac = crypto.createHmac('sha1', secretBytes).update(counterBuffer).digest();

// Step 4: Dynamic truncation to 6 digits
const offset = hmac[hmac.length - 1] & 0x0f;
const code = ((hmac[offset] & 0x7f) << 24) |
             ((hmac[offset + 1] & 0xff) << 16) |
             ((hmac[offset + 2] & 0xff) << 8) |
             (hmac[offset + 3] & 0xff);

const totp = (code % 1000000).toString().padStart(6, '0');
```

---

## Getting Started

### Prerequisites

- Node.js 18.0.0 or higher (Node.js 20+ recommended)
- npm or yarn or pnpm

### Installation

Clone the repository and install the dependencies:

```bash
git clone https://github.com/nicolelogan-ctrl/tokener-spotify.git
cd tokener-spotify
npm install
```

### Running the Server

Start the local server in production mode:

```bash
npm start
```

Start the local server with hot-reloading (Node.js watch mode):

```bash
npm run dev
```

By default, the server listens on `http://localhost:37353`. You can customize the port by setting the `PORT` environment variable:

```bash
PORT=8080 npm start
```

---

## API Reference

### GET /api/getToken

Generates and returns an anonymous Spotify authentication token.

#### Request

```http
GET /api/getToken HTTP/1.1
Host: localhost:37353
Accept: application/json
```

#### Successful Response (200 OK)

```json
{
  "clientId": "d8a5ed958d274c2e8ee717e6a4b0971d",
  "accessToken": "BQC...[truncated]...",
  "accessTokenExpirationTimestampMs": 1724058000000,
  "isAnonymous": true
}
```

#### Error Response (500 Internal Server Error)

```json
{
  "error": "Unable to extract Spotify secrets: Player JS URL not found in Spotify homepage"
}
```

---

### GET /api/health

Returns the health status and current timestamp of the generator service.

#### Request

```http
GET /api/health HTTP/1.1
Host: localhost:37353
```

#### Successful Response (200 OK)

```json
{
  "status": "ok",
  "service": "tokener-spotify",
  "timestamp": "2026-08-19T05:29:19.457Z"
}
```

---

### GET /

Returns general service metadata and available endpoint links.

#### Successful Response (200 OK)

```json
{
  "name": "tokener-spotify",
  "description": "Spotify authentication token generator with TOTP verification",
  "endpoints": {
    "getToken": "GET /api/getToken",
    "health": "GET /api/health"
  }
}
```

---

## Automation and Secret Management

Spotify periodically rotates client bundle URLs and internal secrets. This repository includes an automated update pipeline:

### Manual Secret Update

Run the update script to scrape Spotify and update the JSON files in the `secrets/` directory:

```bash
npm run update:secrets
```

Or run via the script directly:

```bash
node scripts/update-secrets.js
```

### GitHub Actions Cron Job

The workflow defined in `.github/workflows/update-secrets.yml` runs every hour (`0 * * * *`). It performs the following steps:
1. Checks out the repository.
2. Sets up Node.js 20.
3. Installs dependencies.
4. Executes the secret scraper.
5. Commits and pushes any detected changes back to the main branch.

---

## Deployment

### Deploying to Vercel

This repository is pre-configured for instant deployment on Vercel:

1. Install the Vercel CLI or link the repository via the Vercel Dashboard:
   ```bash
   npm i -g vercel
   vercel
   ```
2. The `vercel.json` file automatically routes incoming requests to `./index.js` using `@vercel/node`.
3. Once deployed, the endpoint will be live at `https://your-vercel-domain.vercel.app/api/getToken`.

### Deploying with PM2 or Docker

#### Using PM2

```bash
npm install -g pm2
pm2 start src/server.js --name "tokener-spotify"
```

#### Using Docker

Create a `Dockerfile` in the root folder:

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 37353
CMD ["node", "src/server.js"]
```

Build and run the container:

```bash
docker build -t tokener-spotify .
docker run -p 37353:37353 -d tokener-spotify
```

---

## Client Integration Examples

### cURL

```bash
curl -s http://localhost:37353/api/getToken | jq .
```

### JavaScript (Fetch API)

```javascript
async function getSpotifyToken() {
  const response = await fetch('http://localhost:37353/api/getToken');
  if (!response.ok) {
    throw new Error(`Failed to fetch token: ${response.status}`);
  }
  const data = await response.json();
  console.log('Access Token:', data.accessToken);
  return data;
}

getSpotifyToken();
```

### Python (requests)

```python
import requests

def get_spotify_token():
    url = "http://localhost:37353/api/getToken"
    response = requests.get(url)
    response.raise_for_status()
    data = response.json()
    print("Access Token:", data.get("accessToken"))
    return data

if __name__ == "__main__":
    get_spotify_token()
```

---

### Disclaimer

This project is intended strictly for educational, research, and authorized personal development purposes. It is not affiliated with, maintained by, or endorsed by Spotify AB. Use of the Spotify Web API and Spotify Web Player services is subject to Spotify Developer Terms of Service and applicable laws.
