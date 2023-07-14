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

(async function main () {

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

    while (true) {

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
})();