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

// Validate environment variables
if (!client_id || !client_secret || !redirect_uri) {
  console.error('Missing required environment variables:');
  console.error('SPOTIFY_CLIENT_ID:', client_id ? 'Set' : 'Missing');
  console.error('SPOTIFY_CLIENT_SECRET:', client_secret ? 'Set' : 'Missing');
  console.error('SPOTIFY_REDIRECT_URI:', redirect_uri ? 'Set' : 'Missing');
  process.exit(1);
}

console.log('Spotify Auth Configuration:');
console.log('Client ID:', client_id);
console.log('Redirect URI:', redirect_uri);

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

  const authUrl = 'https://accounts.spotify.com/authorize?' +
    querystring.stringify({
      response_type: 'code',
      client_id,
      scope,
      redirect_uri,
      state
    });

  console.log('Redirecting to Spotify auth URL:', authUrl);
  res.redirect(authUrl);
});

// /callback
router.get('/callback', function (req, res) {
  const code = req.query.code || null;
  const state = req.query.state || null;
  const error = req.query.error || null;

  console.log('Callback received:');
  console.log('Code:', code ? 'Present' : 'Missing');
  console.log('State:', state);
  console.log('Error:', error);

  if (error) {
    console.error('Spotify returned error:', error);
    return res.redirect('/#' + querystring.stringify({ error: error }));
  }

  if (!state) {
    console.error('State parameter missing');
    return res.redirect('/#' + querystring.stringify({ error: 'state_mismatch' }));
  }

  if (!code) {
    console.error('Authorization code missing');
    return res.redirect('/#' + querystring.stringify({ error: 'no_code' }));
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

  console.log('Token exchange request:');
  console.log('URL:', authOptions.url);
  console.log('Redirect URI being sent:', redirect_uri);

  request.post(authOptions, function (error, response, body) {
    if (error) {
      console.error('Request error:', error);
      return res.redirect('/#' + querystring.stringify({ error: 'request_failed' }));
    }

    console.log('Token response status:', response.statusCode);
    console.log('Token response body:', body);

    if (response.statusCode !== 200) {
      console.error('Token exchange failed:', body);
      return res.redirect('/#' + querystring.stringify({ 
        error: 'invalid_token',
        details: body.error_description || body.error || 'Unknown error'
      }));
    }

    const { access_token, refresh_token, expires_in } = body;
    const expires_at = Date.now() + expires_in * 1000;

    tokens.refresh_token = refresh_token;
    tokens.access_token = access_token;
    tokens.expires_at = expires_at;

    // Set cookies
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Lax'
    };

    res.cookie('token', access_token, cookieOptions);
    res.cookie('refreshtoken', refresh_token, cookieOptions);
    res.cookie('expires_at', expires_at.toString(), cookieOptions);

    console.log("Authentication successful!");
    console.log("Access token:", access_token.substring(0, 20) + "...");
    console.log("Refresh token:", refresh_token.substring(0, 20) + "...");
    console.log("Expires in:", expires_in, "seconds");
    console.log("Expires at:", new Date(expires_at).toLocaleString());

    res.redirect('/#success');
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
        console.error('Token refresh failed:', body || error);
        reject(body || error);
      }
    });
  });
}

async function ensureValidAccessToken(req, res, next) {
  const access_token = req.cookies.token;
  const refresh_token = req.cookies.refreshtoken;
  const expires_at = parseInt(req.cookies.expires_at, 10);

  console.log("====== [ensureValidAccessToken] ======");
  console.log("Access token:", access_token ? 'Present' : 'Missing');
  console.log("Refresh token:", refresh_token ? 'Present' : 'Missing');
  console.log("Expires at:", expires_at ? new Date(expires_at).toLocaleString() : 'Invalid');

  if (!access_token || !refresh_token || !expires_at || isNaN(expires_at)) {
    return res.status(401).json({ 
      error: 'Authentication required',
      message: 'Please log in first via /auth/login'
    });
  }

  if (Date.now() >= expires_at) {
    console.log('Access token expired. Attempting refresh...');
    try {
      const { access_token: newToken, expires_in } = await refreshAccessToken(refresh_token);
      const new_expires_at = Date.now() + expires_in * 1000;

      tokens.access_token = newToken;
      tokens.expires_at = new_expires_at;

      const cookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'Lax'
      };

      res.cookie('token', newToken, cookieOptions);
      res.cookie('expires_at', new_expires_at.toString(), cookieOptions);

      req.token = newToken;
      console.log("Token refreshed successfully");
    } catch (err) {
      console.error("Token refresh failed:", err);
      return res.status(401).json({ 
        error: 'Token refresh failed',
        message: 'Please log in again via /auth/login'
      });
    }
  } else {
    console.log("✅ Access token is still valid");
    req.token = access_token;
  }

  next();
}

// /profile
router.get('/profile', ensureValidAccessToken, async function (req, res) {
  const token = req.token;
  
  try {
    const result = await fetch("https://api.spotify.com/v1/me", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!result.ok) {
      throw new Error(`Spotify API returned ${result.status}: ${result.statusText}`);
    }

    const data = await result.json();
    return res.status(200).json(data);
  } catch (err) {
    console.error('Profile fetch error:', err);
    return res.status(500).json({ 
      error: 'Failed to fetch profile',
      message: err.message
    });
  }
});

// Debug endpoint to check configuration
router.get('/debug', (req, res) => {
  res.json({
    client_id: client_id ? 'Set' : 'Missing',
    client_secret: client_secret ? 'Set' : 'Missing',
    redirect_uri: redirect_uri,
    environment: process.env.NODE_ENV || 'development'
  });
});

module.exports = {
  router,
  ensureValidAccessToken,
  tokens
};