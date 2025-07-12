const express = require('express');
const userauth = require('./userauth'); 

const router = express.Router();


// /Get user Playlists
router.get('/getplaylists', userauth.ensureValidAccessToken, async function (req, res) {
  const token = req.token;

  console.log("token is:", token);

  if (!token) {
    return res.status(401).json({ error: 'You must log in first via /auth/login' });
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
    return res.status(500).json({ error: 'Something went wrong', details: err.message });
  }
});


// /Get Playlists Tracks
router.get('/getplaylisttracks/:playlist_id', userauth.ensureValidAccessToken, async function (req, res){
  const token = req.token;

  if(!token){
    return res.status(401).json({ error: 'You must log in first via /auth/login' });
  }

  const playlist_id = req.params.playlist_id;

  if(!playlist_id){
    return res.status(400).json({error: 'Playlist_id is required'});
  }
  try{
    const response = await fetch(`https://api.spotify.com/v1/playlists/${playlist_id}/tracks`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if(!response.ok) {
      
      const errData = await response.json();
      return res.status(response.status).json({ error: errData });
    }

    const data = await response.json();

      const formattedTracks = data.items.map(item => {
      const track = item.track;
      const artist = track.artists.map(artist=> artist.name).join(', ');
      const album = track.album.name;
      const durationMIN = track.duration_ms;

      const minutes = Math.floor(durationMIN / 60000);
      const seconds = Math.floor((durationMIN % 60000) / 1000).toString().padStart(2, '0');

      return {
        name: track.name,
        artist: artist,
        album: album,
        duration: `${minutes}:${seconds}`,
        spotify_url: track.external_urls.spotify,
        album_cover: track.album.images[0]?.url || null

      };

    })

    
    return res.status(200).json({ tracks: formattedTracks });
  }catch(err){
    return res.status(500).json({ error: 'Something went wrong', details: err.message });
  }
})



// /Create a new Playlist
router.post('/createplaylist', userauth.ensureValidAccessToken, async function (req, res) {
  const token = req.token;

  if (!token) {
    return res.status(401).json({ error: 'You must log in first via /auth/login' });
  }

  const { user_id, name, description, isPublic } = req.body;

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
        name,
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


// /Add a track to a Playlist
router.post('/addtoplaylist', userauth.ensureValidAccessToken, async function (req, res) {
  const token = req.token;

  if(!token){
    return res.status(400).json({ error: 'You must log in first via /auth/login' });
  }

  const { playlist_id , uris , position } = req.body;

  if(!playlist_id){
    return res.status(400).json({ error: 'playlist_id is required' });
  }

  if (!uris || !Array.isArray(uris) || uris.length === 0) {
    return res.status(400).json({ error: 'uris array is required and must contain at least one track URI' });
  }
  try {
    const requestBody = {
      uris: uris
    };

    // Add position if provided
    if (position !== undefined && position !== null) {
      requestBody.position = position;
    }

    const result = await fetch(`https://api.spotify.com/v1/playlists/${playlist_id}/tracks`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    const data = await result.json();
    
    if (result.status === 201) {
      return res.status(201).json(data);
    } else {
      return res.status(result.status).json({ error: 'Failed to add tracks to playlist', details: data });
    }
  } catch (err) {
    return res.status(500).json({ error: 'Something went wrong', details: err });
  }
})



// /Delete a track from a Playlist
router.delete('/deletefromplaylist', userauth.ensureValidAccessToken, async function (req, res) {
  const token = req.token;

    if(!token){
    return res.status(400).json({ error: 'You must log in first via /auth/login' });
  }

  const { playlist_id, tracks, snapshot_id } = req.body;

    if (!playlist_id) {
    return res.status(400).json({ error: 'playlist_id is required' });
  }

  if (!tracks || !Array.isArray(tracks) || tracks.length === 0) {
    return res.status(400).json({ error: 'tracks array is required and must contain at least one track object' });
  }

  // Validate track objects have uri property
  for (const track of tracks) {
    if (!track.uri) {
      return res.status(400).json({ error: 'Each track object must have a uri property' });
    }
  }

  try{
    const requestBody = {
      tracks: tracks
    };

    if(snapshot_id){
      requestBody.snapshot_id = snapshot_id;
    }
    const result = await fetch(`https://api.spotify.com/v1/playlists/${playlist_id}/tracks`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    const data = await result.json();
    
    if (result.status === 200) {
      return res.status(200).json(data);
    } else {
      return res.status(result.status).json({ error: 'Failed to remove tracks from playlist', details: data });
    }
  } catch (err) {
    return res.status(500).json({ error: 'Something went wrong', details: err });
  }
});


module.exports = router;
