const _ = require('underscore');
const utils = require('./scripts/utils');
const redis_client = require('./db/redis');
const postgres_client = require('./db/postgres');

const ranking_controller = require('./controllers/ranking-controller');
const provider_controller = require('./controllers/provider-controller');
const dashboard_controller = require('./controllers/dashboard-controller');

// Create a container object to hold the dependencies
module.exports = {
    _,
    utils,
    redis_client,
    postgres_client,
    ranking_controller,
    provider_controller,
    dashboard_controller,
};
