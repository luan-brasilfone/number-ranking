require('dotenv').config();

const config = require('../config/app');
const utils = require('./scripts/utils');

const redis_client = require('./db/redis');

let instance = 1;
if (process.argv[2])
    instance = process.argv[2];

const controller = require('./controllers/app-controller');

(async function main () {

    console.log(`${new Date().toLocaleTimeString()} - Loading instance ${instance}...`);

    if (instance == 1){
     
        console.log(`${new Date().toLocaleTimeString()} - Loading app on instance 1...`);

        await redis_client.SET(`loaded`, 'false');

        let startTimer = Date.now();
        await controller.executeOnInstance(instance, 'startApp');
        startTimer = utils.formatTime(Date.now() - startTimer);

        let dashboardTimer = Date.now();
        await controller.executeOnInstance(instance, 'setDashboard');
        dashboardTimer = utils.formatTime(Date.now() - dashboardTimer);

        await redis_client.SET(`loaded`, `true`);

        console.log(`${new Date().toLocaleTimeString()} - App started in ${startTimer}. Dashboard loaded in ${dashboardTimer}.`);
    }

    else {

        while (true){

            await utils.sleep(10);

            let loaded = await redis_client.GET(`loaded`);

            if (loaded == 'true')
                break;

            if (instance == 2)
                console.log(`${new Date().toLocaleTimeString()} - Waiting for app to load on instance 1...`);
        }
    }

    console.log(`${new Date().toLocaleTimeString()} - Instance ${instance} loaded.`);

    while (true) {

        const has_priority_task = await redis_client.SCARD(`priority-task`) > 0;

        if (has_priority_task) {
            const task = await redis_client.SPOP(`priority-task`);

            await controller.executeOnInstance(instance, 'manageTasks', [task]);
            continue;
        }

        const sms_quantity = await redis_client.LLEN(`sms-ranking-${instance}`);
        const has_sms_to_rank = sms_quantity > 0;

        if (has_sms_to_rank) {
            let timer = Date.now();
            
            console.log(`${new Date().toLocaleTimeString()} - Processing ${sms_quantity} SMS on instance ${instance}...`)
            await controller.executeOnInstance(instance, 'processSmsList');
            
            timer = utils.formatTime(Date.now() - timer);
            console.log(`${new Date().toLocaleTimeString()} - Time took to process ${sms_quantity} SMS on instance ${instance}: ${timer}.`);
            continue;
        }
        
        console.log(`${new Date().toLocaleTimeString()} - No SMS to rank or data to persist on instance ${instance}. Sleeping...`);
        await utils.sleep(config.delay);
    }
})();