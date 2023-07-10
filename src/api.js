require('dotenv').config();
require('../config/globals');

const [port, host] = require('../config/api');
const express = require('express');
const body_parser = require('body-parser');
const json_response = require('./middlewares/json-response');

const container = require('./container');

const ranking_controller = container.ranking_controller;
const provider_controller = container.provider_controller;
const dashboard_controller = container.dashboard_controller;

const app = express();

app.use(body_parser.urlencoded({ extended: false }));
app.use(body_parser.json());
app.use(json_response);

// Ranking
app.get('/get-rank/:number?', ranking_controller.getRank);
app.post('/add-to-rank', ranking_controller.addToRank);

// Numbers
app.get('/numbers/:number?', ranking_controller.getNumbers);

// Providers
app.get('/providers/:code?', provider_controller.getProviders);
app.post('/providers', provider_controller.saveProvider);
app.put('/providers', provider_controller.saveProvider);
app.delete('/providers/:code?', provider_controller.deleteProvider);

// Dashboard
app.get('/dashboard', dashboard_controller.getDashboard);
app.put('/dashboard', dashboard_controller.setDashboard);

app.listen(port, host, () => {});

setInterval(() => {
	console.log(`${new Date().toLocaleTimeString()} - Added ${counter} SMS to rank on the last minute. Listening at http://${api_host}:${api_port}`);
	
	counter = 0;
}, 60000);