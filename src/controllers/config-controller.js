const auth = require('../../config/auth');
const redis_client = require('../db/redis');

exports.getConfig = async (req, res) => {

    const config_type = req.params.type;

	const config = await redis_client.HGET('config', config_type);

	return res.json(config);
};

exports.setConfig = async (req, res) => {

    const configurables = {
        app: ['app_delay'],
        simulation: ['min_delay', 'max_delay', 'sms_quantity', 'log_responses'],
    };

    const {user, password, type, config} = req.body;

    if (user != auth.user || password != auth.password)
        return res.jsonResponse('Invalid credentials');

    // Check if config type is valid
    if (!configurables.hasOwnProperty(type))
        return res.jsonResponse('Invalid config type');

    // Check if config is a valid JSON
    try {
        JSON.parse(config);
    }
    catch (error) {
        return res.jsonResponse('Invalid config');
    }

    // Check if config is valid
    const config_keys = Object.keys(JSON.parse(config));

    for (let i = 0; i < config_keys.length; i++) {
        if (!configurables[type].includes(config_keys[i]))
            return res.jsonResponse('Invalid config');
    }
	
	try {
		await redis_client.HSET('config', type, config);
        await redis_client.SADD('set-config', type);
		return res.json({message: 'Config successfully updated', success: true});
	}
	catch (error) {
		return res.jsonResponse('Something went wrong while updating config');
	}
};
