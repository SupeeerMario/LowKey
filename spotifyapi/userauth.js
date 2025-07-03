const express = require('express');
const request = require('request');
const querystring = require('querystring');
const crypto = require('crypto');
const dotenv = require('dotenv');
let tokens = {
  access_token: null,
  refresh_token: null,
  expires_at: null 
};
dotenv.config();


const router = express.Router();

const client_id = process.env.SPOTIFY_CLIENT_ID;
const client_secret = process.env.SPOTIFY_CLIENT_SECRET;
const redirect_uri = process.env.SPOTIFY_REDIRECT_URI; 

function generateRandomString(length) {
  return crypto.randomBytes(length).toString('hex').slice(0, length);
}

// /login endpoint
router.get('/login', function (req, res) {
  const state = generateRandomString(16);
  const scope = 'user-read-private user-read-email playlist-modify-private playlist-modify-public';

  res.redirect('https://accounts.spotify.com/authorize?' +
    querystring.stringify({
      response_type: 'code',
      client_id: client_id,
      scope: scope,
      redirect_uri: redirect_uri,
      state: state
    }));
});

// /callback endpoint
router.get('/callback', function (req, res) {
  const code = req.query.code || null;
  const state = req.query.state || null;

  if (state === null) {
    return res.redirect('/#' +
      querystring.stringify({
        error: 'state_mismatch'
      }));
  }

  const authOptions = {
    url: 'https://accounts.spotify.com/api/token',
    form: {
      code: code,
      redirect_uri: redirect_uri,
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

      tokens.access_token = access_token;
      tokens.refresh_token = refresh_token;
      tokens.expires_at = Date.now() + expires_in * 1000;

      console.log("access token is:", access_token);
      console.log("refresh token is:", refresh_token);
      console.log("expires at:", new Date(tokens.expires_at).toLocaleString());

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
        refresh_token: refresh_token
      },
      json: true
    };

    request.post(authOptions, function (error, response, body) {
      if (!error && response.statusCode === 200) {
        const { access_token, expires_in } = body;
        tokens.access_token = access_token;
        tokens.expires_at = Date.now() + expires_in * 1000;
        resolve(access_token);
      } else {
        reject(body || error);
      }
    });
  });
}

async function ensureValidAccessToken(req, res, next) {
  try {
    if (!tokens.access_token || !tokens.refresh_token || !tokens.expires_at) {
      return res.status(401).json({ error: 'You must log in first via /auth/login' });
    }

    console.log("Now:", Date.now());
    console.log("Expires At:", tokens.expires_at);

    if (Date.now() >= tokens.expires_at) {
      console.log('Access token expired, refreshing...');
      await refreshAccessToken(tokens.refresh_token);
      console.log('New token:', tokens.access_token);
    } else {
      console.log('Access token still valid.');
    }

    next();
  } catch (err) {
    console.error('Token refresh failed:', err);
    res.status(401).json({ error: 'Failed to refresh token', details: err });
  }
}


router.get('/profile', ensureValidAccessToken, async function (req, res) {
  const token = tokens.access_token;

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

