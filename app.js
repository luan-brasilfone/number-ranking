const pg = require('pg');
const redis = require('redis');

let postgres_client, redis_client;

let instance = 1;
if (process.argv[2]) instance = process.argv[2];

let env = new Object();
try{
    env = JSON.parse(process.argv[3]);
} catch (error) {
    console.log('\nNo .env file provided. Checking if it is set...');

	const fs = require('fs');

	try {

		let env_file = fs.readFileSync('.env', 'utf8');

		const env_lines = env_file.split('\n');
	
		for (const line of env_lines) {
			const trimmed_line = line.trim();
		
			if (trimmed_line && !trimmed_line.startsWith('#')) {
				const [key, value] = trimmed_line.split('=');
				env[key.toLowerCase()] = value;
			}
		}

        env.app_base_dir = env['app_base_dir'];

        env.database_config = {
            host: env['database_host'],
            port: env['database_port'],
            database: env['database_name'],
            user: env['database_user'],
            password: env['database_password']
        }

        env.redis_config = {
			host: env['redis_host'],
			port: env['redis_port']
		}
	} catch (error) {
		console.log('No .env file found. Set one by typing ./set.environment.sh. Using default values...');

        env.app_base_dir = './';

        env.database_config = {
            host: 'localhost',
            port: 5432,
            database: 'ranking',
            user: 'postgres',
            password: 'postgres'
        }

		env.redis_config = { host: "localhost", port: 6379 }
    }
}

const database_config = env['database_config'];
const redis_config = env['redis_config'];

async function sleep (delay) {

    return new Promise((resolve) => {
        setTimeout(() => {
            resolve(true);
        }, delay);
    });
}

function getYmdDate (date) {

    let year = date.getFullYear();
    let month = String(date.getMonth() + 1).padStart(2, '0');
    let day = String(date.getDate()).padStart(2, '0');

    return year + '-' + month + '-' + day;
}

async function redisScan (cursor, options, output = []) {

	let scan = await redis_client.SCAN(cursor, options, (error, reply) => {
		if (error) console.log(error);
		console.log(reply);
	});

	const promises = scan.keys.map(async key => {
		output.push(key);
	});

	await Promise.all(promises);

	if (scan.cursor != 0) await redisScan(scan.cursor, options, output);

	return output;
}

function rankNumberLite (number_average, provider_leverage, status) {

    if (status == '200'){

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

    // console.log(`\nRanking SMS for ${sms.numero} on ${sms.fornecedor} - LITE MODE`);

    let provider = await redis_client.GET(`provider-${sms.fornecedor}`, (error, reply) => {
        if (error) console.log(error);
        console.log(reply);
    });

    if (provider === null) return;
    
    provider = JSON.parse(provider);
    
    let provider_leverage = provider[sms.status.toLowerCase()];

	let rank = provider_leverage;

    let has_mo = false;

    let mo = await redis_client.GET(`mo-${sms.numero}`, (error, reply) => {
        if (error) console.log(error);
        console.log(reply);
    });
    
    if (mo == null && sms.status.toLowerCase() == 'mo') {
        mo = 1001

        let log = {
            type: 'mo',
            number: sms.numero,
            provider: sms.fornecedor,
            status: 'success',
            date: getTimestamp(new Date()),
            message: `New MO`
        };

        await redis_client.RPUSH(`log-mo-${instance}`, JSON.stringify(log), (error, reply) => {
            if (error) console.log(error);
            console.log(reply);
        });
    };
    
	if (mo != null) {
        // console.log(`MO found for ${sms.numero}`)
		has_mo = true;
		mo--;

        if (mo <= 0){

            await redis_client.DEL(`mo-${sms.numero}`, (error, reply) => {
                if (error) console.log(error);
                console.log(reply);
            });
            mo = false;

            let log = {
                type: 'mo',
                number: sms.numero,
                provider: sms.fornecedor,
                status: 'success',
                date: getTimestamp(new Date()),
                message: `MO is over`
            };
    
            await redis_client.RPUSH(`log-mo-${instance}`, JSON.stringify(log), (error, reply) => {
                if (error) console.log(error);
                console.log(reply);
            });
        }
	}

    let cursor = await redis_client.GET(`cursor-${sms.numero}`, (error, reply) => {
        if (error) console.log(error);
        console.log(reply);
    });

    cursor = JSON.parse(cursor);

    if (cursor != null && !has_mo){
    
		let number_average = cursor.total / cursor.sms_counter;

        rank = rankNumberLite(number_average, provider_leverage, sms.status);
	}

    sms.peso = rank, sms.pesoFornecedor = provider_leverage;

    if (cursor == null ) cursor = {"total": 0, "sms_counter": 0};
    if (cursor[sms.fornecedor] == undefined) cursor[sms.fornecedor] = {"total": 0, "statement": "insert"};

    if (has_mo) sms.peso = 100;
    
    try {

        if (cursor[sms.fornecedor].statement == "update"){

            let old_leverage = await postgres_client.query(`SELECT sms FROM history WHERE number_provider = '${sms.numero}_${sms.fornecedor}_${cursor[sms.fornecedor]}'`);
        }

        // console.log(`Provider leverage for status ${sms.status} is ${provider_leverage}. History length is ${cursor[sms.fornecedor].total}\n`);

        await postgres_client.query(`INSERT INTO history (number_provider, sms) VALUES ('${sms.numero}_${sms.fornecedor}_${cursor[sms.fornecedor].total}', '${JSON.stringify(sms)}') ON CONFLICT (number_provider) DO UPDATE SET sms = '${JSON.stringify(sms)}'`);

        let log = {
            type: 'history',
            number: sms.numero,
            provider: sms.fornecedor,
            status: sms.status,
            date: getTimestamp(new Date()),
            message: 'Successfully inserted history'
        };

        await redis_client.RPUSH(`log-history-${instance}`, JSON.stringify(log), (error, reply) => {
            if (error) console.log(error);
            console.log(reply);
        });

        try{
            
            cursor.total + sms.peso, cursor[sms.fornecedor].total++;
            
            if (cursor[sms.fornecedor].statement == "insert") cursor.sms_counter++;

            if (cursor[sms.fornecedor].total > 10)
                cursor[sms.fornecedor].total = 1, cursor[sms.fornecedor].statement = "update";            

            await redis_client.SET(`cursor-${sms.numero}`, JSON.stringify(cursor), (error, reply) => {
                if (error) console.log(error);
                console.log(reply);
            });
        }
        catch (error){
            console.error(`Could not update cursor for ${sms.numero} on ${sms.fornecedor}... Re-syncing...`);
            console.error(error);

            await reSyncCursor(sms.numero, sms.fornecedor);
        }
    }
    catch (error) {
        console.error(`Could not insert history for ${sms.numero} on ${sms.fornecedor}... Skipping...`);
        console.error(error);
        console.error({sms: sms, cursor: cursor, provider: cursor[sms.numero], rank: rank, mo: mo})

        let log = {
            type: 'history',
            number: sms.numero,
            provider: sms.fornecedor,
            status: sms.status,
            date: getTimestamp(new Date()),
            message: 'Could not insert history'
        };

        await redis_client.RPUSH(`log-history-${instance}`, JSON.stringify(log), (error, reply) => {
            if (error) console.log(error);
            console.log(reply);
        });

        delete sms.peso, delete sms.pesoFornecedor;

        await redis_client.RPUSH(`sms-ranking-${instance}`, JSON.stringify(sms), (error, reply) => {
            if (error) console.log(error);
            console.log(reply);
        });
    }

    if (!mo) return rank;

    try {

        await redis_client.SET(`mo-${sms.numero}`, mo, (error, reply) => {
            if (error) console.log(error);
            console.log(reply);
        });
    
        let mo_to_postgres = await redis_client.GET(`mo-to-postgres`, (error, reply) => {
            if (error) console.log(error);
            console.log(reply);
        });
    
        if (mo_to_postgres == null) mo_to_postgres = '';
    
        if ( mo_to_postgres == '' || !mo_to_postgres.includes(sms.numero) )
            await redis_client.SET(`mo-to-postgres`, `${mo_to_postgres}${sms.numero}~${instance}/`, (error, reply) => {
                if (error) console.log(error);
                console.log(reply);
            });
    }
    catch (error) {

        console.log(`Could not save MO for ${sms.numero}... Skipping...`);
        console.error(error);
    }

    // try {
    //     // 
    //     await redis_client.ZADD(`rank`, {score: Math.floor(cursor.total/cursor.sms_counter), value: sms.numero}, (error, reply) => {
    //         if (error) console.log(error);
    //         console.log(reply);
    //     });
    // }
    // catch (error) {

    //     console.log(`Could not update rank for ${sms.numero}... Skipping...`);
    //     console.error(error);
    // }
    
    return rank;
}

async function reSyncCursor (number, provider) {

    try {

        let history = await postgres_client.query(`SELECT * FROM history WHERE number_provider LIKE '${sms.numero}_${sms.fornecedor}'`);

        cursor = {total: 0, sms_counter: 0};
        
        if (history.rows.length > 0) history.rows.forEach((sms_entry) => {

            if (cursor[provider] == undefined) cursor[provider] = 0;

            cursor.total += sms_entry.sms.peso, cursor.sms_counter++;
            cursor[provider]++;
        });

        await redis_client.SET(`cursor-${sms.numero}`, JSON.stringify(cursor), (error, reply) => {
            if (error) console.log(error);
            console.log(reply);
        });
    }
    catch (error) {
        console.log(`Could not re-sync cursor for ${number} on ${provider}... Re-triying...`);
        console.error(error);

        await reSyncCursor(number, provider);
    }
}

async function persistProviders () {

    while (true) {

        let code = await redis_client.LPOP(`providers`, (error, reply) => {
            if (error) console.log(error);
            console.log(reply);
        });

        if (code == null) break;

        let method = code.slice(0, 3);
        code = code.replace(`${method}/`, '');

        if (method == 'del') {

            console.log(`Deleting provider ${code} on instance ${instance}`);

            try{
                await redis_client.DEL(`provider-${code}`, (error, reply) => {
                    if (error) console.log(error);
                    console.log(reply);
                });
                await postgres_client.query(`DELETE FROM provider WHERE code = '${code}'`);

                let log = {
                    type: 'provider',
                    code: code,
                    status: 'success',
                    date: getTimestamp(new Date()),
                    message: `Successfully deleted provider`
                };
        
                await redis_client.RPUSH(`log-provider-${instance}`, JSON.stringify(log), (error, reply) => {
                    if (error) console.log(error);
                    console.log(reply);
                });

                continue;
            }
            catch (error) {
                console.error(`Could not delete provider ${code} on instance ${instance}... Skipping...`);
                console.error(error);

                let log = {
                    type: 'provider',
                    code: code,
                    status: 'error',
                    date: getTimestamp(new Date()),
                    message: `Could not delete provider`
                };
        
                await redis_client.RPUSH(`log-provider-${instance}`, JSON.stringify(log), (error, reply) => {
                    if (error) console.log(error);
                    console.log(reply);
                });
            }
        }

        let provider = await redis_client.GET(`provider-${code}`, (error, reply) => {
            if (error) console.log(error);
            console.log(reply);
        });

        if (provider == null) continue;

        provider = JSON.parse(provider);

        console.log(`Inserting provider ${code} on instance ${instance}`);

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
                date: getTimestamp(new Date()),
                message: `Successfully inserted provider`
            };

            await redis_client.RPUSH(`log-provider-${instance}`, JSON.stringify(log), (error, reply) => {
                if (error) console.log(error);
                console.log(reply);
            });
        }
        catch (error) {
            console.error(`Could not insert provider ${code} on instance ${instance}... Skipping...`);
            console.error(error);

            let log = {
                type: 'provider',
                code: code,
                status: 'error',
                date: getTimestamp(new Date()),
                message: `Could not insert provider`
            };
    
            await redis_client.RPUSH(`log-provider-${instance}`, JSON.stringify(log), (error, reply) => {
                if (error) console.log(error);
                console.log(reply);
            });
        }
    }
}

async function persistMo () {
    
    let mo_to_postgres = await redis_client.GET(`mo-to-postgres`, (error, reply) => {
        if (error) console.log(error);
        console.log(reply);
    });

    let pattern = new RegExp(`[0-9]+~${instance}\/`);

    while (true) {

        if (mo_to_postgres == "") break;

        if (mo_to_postgres.match(pattern) == null) break;

        let number = mo_to_postgres.match(pattern)[0].replace(`~${instance}/`, '');

        mo_to_postgres = mo_to_postgres.replace(`${number}~${instance}/`, '');

        let mo = await redis_client.GET(`mo-${number}`, (error, reply) => {
            if (error) console.log(error);
            console.log(reply);
        });

        if (mo == null) continue;

        // mo = JSON.parse(mo);

        try {
            await postgres_client.query(`INSERT INTO mo ("number", "balance", "date") VALUES ('${number}', '${mo}', '${getYmdDate(new Date())}') ON CONFLICT (number) DO UPDATE SET balance = ${mo}, date = '${getYmdDate(new Date())}'`);
        }
        catch (error) {
            console.error(`Could not insert MO for ${number}... Skipping...`);
            console.error(error);

            let log = {
                type: 'mo',
                number: sms.numero,
                provider: sms.fornecedor,
                status: 'error',
                date: getTimestamp(new Date()),
                message: `Could not insert MO`
            };
    
            await redis_client.RPUSH(`log-mo-${instance}`, JSON.stringify(log), (error, reply) => {
                if (error) console.log(error);
                console.log(reply);
            });
        }
    }

    await redis_client.DEL(`mo-to-postgres`, (error, reply) => {
        if (error) console.log(error);
        console.log(reply);
    });
}

async function connectToPostgres () {

    postgres_client = new pg.Client(database_config);
    postgres_client.connect(function (err) {
        if (err) {
            // settings.consoleLog(`=> [connection: ERROR, message: ${err.message}]`);
            console.log(err.message);
        }
    });

    // const res = await postgres_client.query('SELECT $1::text as message', ['\nSuccesfully connected to database\n']);
    // console.log(res.rows[0].message);
}

async function connectToRedis () {

    redis_client = redis.createClient({ socket: redis_config });
    
    redis_client.on('error', (error) => {
        console.log(`Error: ${error}`);
    });

    redis_client.connect();
}

async function startApp () {

    console.log(`\nLoading app on instance ${instance}...`);

    // DELETE

    let providers = await redisScan(0, {MATCH: 'provider-*', COUNT: 1000});

    providers.forEach(key => {
        redis_client.DEL(key, (error, reply) => {
            if (error) console.log(error);
            console.log(reply);
        });
    });

    delete providers;

    let mos = await redisScan(0, {MATCH: 'mo-*', COUNT: 1000});

    mos.forEach(key => {
        redis_client.DEL(key, (error, reply) => {
            if (error) console.log(error);
            console.log(reply);
        });
    });

    delete mos;

    let cursors = await redisScan(0, {MATCH: 'cursor-*', COUNT: 1000});

    cursors.forEach(key => {
        redis_client.DEL(key, (error, reply) => {
            if (error) console.log(error);
            console.log(reply);
        });
    });

    delete cursors;

    await redis_client.DEL(`rank`, (error, reply) => {
        if (error) console.log(error);
        console.log(reply);
    });

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
        
        redis_client.SET(`provider-${code}`, JSON.stringify(provider), (error, reply) => {
            if (error) console.log(error);
            console.log(reply);
        });
    });

    delete providers_wrapper;

    let mos_wrapper = await postgres_client.query('SELECT * FROM mo');

    if (mos_wrapper.rows.length > 0) mos_wrapper.rows.forEach((mo) => {
        let number = mo.number;
        delete mo.number;

        redis_client.SET(`mo-${number}`, mo.balance, (error, reply) => {
            if (error) console.log(error);
            console.log(reply);
        });
    });

    delete mos_wrapper;

    let history = await postgres_client.query('SELECT * FROM history');

    cursors = new Object();
    
    if (history.rows.length > 0) history.rows.forEach((sms_entry, key) => {
        let number = sms_entry.number_provider.split('_')[0];
        let provider = sms_entry.number_provider.split('_')[1];

        if (cursors[number] == undefined) cursors[number] = {total: 0, sms_counter: 0};
        if (cursors[number][provider] == undefined) cursors[number][provider] = {total: 0, statement: "insert"};

        cursors[number].total += sms_entry.sms.peso, cursors[number].sms_counter++;
        cursors[number][provider].total++;
        delete history.rows[key];
    });

    delete history;

    Object.keys(cursors).forEach(number => {
        redis_client.SET(`cursor-${number}`, JSON.stringify(cursors[number]), (error, reply) => {
            if (error) console.log(error);
            console.log(reply);
        });

        redis_client.ZADD(`rank`, {score: Math.floor(cursors[number].total/cursors[number].sms_counter), value: number}, (error, reply) => {
            if (error) console.log(error);
            console.log(reply);
        });
        delete cursors[number];
    });

    delete cursors;

    // let cursors_wrapper = await postgres_client.query('SELECT * FROM cursor');

    // if (cursors_wrapper.rows.length > 0) cursors_wrapper.rows.forEach((cursor) => {
    //     let number_provider = cursor.number_provider;
    //     delete cursor.number_provider;

    //     redis_client.SET(`cursor-${number_provider}`, JSON.stringify(cursor), (error, reply) => {
    //         if (error) console.log(error);
    //         console.log(reply);
    //     });
    // });

    // delete cursors_wrapper;

    // let ranks = await redisScan(0, {MATCH: 'rank-*', COUNT: 1000});

    // Object.keys(ranks).forEach(key => {
    //     redis_client.DEL(key, (error, reply) => {
    //         if (error) console.log(error);
    //         console.log(reply);
    //     });
    // });

    // delete ranks;
    
    // let ranks_wrapper = await postgres_client.query('SELECT * FROM rank');

    // if (ranks_wrapper.rows.length > 0) ranks_wrapper.rows.forEach((rank) => {
    //     let number = rank.number;
    //     delete rank.number;

    //     redis_client.SET(`rank-${number}`, `${rank.total}/${rank.sms_counter}`, (error, reply) => {
    //         if (error) console.log(error);
    //         console.log(reply);
    //     });
    // });

    // delete ranks_wrapper;

    // let histories = await redisScan(0, {MATCH: 'history-*', COUNT: 1000});

    // console.log(histories);

    // Object.keys(histories).forEach(key => {
    //     redis_client.DEL(key, (error, reply) => {
    //         if (error) console.log(error);
    //         console.log(reply);
    //     });
    // });

    // return;
}

async function setDashboard () {

    let dashboard = new Object();

    let providers = await redisScan(0, {MATCH: 'provider-*', COUNT: 1000});
    dashboard.providers = providers.length;

    let mos = await redisScan(0, {MATCH: 'mo-*', COUNT: 1000});
    dashboard.mos = mos.length;

    // let cursors = await postgres_client.query(`SELECT COUNT (*) FROM (SELECT DISTINCT SUBSTRING("number_provider" FROM 1 FOR POSITION('_' IN "number_provider") - 1) AS "number" FROM history) AS t`);
    // dashboard.cursors = cursors.rows[0].count;
    let ranks = await redis_client.ZCOUNT(`rank`, '-inf', '+inf', (error, reply) => {
        if (error) console.log(error);
        console.log(reply);
    });
    dashboard.ranks = ranks;

    // 86400000 = 1 day in milliseconds
    let log_history = new Object();
    for (let i = 0; i < 14; i++){

        let where = `WHERE message = 'Successfully inserted history' AND "date"::date = '${getYmdDate(new Date (Date.now() - i * 86400000))}' `;

        let result = await postgres_client.query(`SELECT COUNT(*) FROM log_history ${where}`);
        log_history[`ranked_day${i+1}`] = result.rows[0].count;

        result = await postgres_client.query(`SELECT COUNT(*) FROM log_history ${where} AND status = 'MO'`);
        log_history[`ranked_day${i+1}_MO`] = result.rows[0].count;

        result = await postgres_client.query(`SELECT COUNT(*) FROM log_history ${where} AND status = 's200'`);
        log_history[`ranked_day${i+1}_s200`] = result.rows[0].count;

        result = await postgres_client.query(`SELECT COUNT(*) FROM log_history ${where} AND status = 's404'`);
        log_history[`ranked_day${i+1}_s404`] = result.rows[0].count;

        result = await postgres_client.query(`SELECT COUNT(*) FROM log_history ${where} AND status = 's500'`);
        log_history[`ranked_day${i+1}_s500`] = result.rows[0].count;

        result = await postgres_client.query(`SELECT COUNT(*) FROM log_history ${where} AND status = 's503'`);
        log_history[`ranked_day${i+1}_s503`] = result.rows[0].count;

        result = await postgres_client.query(`SELECT COUNT(*) FROM log_history ${where} AND status = 'default'`);
        log_history[`ranked_day${i+1}_default`] = result.rows[0].count;
    }

    dashboard.log_history = log_history;

    let log_mo = await postgres_client.query(`SELECT * FROM log_mo WHERE status = 'success' AND "message" = 'New MO' ORDER BY id desc LIMIT 3;`);

    dashboard.log_mo = log_mo.rows;

    let ranked_by_provider = await postgres_client.query(`SELECT COUNT (*), substring(number_provider from 15 for length(number_provider) ) AS "code" FROM history WHERE substring(number_provider, length(number_provider)) = '0' GROUP BY "code" ORDER BY count asc`);

    ranked_by_provider.rows.forEach((value, key) => {
        ranked_by_provider.rows[key].code = ranked_by_provider.rows[key].code.slice(0, -2);
    });

    dashboard.ranked_by_provider = ranked_by_provider.rows;

    let logs = await postgres_client.query(`SELECT COUNT (*) FROM log_history as lh, log_mo as lm, log_provider as lp WHERE lh.message = 'Could not insert history' OR lm.status = 'error' OR lp.status = 'error'`);

    dashboard.logs = logs.rows[0].count;

    await redis_client.SET(`dashboard`, JSON.stringify(dashboard), (error, reply) => {
        if (error) console.log(error);
        console.log(reply);
    });
}

async function processSms () {

    while (true){

        let providers = await redis_client.LLEN(`providers`, (error, reply) => {
            if (error) console.log(error);
            console.log(reply);
        });

        if (providers > 0) break;

        let sms = await redis_client.LPOP(`sms-ranking-${instance}`, (error, reply) => {
            if (error) console.log(error);
            console.log(reply);
        });
    
        if (sms == null) break;
    
        sms = JSON.parse(sms);
    
        let history = await rankSmsLite(sms);
        if (history == undefined)
            console.log(`Provider ${sms.fornecedor} not found. Skipping...`);
    }
}

function getTimestamp (date) {

    let year = date.getFullYear();
    let month = String(date.getMonth() + 1).padStart(2, '0');
    let day = String(date.getDate()).padStart(2, '0');

    let hour = String(date.getHours()).padStart(2, '0');
    let minute = String(date.getMinutes()).padStart(2, '0');
    let second = String(date.getSeconds()).padStart(2, '0');

    return year + '-' + month + '-' + day + ' ' + hour + ':' + minute + ':' + second;
}

async function persistLogMo () {

    try {
        let query = `INSERT INTO log_mo `
            query += `("number", "provider", "status", "message", "date") VALUES `;

        while (true){

            let log = await redis_client.LPOP(`log-mo-${instance}`, (error, reply) => {
                if (error) console.log(error);
                console.log(reply);
            });
        
            if (log == null) break;
        
            log = JSON.parse(log);

            query += `('${log.number}', '${log.provider}', '${log.status}', '${log.message}', '${log.date}'), `;
        }

        query = query.slice(0, -2);

        await postgres_client.query(query);
    }
    catch (error) {
        console.error(`Could not insert MO logs on instance ${instance}... Skipping...`);
        console.error(error);
    }
}

async function persistLogProvider () {
    
    try {
        let query = `INSERT INTO log_provider `
            query += `("code", "status", "message", "date") VALUES `;

        while (true){

            let log = await redis_client.LPOP(`log-provider-${instance}`, (error, reply) => {
                if (error) console.log(error);
                console.log(reply);
            });
        
            if (log == null) break;
        
            log = JSON.parse(log);

            query += `('${log.code}', '${log.status}', '${log.message}', '${log.date}'), `;
        }

        query = query.slice(0, -2);

        await postgres_client.query(query);
    }
    catch (error) {
        console.error(`Could not insert provider logs on instance ${instance}... Skipping...`);
        console.error(error);
    }
}

async function persistLogHistory () {
    
        try {
            let query = `INSERT INTO log_history `
                query += `("number", "provider", "status", "message", "date") VALUES `;
    
            while (true){
    
                let log = await redis_client.LPOP(`log-history-${instance}`, (error, reply) => {
                    if (error) console.log(error);
                    console.log(reply);
                });
            
                if (log == null) break;
            
                log = JSON.parse(log);
    
                query += `('${log.number}', '${log.provider}', '${log.status}', '${log.message}', '${log.date}'), `;
            }
    
            query = query.slice(0, -2);
    
            await postgres_client.query(query);
        }
        catch (error) {
            console.error(`Could not insert history logs on instance ${instance}... Skipping...`);
            console.error(error);
        }
}

async function main () {
    
    // return;

    console.log(`Loading instance ${instance}...`);

    await connectToPostgres();
    await connectToRedis();

    await redis_client.SET(`loaded`, 'false', (error, reply) => {
        if (error) console.log(error);
        console.log(reply);
    });

    if (instance != 1) while (true){

        await sleep(5000).then(() => {});

        let loaded = await redis_client.GET(`loaded`, (error, reply) => {
            if (error) console.log(error);
            console.log(reply);
        });

        if (loaded == 'true') break;

        console.log(`Waiting for instance 1 to load on instance ${instance}...`)
    }

    else {
        console.time('Total load time');
            console.time('Start app');
            await startApp();
            console.timeEnd('Start app');
            console.time('Set dashboard');
            await setDashboard();
            console.timeEnd('Set dashboard');

            await redis_client.SET(`loaded`, 'true', (error, reply) => {
            if (error) console.log(error);
            console.log(reply);
            });
        console.timeEnd('Total load time');
    }

    console.log(`Instance ${instance} loaded.`);

    while (true){

        let providers = await redis_client.LLEN(`providers`, (error, reply) => {
            if (error) console.log(error);
            console.log(reply);
        });

        if (providers > 0) {
            await persistProviders();
            continue;
        }

        let sms = await redis_client.LLEN(`sms-ranking-${instance}`, (error, reply) => {
            if (error) console.log(error);
            console.log(reply);
        });

        if (sms > 0) {
            console.time('Process SMS time');
            console.log(`Processing ${sms} SMS on instance ${instance}...`)
            await processSms();
            console.timeEnd('Process SMS time');
            continue;
        }

        let mo_to_postgres = await redis_client.GET(`mo-to-postgres`, (error, reply) => {
            if (error) console.log(error);
            console.log(reply);
        });

        if (mo_to_postgres != null){
            
            let mos = mo_to_postgres.split('/').length;
            console.log(`Inserting ${mos} MO on instance ${instance}`);

            await persistMo();
            continue;
        }

        let log_history = await redis_client.LLEN(`log-history-${instance}`, (error, reply) => {
            if (error) console.log(error);
            console.log(reply);
        });

        if (log_history > 0) {
            console.time('Persist Log time');
            console.time('Persist Log History time');
            await persistLogHistory();
            console.timeEnd('Persist Log History time');
            continue;
        }

        let log_provider = await redis_client.LLEN(`log-provider-${instance}`, (error, reply) => {
            if (error) console.log(error);
            console.log(reply);
        });

        if (log_provider > 0) {
            console.time('Persist Log Provider time');
            await persistLogProvider();
            console.timeEnd('Persist Log Provider time');
            continue;
        }

        let log_mo = await redis_client.LLEN(`log-mo-${instance}`, (error, reply) => {
            if (error) console.log(error);
            console.log(reply);
        });

        if (log_mo > 0) {
            console.time('Persist Log MO time');
            await persistLogMo();
            console.timeEnd('Persist Log MO time');
            console.timeEnd('Persist Log time');
            continue;
        }
        
        console.log(`No SMS to rank or data to persist on instance ${instance}. Sleeping...`);
        await sleep(30000).then(() => {});
        continue;
    }
}

main();