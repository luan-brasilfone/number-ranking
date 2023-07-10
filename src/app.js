require('dotenv').config();

const config = require('../config/app');

const utils = require('./scripts/utils');

let instance = 1;
if (process.argv[2]) instance = process.argv[2];

const controller = require('./controllers/app-controller');

function rankNumberLite (number_average, provider_leverage, status) {
    if (status == 's200'){

        let leverage = (100 - provider_leverage) / 100;
        let rank = 50 + Math.round(number_average * (2 + leverage));

        if (rank > 100) rank = 100;
        return rank;
    }

    let leverage = provider_leverage / 2;
    leverage = (100 - leverage) / 100;

    let rank = Math.round(number_average * leverage);

    return rank;
}

async function rankSmsLite (sms) {

    // console.log(`${new Date().toLocaleTimeString()} - Ranking SMS for ${sms.numero} on ${sms.fornecedor} - LITE MODE`);

    // let provider = await redis_client.GET(`provider-${sms.fornecedor}`);
    let provider = await redis_client.HGET(`provider`, sms.fornecedor);

    if (provider === null) return;
    
    provider = JSON.parse(provider);
    
    let provider_leverage = provider[sms.status.toLowerCase()];

	// let rank = provider_leverage;

    let has_mo = false;

    // let mo = await redis_client.GET(`mo-${sms.numero}`);
    let mo = await redis_client.HGET(`mo`, sms.numero);
    
    if (mo == null && sms.status.toLowerCase() == 'mo') {
        mo = 1001

        let log = {
            type: 'mo',
            number: sms.numero,
            provider: sms.fornecedor,
            status: 'success',
            date: new Date().getTime(),
            message: `New MO`
        };

        await redis_client.RPUSH(`log-mo-${instance}`, JSON.stringify(log));
    };
    
	if (mo != null) {
        // console.log(`${new Date().toLocaleTimeString()} - MO found for ${sms.numero}`)
		has_mo = true;
		mo--;

        if (mo <= 0){

            // await redis_client.DEL(`mo-${sms.numero}`);
            await redis_client.HDEL(`mo`, sms.numero);
            mo = false;

            let log = {
                type: 'mo',
                number: sms.numero,
                provider: sms.fornecedor,
                status: 'success',
                date: new Date().getTime(),
                message: `MO is over`
            };
    
            await redis_client.RPUSH(`log-mo-${instance}`, JSON.stringify(log));
        }
	}

    let cursor = await redis_client.HGET(`cursor`, sms.numero);

    cursor? cursor = JSON.parse(cursor) : cursor = {"total": 0, "sms_counter": 0};
    if (cursor[sms.fornecedor] == undefined) cursor[sms.fornecedor] = {"total": 0, "statement": "insert"};

    number_average = Math.floor(cursor.total / cursor.sms_counter);
    rank = rankNumberLite(number_average? number_average: 50, provider_leverage, sms.status);
    
    if (has_mo) rank = 100;
    sms.peso = rank;
    sms.pesoFornecedor = provider_leverage;

    let success = false;
    try {
        
        // console.log(`${new Date().toLocaleTimeString()} - Provider leverage for status ${sms.status} is ${provider_leverage}. History length is ${cursor[sms.fornecedor].total}\n`);
        let number = sms.numero, provider = sms.fornecedor;
        delete sms.numero, delete sms.fornecedor;

        await postgres_client.query(`INSERT INTO history (number_provider, sms) VALUES ('${number}_${provider}_${cursor[provider].total}', '${JSON.stringify(sms)}') ON CONFLICT (number_provider) DO UPDATE SET sms = '${JSON.stringify(sms)}'`);

        sms.numero = number, sms.fornecedor = provider;
        success = true;
    }
    catch (error) {
        let output = `${new Date().toLocaleTimeString()} - Could not insert history for ${sms.numero} on ${sms.fornecedor}... `;
        output += sms.tries ? `Tried ${sms.tries} times... ` : `Tried 1 time... `;

        console.error(output);
        console.error(error);
        console.error({sms: sms, cursor: cursor, rank: rank, mo: mo})

        let log = {
            type: 'history',
            number: sms.numero,
            provider: sms.fornecedor,
            status: sms.status,
            date: new Date().getTime(),
            message: 'Could not insert history'
        };

        await redis_client.RPUSH(`log-history-${instance}`, JSON.stringify(log));

        delete sms.peso, delete sms.pesoFornecedor;

        sms.tries ? sms.tries++ : sms.tries = 2;

        if (sms.tries > 3) return rank;

        await redis_client.RPUSH(`sms-ranking-${instance}`, JSON.stringify(sms));
    }

    if (success) {

        try{

            if (cursor[sms.fornecedor].statement == "update"){
    
                let old_leverage = await postgres_client.query(`SELECT sms FROM history WHERE number_provider = '${sms.numero}_${sms.fornecedor}_${cursor[sms.fornecedor]}'`);
        
                cursor.total -= old_leverage.rows[0].sms.peso;
            }

            cursor.total += sms.peso, cursor[sms.fornecedor].total++;
            
            if (cursor[sms.fornecedor].statement == "insert") cursor.sms_counter++;
    
            if (cursor[sms.fornecedor].total == 10)
                cursor[sms.fornecedor].total = 0, cursor[sms.fornecedor].statement = "update";            
    
            await redis_client.HSET(`cursor`, { [sms.numero]: JSON.stringify(cursor) });
        }
        catch (error){
            console.error(`${new Date().toLocaleTimeString()} - Could not update cursor for ${sms.numero} on ${sms.fornecedor}... Re-syncing...`);
            console.error(error);
    
            await reSyncCursor(sms.numero);
        }

        try {
            let log = {
                type: 'history',
                number: sms.numero,
                provider: sms.fornecedor,
                status: sms.status,
                date: new Date().getTime(),
                rank: Math.floor(cursor.total / cursor.sms_counter),
                message: 'Successfully inserted history'
            };

            await redis_client.RPUSH(`log-history-${instance}`, JSON.stringify(log));
        }
        catch (error) {
            console.error(`${new Date().toLocaleTimeString()} - Could not log history for ${sms.numero} on ${sms.fornecedor}... Skipping...`);
            console.error(error);
        }

        try {
            await redis_client.ZADD(`rank`, {score: Math.floor(cursor.total/cursor.sms_counter), value: sms.numero});
        }
        catch (error) {
    
            console.log(`${new Date().toLocaleTimeString()} - Could not update rank for ${sms.numero}... Skipping...`);
            console.error(error);
        }

        if (!mo) return rank;

        try {

            // await redis_client.SET(`mo-${sms.numero}`, mo);
            await redis_client.HSET(`mo`, { [sms.numero]: mo });
        
            // let mo_to_postgres = await redis_client.GET(`mo-to-postgres`);
            await redis_client.SADD(`mo-to-postgres`, sms.numero);
        
            // if (mo_to_postgres == null) mo_to_postgres = '';
        
            // if ( mo_to_postgres == '' || !mo_to_postgres.includes(sms.numero) )
            //     await redis_client.SET(`mo-to-postgres`, `${mo_to_postgres}${sms.numero}~${instance}/`);
        }
        catch (error) {

            console.log(`${new Date().toLocaleTimeString()} - Could not save MO for ${sms.numero}... Skipping...`);
            console.error(error);
        }
    }
    
    return rank;
}

async function reSyncCursor (number) {

    try {

        let history = await postgres_client.query(`SELECT *, substring(number_provider from 15) as provider FROM history WHERE number_provider LIKE '${number}_%'`);

        cursor = { total: 0, sms_counter: 0 };
        
        history.rows.forEach((sms_entry) => {

            if (cursor[sms_entry.provider] == undefined)
                cursor[sms_entry.provider] = { total: 0, statement: "insert" };

            cursor.total += sms_entry.sms.peso, cursor[sms_entry.provider].total++;

            if (cursor[sms.fornecedor].statement == "insert")
                cursor.sms_counter++;
            
            if (cursor[sms_entry.provider].total == 10)
                cursor[sms_entry.provider].total = 0, cursor[sms.fornecedor].statement = "update";

            
        });

        await redis_client.HSET(`cursor`, { [number]: JSON.stringify(cursors[number]) });
    }
    catch (error) {
        console.log(`${new Date().toLocaleTimeString()} - Could not re-sync cursor for ${number}... Re-trying in a few seconds...`);
        console.error(error);

        await sleep(5000);
        await reSyncCursor(number);
    }
}

async function persistProviders () {

    while (true) {

        let code = await redis_client.LPOP(`persist-provider`);

        if (code == null) break;

        let method = code.slice(0, 3);
        code = code.replace(`${method}/`, '');

        if (method == 'del') {

            console.log(`${new Date().toLocaleTimeString()} - Deleting provider ${code} on instance ${instance}`);

            try{
                await redis_client.DEL(`provider-${code}`);
                await postgres_client.query(`DELETE FROM provider WHERE code = '${code}'`);

                let log = {
                    type: 'provider',
                    code: code,
                    status: 'success',
                    date: new Date().getTime(),
                    message: `Successfully deleted provider`
                };
        
                await redis_client.RPUSH(`log-provider-${instance}`, JSON.stringify(log));

                continue;
            }
            catch (error) {
                console.error(`${new Date().toLocaleTimeString()} - Could not delete provider ${code} on instance ${instance}... Skipping...`);
                console.error(error);

                let log = {
                    type: 'provider',
                    code: code,
                    status: 'error',
                    date: new Date().getTime(),
                    message: `Could not delete provider`
                };
        
                await redis_client.RPUSH(`log-provider-${instance}`, JSON.stringify(log));
            }
        }

        // let provider = await redis_client.GET(`provider-${code}`);
        let provider = await redis_client.HGET(`provider`, code);

        if (provider == null) continue;

        provider = JSON.parse(provider);

        console.log(`${new Date().toLocaleTimeString()} - Inserting provider ${code} on instance ${instance}`);

        let fields = new Array();
		fields.push(`'${code}'`);
		fields.push(`'${provider['mo']}'`);
		fields.push(`'${provider['s200']}'`);
		fields.push(`'${provider['s404']}'`);
		fields.push(`'${provider['s500']}'`);
		fields.push(`'${provider['s503']}'`);
		fields.push(`'${provider['default']}'`);

        try {
            await postgres_client.query(`INSERT INTO provider (code, "MO", "s200", "s404", "s500", "s503", "default") VALUES (${fields.join(', ')}) ON CONFLICT (code) DO UPDATE SET "MO" = '${provider['mo']}', "s200" = '${provider['s200']}', "s404" = '${provider['s404']}', "s500" = '${provider['s500']}', "s503" = '${provider['s503']}', "default" = '${provider['default']}'`);

            let log = {
                type: 'provider',
                code: code,
                status: 'success',
                date: new Date().getTime(),
                message: `Successfully inserted provider`
            };

            await redis_client.RPUSH(`log-provider-${instance}`, JSON.stringify(log));
        }
        catch (error) {
            console.error(`${new Date().toLocaleTimeString()} - Could not insert provider ${code} on instance ${instance}... Skipping...`);
            console.error(error);

            let log = {
                type: 'provider',
                code: code,
                status: 'error',
                date: new Date().getTime(),
                message: `Could not insert provider`
            };
    
            await redis_client.RPUSH(`log-provider-${instance}`, JSON.stringify(log));
        }
    }
}

async function processSms () {

    while (true){

        let providers = await redis_client.LLEN(`providers`);

        if (providers > 0) break;

        let sms = await redis_client.LPOP(`sms-ranking-${instance}`);
    
        if (sms == null) break;
    
        sms = JSON.parse(sms);
    
        let history = await rankSmsLite(sms);
        if (history == undefined)
            console.log(`${new Date().toLocaleTimeString()} - Provider ${sms.fornecedor} not found. Skipping...`);
    }
}

async function manageTasks (task) {

    switch (task) {
        case 'set-dashboard':
            let timer = Date.now();
            await setDashboard();

            console.timeEnd(`${new Date().toLocaleTimeString()} - Time took to set dashboard on instance ${instance}: ${Date.now() - timer}ms`);
            break;

        case 'persist-provider':
            await persistProviders();
            break;

        default:
            break;
    }
}

(async function main () {

    console.log(`${new Date().toLocaleTimeString()} - Loading instance ${instance}...`);

    if (instance != 1){
     
        while (true){

            await utils.sleep(10);

            let loaded = await redis_client.GET(`loaded`);

            if (loaded == 'true')
                break;

            if (instance == 2)
                console.log(`${new Date().toLocaleTimeString()} - Waiting for app to load on instance 1...`);
        }
    }

    else {

        console.log(`${new Date().toLocaleTimeString()} - Loading app on instance 1...`);

        await redis_client.SET(`loaded`, 'false');

        let startTimer = Date.now();
        await controller.startApp();
        startTimer = (Date.now() - startTimer).format(-seconds, 'second');

        let dashboardTimer = Date.now();
        await controller.setDashboard();
        dashboardTimer = (Date.now() - dashboardTimer).format(-seconds, 'second');

        await redis_client.SET(`loaded`, `true`);

        console.log(`${new Date().toLocaleTimeString()} - App loaded in ${startTimer}. Dashboard loaded in ${dashboardTimer}.`);
    }

    console.log(`${new Date().toLocaleTimeString()} - Instance ${instance} loaded.`);

    while (true) {

        const has_priority_task = await redis_client.SCARD(`priority-task`) > 0;

        if (has_priority_task) {
            const task = await redis_client.SPOP(`priority-task`);

            await controller.manageTasks(task);
            continue;
        }

        const has_sms_to_rank = await redis_client.LLEN(`sms-ranking-${instance}`) > 0;

        if (has_sms_to_rank) {
            let timer = Date.now();
            
            console.log(`${new Date().toLocaleTimeString()} - Processing ${sms} SMS on instance ${instance}...`)
            await controller.processSms();
            
            timer = (Date.now() - timer).format(-seconds, 'second');
            console.log(`${new Date().toLocaleTimeString()} - Time took to process ${sms} SMS on instance ${instance}: ${timer}.`);
            continue;
        }
        
        console.log(`${new Date().toLocaleTimeString()} - No SMS to rank or data to persist on instance ${instance}. Sleeping...`);
        await utils.sleep(config.delay);
    }
})();