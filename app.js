/* const express = require('express');
const dotenv = require('dotenv');
const cookieParser = require('cookie-parser');
const spotifyAuthRoutes = require('./spotifyapi/userauth');
const spotifyplaylistRoutes = require('./spotifyapi/playlist');

dotenv.config();


const app = express();
app.use(express.json());
app.use(cookieParser());

app.use('/auth', spotifyAuthRoutes.router);
app.use('/spotify', spotifyplaylistRoutes);

app.get('/ping', (req, res) => {
  res.json({ message: "Server is alive!" });
});
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
 */


const express = require('express');
const dotenv = require('dotenv');
const cookieParser = require('cookie-parser');
const spotifyAuthRoutes = require('./spotifyapi/userauth');
const spotifyplaylistRoutes = require('./spotifyapi/playlist');

dotenv.config();

const app = express();
app.use(express.json());
app.use(cookieParser());

app.use('/auth', spotifyAuthRoutes.router);
app.use('/spotify', spotifyplaylistRoutes);

// Debug route
app.get('/ping', (req, res) => {
  res.json({ message: "Server is alive!" });
});

// Root route
app.get('/', (req, res) => {
  res.json({ message: "Backend API is running!" });
});

// Export for Vercel/serverless
module.exports = app;