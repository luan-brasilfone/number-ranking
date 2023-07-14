require('dotenv').config();

const config = require('../config/simulation');

const utils = require('./scripts/utils');
const controller = require('./controllers/simulation-controller');

exports.getDelay = (min, max) => {

    if (min === max)
        return min;

    const delay = parseInt(min) + parseInt(Math.ceil(Math.random() * max));

    if (delay > max)
        return max;

    return delay;
}

exports.main = async () => {

    const providers_doesnt_exist = !controller.checkProviders();
    const numbers_doesnt_exist = !controller.checkNumbers();

    if (providers_doesnt_exist) {
        console.log(`${new Date().toLocaleTimeString()} - Generating providers...`)
        controller.generateProviders();
        controller.postProviders();
    }

    if (numbers_doesnt_exist) {
        console.log(`${new Date().toLocaleTimeString()} - Generating numbers ...`)
        controller.generateNumbers();
    }

    // Configurable fields: ['min_delay', 'max_delay', 'sms_quantity', 'log_responses']
    // Actual fields: ['min_delay', 'max_delay', 'sms_quantity', 'log_responses', 'numbers_quantity', 'providers_quantity']
    let { new_config, numbers_quantity, providers_quantity } = { ...config };

    while (true) {

        const has_new_config = await redis_client.SISMEMBER(`set-config`, `simulation`);

        if (has_new_config) {
            const new_config = await redis_client.HGET(`config`, `simulation`);
            await redis_client.SREM(`set-config`, `simulation`);

            console.log(`${new Date().toLocaleTimeString()} - Updating config on simulation...`);

            new_config = JSON.parse(new_config);

            config = {...config, ...new_config};
            controller.setConfig(new_config);
            continue;
        }

        const delay = exports.getDelay(config.min_delay, config.max_delay);
        
        const sms_list = controller.generateSmsList();
        const result = controller.postSmsList(sms_list);
        
        switch (result) {
            case true:
                console.log(`${new Date().toLocaleTimeString()} - Successfully posted ${sms_list.length} SMS.`);
                break;
            case false:
                console.log(`${new Date().toLocaleTimeString()} - Failed to post ${sms_list.length} SMS.`);
                break;
            default:
                break;
        }

        await utils.sleep(delay);
    }
};

this.main();