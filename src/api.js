require('dotenv').config();

const config = require('../config/api');

const api = require('express')();
const body_parser = require('body-parser');
const json_response = require('./middlewares/json-response');

const ranking_controller = require('./controllers/ranking-controller');
const provider_controller = require('./controllers/provider-controller');
const dashboard_controller = require('./controllers/dashboard-controller');

api.use(body_parser.urlencoded({ extended: false }));
api.use(body_parser.json());
api.use(json_response);

// Ranking
api.get('/get-rank/:number?', ranking_controller.getRank);
api.post('/add-to-rank', ranking_controller.addToRank);

// Numbers
api.get('/numbers/:number?', ranking_controller.getNumbers);

// Providers
api.get('/providers/:code?', provider_controller.getProviders);
api.post('/providers', provider_controller.saveProvider);
api.put('/providers', provider_controller.saveProvider);
api.delete('/providers/:code?', provider_controller.deleteProvider);

// Dashboard
api.get('/dashboard', dashboard_controller.getDashboard);
api.put('/dashboard', dashboard_controller.setDashboard);

api.listen(config.port, config.host, () => {});

setInterval(() => {
	console.log(`${new Date().toLocaleTimeString()} - Listening at http://${config.host}:${config.port}`);
}, 60000);