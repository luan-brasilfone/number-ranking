require('dotenv').config();

let config = require('../config/app');
const utils = require('./scripts/utils');

const redis_client = require('./db/redis');

const controller = require('./controllers/app-controller');

let instance = process.argv[2] || 1;

exports.main = async () => {

    console.log(`${new Date().toLocaleTimeString()} - Loading instance ${instance}...`);

    if (instance == 1){
     
        console.log(`${new Date().toLocaleTimeString()} - Loading app on instance 1...`);

        await redis_client.SET(`loaded`, 'false');

        let startTimer = Date.now();
        await utils.sleep(1);
        // await controller.executeOnInstance(instance, 'startApp');
        startTimer = utils.formatTime(Date.now() - startTimer);

        let dashboardTimer = Date.now();
        // await controller.executeOnInstance(instance, 'setDashboard');
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

    await redis_client.HSET(`config`, { [`app-${instance}`]: JSON.stringify({ delay: config.delay }) });

    console.log(`${new Date().toLocaleTimeString()} - Instance ${instance} loaded.`);

    while (true) {

        const has_priority_task = await redis_client.SCARD(`priority-task`) > 0;

        if (has_priority_task) {
            const task = await redis_client.SPOP(`priority-task`);

            await controller.executeOnInstance(instance, 'manageTasks', [task]);
            continue;
        }

        const has_new_config = await redis_client.SISMEMBER(`set-config`, `app-${instance}`);

        if (has_new_config) {

            let new_config = await redis_client.HGET(`config`, `app-${instance}`);
            await redis_client.SREM(`set-config`, `app-${instance}`);

            console.log(`${new Date().toLocaleTimeString()} - Updating config on instance ${instance}...`);

            new_config = JSON.parse(new_config);

            config = {...config, ...new_config};
            await controller.executeOnInstance(instance, 'setConfig', [config]);

            await redis_client.HSET(`config`, { [`app-${instance}`]: JSON.stringify(config) });
            continue;
        }

        const sms_quantity = await redis_client.LLEN(`sms-ranking-${instance}`);
        const has_sms_to_rank = sms_quantity > 0;

        if (has_sms_to_rank) {
            let timer = Date.now();
            
            console.log(`${new Date().toLocaleTimeString()} - Processing ${sms_quantity} SMS on instance ${instance}...`)
            await controller.executeOnInstance(instance, 'processSmsList', [sms_quantity]);
            
            timer = utils.formatTime(Date.now() - timer);
            console.log(`${new Date().toLocaleTimeString()} - Time took to process ${sms_quantity} SMS on instance ${instance}: ${timer}.`);
            continue;
        }

        const has_mo_to_persist = await redis_client.SCARD(`mo-to-postgres`) > 0;
        const has_logs_to_persist = await redis_client.LLEN(`log-history-${instance}`) > 0 ||
                                    await redis_client.LLEN(`log-provider-${instance}`) > 0 ||
                                    await redis_client.LLEN(`log-mo-${instance}`) > 0;

        const has_data_to_persist = has_mo_to_persist || has_logs_to_persist;

        if (has_data_to_persist) {

            const data_type = has_mo_to_persist ? 'mo' : 'log';
            let timer = Date.now();
            
            console.log(`${new Date().toLocaleTimeString()} - Persisting ${data_type} on instance ${instance}...`)

            await controller.executeOnInstance(instance, 'persistData', [data_type]);

            timer = utils.formatTime(Date.now() - timer);
            console.log(`${new Date().toLocaleTimeString()} - Time took to persist ${data_type} on instance ${instance}: ${timer}.`);
            continue;
        }

        console.log(`${new Date().toLocaleTimeString()} - No SMS to rank or data to persist on instance ${instance}. Sleeping...`);
        await utils.sleep(config.delay);
    }
};

this.main();