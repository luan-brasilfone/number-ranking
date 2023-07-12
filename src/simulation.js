require('dotenv').config();

const config = require('../config/simulation');
const controller = require('./controllers/simulation-controller');

(function main () {

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

    setInterval(() => {
        const sms_list = controller.generateSmsList();
        controller.postSmsList(sms_list);
    }, 2000);
})();