require('dotenv').config();

const config = require('../config/simulation');
const controller = require('./controllers/simulation-controller');

(function main () {

    if (!controller.checkProviders()) {
        controller.generateProviders();
        controller.postProviders();
    }

    if (controller.checkNumbers()) {
        controller.generateNumbers();
    }

    setInterval(() => {
        const sms_list = controller.generateSMS();
        controller.postNumbers(sms_list);
    }, config.min_delay + Math.floor(Math.random() * config.max_delay));
})();