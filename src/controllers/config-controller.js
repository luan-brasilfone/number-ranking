const auth = require('../../config/auth');
const globals = require('../../config/globals');
const redis_client = require('../db/redis');

exports.getConfig = async (req, res) => {

    const config_type = req.params.type;

    if (!config_type)
        return res.jsonResponse('Invalid config type');

	let config = await redis_client.HGET('config', config_type);

    if (!config)
        return res.jsonResponse('Config not found');
    
    config = JSON.parse(config);
	return res.json(config);
};

exports.setConfig = async (req, res) => {

    const configurables = {
        app: ['delay'],
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
        JSON.stringify(config);
    }
    catch (error) {
        return res.jsonResponse('Invalid JSON');
    }

    // Check if config is valid
    const config_keys = Object.keys(config);

    for (let i = 0; i < config_keys.length; i++) {
        if (!configurables[type].includes(config_keys[i]))
            return res.jsonResponse('Invalid config');
    }
	
	try {

        if (type == 'app') {
            for (let i = 1; i <= globals.instances; i++) {

                let new_config = { [`${type}-${i}`]: JSON.stringify(config) };

                await redis_client.HSET(`config`, new_config);
                await redis_client.SADD('set-config', `${type}-${i}`);
            }
        }

        else {
            const new_config = { [type]: JSON.stringify(config) };

            await redis_client.HSET('config', new_config);
            await redis_client.SADD('set-config', type);
        }

		return res.json({message: 'Config successfully updated', success: true});
	}
	catch (error) {
		return res.jsonResponse('Something went wrong while updating config');
	}
};
