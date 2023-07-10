let instance = 1;
if (process.argv[2]) instance = process.argv[2];

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

async function manageOperations (operation) {

    switch (operation) {
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

async function startApp () {

    console.log(`${new Date().toLocaleTimeString()} - Loading app on instance ${instance}...`);

    // DELETE

    // let providers = await redisScan(0, {MATCH: 'provider-*', COUNT: 1000});
    let providers = await redisScan({cursor: 0, options: {MATCH: 'provider-*', COUNT: 1000}, output: []});

    providers.forEach(key => {
        redis_client.DEL(key);
    });

    delete providers;
    await redis_client.DEL(`provider`);

    let mos = await redisScan({cursor: 0, options: {MATCH: 'mo-*', COUNT: 1000}, output: []});

    mos.forEach(key => {
        redis_client.DEL(key);
    });

    delete mos;
    await redis_client.DEL(`mo`);

    await redis_client.DEL(`cursor`);

    await redis_client.DEL(`rank`);

    // SET

    let providers_wrapper = await postgres_client.query('SELECT * FROM provider');
    
    if (providers_wrapper.rows.length > 0) providers_wrapper.rows.forEach((provider) => {
        let code = provider.code;
        delete provider.code;

        Object.keys(provider).forEach((value, key) => {
            let provider_value = provider[value];
            delete provider[value];
            provider[value.toString().toLowerCase()] = provider_value;
        });
        
        // redis_client.SET(`provider-${code}`, JSON.stringify(provider));
        redis_client.HSET(`provider`, { [code]: JSON.stringify(provider) });
    });

    delete providers_wrapper;

    let mos_wrapper = await postgres_client.query('SELECT * FROM mo');

    if (mos_wrapper.rows.length > 0) mos_wrapper.rows.forEach((mo) => {
        let number = mo.number;
        delete mo.number;

        // redis_client.SET(`mo-${number}`, mo.balance);
        redis_client.HSET(`mo`, { [number]: mo.balance });
    });

    delete mos_wrapper;

    let counter = 0, limit = 100000, cursors = new Object();
    while (true) {

        console.time(`iteration ${counter}`)
        let history = await postgres_client.query(`SELECT * FROM history ORDER BY number_provider LIMIT ${limit} OFFSET ${counter * limit}`);

        if (history.rows.length == 0) break;
        
        let promises = history.rows.map(async (sms_entry, key) => {
            let [number, provider] = sms_entry.number_provider.split('_');
            
            // let cursor = await redis_client.HGET(`cursor`, number);
            let cursor = cursors[number] ? cursors[number] : { total: 0, sms_counter: 0 };
            cursor[provider] = cursor[provider] ? cursor[provider] : { total: 0, statement: "insert" };

            let providerCursor = cursor[provider];
          
            cursor.total += sms_entry.sms.peso, providerCursor.total++;
            if (providerCursor.statement == "insert")
                cursor.sms_counter++;

            cursors[number] = cursor;
        });

        await Promise.all(promises);
        
        console.timeEnd(`iteration ${counter}`)
        counter++;
    }

    const ioredis = require('ioredis');
    const redis = new ioredis();
    const pipeline = redis.pipeline();

    cursors = Object.keys(cursors).forEach((number) => {

        pipeline.hset(`cursor`, { [number]: JSON.stringify(cursors[number]) });
    });
    pipeline.exec();
}

async function setDashboard () {

    let dashboard = new Object();

    let providers = await redisScan({cursor: 0, options: {MATCH: 'provider-*', COUNT: 1000}, output: []});
    dashboard.providers = providers.length;

    let mos = await redisScan({cursor: 0, options: {MATCH: 'mo-*', COUNT: 1000}, output: []});
    dashboard.mos = mos.length;
    
    let ranks = await redis_client.ZCOUNT(`rank`, '-inf', '+inf');
    dashboard.ranks = ranks;

    // 86400000 = 1 day in milliseconds
    let log_history = new Object();
    for (let i = 0; i < 14; i++){

        let result = await postgres_client.query(`SELECT to_timestamp(date/1000)::date AS log_date, status || ': ' || count(status) as count FROM log_history WHERE to_timestamp(date/1000)::date > '${getYmdDate(new Date())}'::date - interval '14 days' GROUP BY log_date, status`);

        result.rows.forEach((row) => {
            if (log_history[row.log_date] == undefined) log_history[row.log_date] = new Object();
            log_history[row.log_date][row.count.split(':')[0]] = row.count.split(':')[1];
        });
    }

    dashboard.log_history = log_history;

    let log_mo = await postgres_client.query(`SELECT * FROM log_mo WHERE message = 'New MO' ORDER BY id desc LIMIT 3;`);

    dashboard.log_mo = log_mo.rows;

    let ranked_by_provider = await postgres_client.query(`SELECT COUNT (*), provider AS code from log_history GROUP BY provider ORDER BY count`);

    dashboard.ranked_by_provider = ranked_by_provider.rows;

    let error_logs = await postgres_client.query(`SELECT COUNT (*) FROM log_history WHERE "message" = 'Could not insert history'`);
    dashboard.error_logs = parseInt(error_logs.rows[0].count);

    error_logs = await postgres_client.query(`SELECT COUNT (*) FROM log_mo WHERE status = 'error'`);
    dashboard.error_logs += parseInt(error_logs.rows[0].count);

    error_logs = await postgres_client.query(`SELECT COUNT (*) FROM log_provider WHERE status = 'error'`);
    dashboard.error_logs += parseInt(error_logs.rows[0].count);

    await redis_client.SET(`dashboard`, JSON.stringify(dashboard));
}

async function main () {
    
    // return;

    console.log(`${new Date().toLocaleTimeString()} - Loading instance ${instance}...`);

    await connectToPostgres();
    await connectToRedis();

    if (instance != 1) while (true){

        await sleep(10000).then(() => {});

        let loaded = await redis_client.GET(`loaded`);

        if (loaded == 'true') break;

        if (instance == 2)
            console.log(`${new Date().toLocaleTimeString()} - Waiting for app to load on instance 1...`)
    }

    else {

        await redis_client.SET(`loaded`, 'false');

        let startTimer = Date.now();
        await startApp();

        let dashboardTimer = Date.now();
        // await setDashboard();

        await redis_client.SET(`loaded`, `true`);

        console.log(`${new Date().toLocaleTimeString()} - App loaded in ${Date.now() - startTimer}ms. Dashboard loaded in ${Date.now() - dashboardTimer}ms.`);
    }

    console.log(`${new Date().toLocaleTimeString()} - Instance ${instance} loaded.`);

    while (true){

        // let providers = await redis_client.LLEN(`providers`);

        // if (providers > 0) {
        //     await persistProviders();
        //     continue;
        // }

        let operations = await redis_client.SCARD(`operations`);

        if (operations > 0) {
            await manageOperations(await redis_client.SPOP(`operations`));
            continue;
        }

        let sms = await redis_client.LLEN(`sms-ranking-${instance}`);

        if (sms > 0) {
            let timer = Date.now();
            
            console.log(`${new Date().toLocaleTimeString()} - Processing ${sms} SMS on instance ${instance}...`)
            await processSms();
            
            console.log(`${new Date().toLocaleTimeString()} - Time took to process ${sms} SMS on instance ${instance}: ${Date.now() - timer}ms`);
            continue;
        }

        let mo_to_postgres = await redis_client.SCARD(`mo-to-postgres`);

        if (mo_to_postgres > 0){

            let timer = Date.now();
            await persistMo();
            
            console.log(`${new Date().toLocaleTimeString()} - Time took to persist ${mo_to_postgres} MOs on instance ${instance}: ${Date.now() - timer}`);
            continue;
        }

        let log_history = await redis_client.LLEN(`log-history-${instance}`);
        let log_provider = await redis_client.LLEN(`log-provider-${instance}`);
        let log_mo = await redis_client.LLEN(`log-mo-${instance}`);

        let timer = Date.now();

        if (log_history > 0)
            await persistLogHistory();

        if (log_provider > 0)
            await persistLogProvider();

        if (log_mo > 0)
            await persistLogMo();

        if (log_history + log_provider + log_mo > 0) {
            console.log(`${new Date().toLocaleTimeString()} - Time took to persist logs ${log_history + log_provider + log_mo} on instance ${instance}: ${Date.now() - timer}ms.`);
            continue;
        }
        
        console.log(`${new Date().toLocaleTimeString()} - No SMS to rank or data to persist on instance ${instance}. Sleeping...`);
        await sleep(30000).then(() => {});
    }
}

main();