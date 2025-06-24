const express = require('express');




const router = express.Router();



router.get('/getplaylists', async function (req, res) {
  const authHeader = req.headers['authorization']; 
  const token = authHeader && authHeader.split(' ')[1]; 

  if (!token) {
    return res.status(401).json({ error: 'Missing access token' });
  }

  try {
    const result = await fetch("https://api.spotify.com/v1/me/playlists", {
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


router.post('/createplaylist', async function (req, res) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Missing access token' });
  }

  const {user_id, name, description, isPublic } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'name is required' });
  }

  try {
    const response = await fetch(`https://api.spotify.com/v1/users/${user_id}/playlists`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: name,
        description: description || '',
        public: isPublic ?? false
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: 'Something went wrong', details: err.message });
  }
});


module.exports = router;
    