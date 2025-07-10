const express = require('express');
const request = require('request');
const querystring = require('querystring');
const crypto = require('crypto');
const dotenv = require('dotenv');
dotenv.config();

const router = express.Router();

const client_id = process.env.SPOTIFY_CLIENT_ID;
const client_secret = process.env.SPOTIFY_CLIENT_SECRET;
const redirect_uri = process.env.SPOTIFY_REDIRECT_URI;

let tokens = {
  access_token: null,
  refresh_token: null,
  expires_at: null
};

function generateRandomString(length) {
  return crypto.randomBytes(length).toString('hex').slice(0, length);
}

// /login
router.get('/login', function (req, res) {
  const state = generateRandomString(16);
  const scope = 'user-read-private user-read-email playlist-modify-private playlist-modify-public';

  res.redirect('https://accounts.spotify.com/authorize?' +
    querystring.stringify({
      response_type: 'code',
      client_id,
      scope,
      redirect_uri,
      state
    }));
});

// /callback
router.get('/callback', function (req, res) {
  const code = req.query.code || null;
  const state = req.query.state || null;

  if (!state) {
    return res.redirect('/#' + querystring.stringify({ error: 'state_mismatch' }));
  }

  const authOptions = {
    url: 'https://accounts.spotify.com/api/token',
    form: {
      code,
      redirect_uri,
      grant_type: 'authorization_code'
    },
    headers: {
      'Authorization': 'Basic ' + Buffer.from(client_id + ':' + client_secret).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    json: true
  };

  request.post(authOptions, function (error, response, body) {
    if (!error && response.statusCode === 200) {
      const { access_token, refresh_token, expires_in } = body;
      const expires_at = Date.now() + expires_in * 1000;

      tokens.refresh_token = refresh_token;
      tokens.access_token = access_token;
      tokens.expires_at = expires_at;

      res.cookie('token', access_token, {
        httpOnly: true,
        // Remove maxAge so cookie doesn't auto-expire
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'Lax'
      });

      res.cookie('refreshtoken', refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'Lax'
      });

      res.cookie('expires_at', expires_at.toString(), {  // Store as string to avoid formatting
        httpOnly: true,
        secure: false,
        sameSite: 'Lax'
      });

      console.log("access token is:", access_token);
      console.log("refresh token is:", refresh_token);
      console.log("expires in:", expires_in, "seconds");
      console.log("expires at:", new Date(expires_at).toLocaleString());

      res.redirect('/#');
    } else {
      res.redirect('/#' + querystring.stringify({ error: 'invalid_token' }));
    }
  });
});

async function refreshAccessToken(refresh_token) {
  return new Promise((resolve, reject) => {
    const authOptions = {
      url: 'https://accounts.spotify.com/api/token',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(client_id + ':' + client_secret).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      form: {
        grant_type: 'refresh_token',
        refresh_token
      },
      json: true
    };

    request.post(authOptions, function (error, response, body) {
      if (!error && response.statusCode === 200) {
        const { access_token, expires_in } = body;
        tokens.access_token = access_token;
        tokens.expires_at = Date.now() + expires_in * 1000;
        resolve({ access_token, expires_in });
      } else {
        reject(body || error);
      }
    });
  });
}

async function ensureValidAccessToken(req, res, next) {
  const access_token = req.cookies.token;
  const refresh_token = req.cookies.refreshtoken;
  const expires_at = parseInt(req.cookies.expires_at, 10);

  // Check if parsing failed
  if (isNaN(expires_at)) {
    console.log("Failed to parse expires_at cookie. Redirecting to login.");
    return res.status(401).json({ error: 'Invalid token expiration. Please log in again via /auth/login' });
  }

  console.log("====== [ensureValidAccessToken] ======");
  console.log("Cookies received:", req.cookies);
  console.log("Access token from cookie:", access_token);
  console.log("Refresh token from cookie:", refresh_token);
  console.log("Raw expires_at cookie value:", req.cookies.expires_at);
  console.log("Type of expires_at cookie:", typeof req.cookies.expires_at);
  console.log("Parsed expires_at:", expires_at);
  console.log("Token expiration from cookie:", expires_at ? new Date(expires_at).toLocaleString() : 'undefined');
  console.log("Current time:", new Date().toLocaleString());

  if (!access_token || !refresh_token || !expires_at || isNaN(expires_at)) {
    return res.status(401).json({ error: 'You must log in first via /auth/login' });
  }

  if (Date.now() >= expires_at) {
    console.log('Access token expired. Attempting refresh...');
    try {
      const { access_token: newToken, expires_in } = await refreshAccessToken(refresh_token);
      const new_expires_at = Date.now() + expires_in * 1000;

      // Update server-side tokens
      tokens.access_token = newToken;
      tokens.expires_at = new_expires_at;

      res.cookie('token', newToken, {
        httpOnly: true,
        // Remove maxAge so cookie doesn't auto-expire
        secure: false,
        sameSite: 'Lax'
      });

      res.cookie('expires_at', new_expires_at.toString(), {  // Store as string to avoid formatting
        httpOnly: true,
        secure: false,
        sameSite: 'Lax'
      });

      req.token = newToken;
      console.log("Setting new token cookie with value:", newToken);
      console.log("New token cookie expires in:", expires_in, "seconds");
      console.log("Token refreshed and cookies updated.");
      console.log("New expiration time:", new Date(new_expires_at).toLocaleString());
      console.log("Updated server tokens:", { access_token: newToken.substring(0, 20) + "...", expires_at: new_expires_at });
    } catch (err) {
      console.error("Token refresh failed:", err);
      return res.status(401).json({ error: 'Token refresh failed', details: err });
    }
  } else {
    console.log("Access token is still valid.");
    req.token = access_token;
  }

  next();
}

// /profile
router.get('/profile', ensureValidAccessToken, async function (req, res) {
  const token = req.token;
  if (!token) {
    return res.status(401).json({ error: 'Access token not available on server' });
  }

  try {
    const result = await fetch("https://api.spotify.com/v1/me", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const data = await result.json();
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: 'Something went wrong', details: err });
  }
});

module.exports = {
  router,
  ensureValidAccessToken,
  tokens
};