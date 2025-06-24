const express = require('express');
const dotenv = require('dotenv');
const spotifyAuthRoutes = require('./spotifyapi/userauth');

dotenv.config();

const app = express();
app.use(express.json());

app.use('/', spotifyAuthRoutes);

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
