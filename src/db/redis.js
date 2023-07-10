const redis = require('redis');
const redis_config = require('../../config/redis');

const redis_client = redis.createClient({ socket: redis_config });

redis_client.on('error', (error) => {
	console.log(`Redis connect error: ${error}`);
});

module.exports = redis_client;
