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

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
