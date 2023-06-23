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

let functions = new Object();

functions['sleep'] = (delay) => {

    console.log('No SMS to rank or data to persist. Sleeping...')

    return new Promise((resolve) => {
        setTimeout(() => {
            resolve(true);
        }, delay);
    });
}

functions['get-ymd-date'] = (date) => {

    let year = date.getFullYear();
    let month = String(date.getMonth() + 1).padStart(2, '0');
    let day = String(date.getDate()).padStart(2, '0');

    return year + '-' + month + '-' + day;
}

functions['redis-scan'] = async (cursor, options, output = {}) => {

	let scan = await redis_client.SCAN(cursor, options, (error, reply) => {
		if (error) console.log(error);
		console.log(reply);
	});

	const promises = scan.keys.map(async key => {
		await redis_client.DEL(key, (error, reply) => {
			if (error) console.log(error);
			console.log(reply);
		});
	});

	await Promise.all(promises);

	if (scan.cursor != 0) await functions['redis-scan'](scan.cursor, options, output);

	return output;
}

functions['rank-number'] = (number_average, provider_leverage, sms) => {

    if (sms.status == '200'){

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

functions['rank-number-flash'] = (total, sms_counter, provider_leverage, sms, has_mo) => {

    if (has_mo) return `${parseInt(total) + 100}/${parseInt(sms_counter) + 1}`;

    let number_average = total / sms_counter;

    if (sms.status == '200'){

        let leverage = (100 - provider_leverage) / 100;
        let rank = 50 + Math.round(number_average * (2 + leverage));

        if (rank > 100) rank = 100;
        return `${parseInt(total) + rank}/${parseInt(sms_counter) + 1}`;
    }

    let leverage = provider_leverage / 2;
    leverage = (100 - leverage) / 100;

    let rank = Math.round(number_average * leverage);

    return `${parseInt(total) + rank}/${parseInt(sms_counter) + 1}`;
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

functions['rank-sms'] = async (sms) => {

    console.log(`\nRanking SMS for ${sms.numero} on ${sms.fornecedor}`);

	let provider = await redis_client.GET(`provider-${sms.fornecedor}`, (error, reply) => {
        if (error) console.log(error);
        console.log(reply);
    });

    provider = JSON.parse(provider);
    
    if (provider === null) return undefined;
    provider.code = sms.fornecedor;

	let number = sms.numero;
	let provider_leverage = provider[sms.status.toLowerCase()];

	let rank = provider_leverage;

	// let mo = await postgres_client.query(`SELECT * FROM mo WHERE number = '${number}'`);
    let mo = await redis_client.GET(`mo-${number}`, (error, reply) => {
        if (error) console.log(error);
        console.log(reply);
    });
    
    if (mo == null && sms.status.toUpperCase() == 'MO') mo = 1001;
    
	if (mo != null) {
        console.log(`MO found for ${number}`)
		rank = 100;
		mo--;

        if (mo == 0){
            // await postgres_client.query(`DELETE FROM mo WHERE number = '${mo.number}'`);
            await redis_client.DEL(`mo-${number}`, (error, reply) => {
                if (error) console.log(error);
                console.log(reply);
            });
            mo = false;
        }
	}

    // let history = await redis_client.GET(`history-${number}`, (error, reply) => {
    //     if (error) console.log(error);
    //     console.log(reply);
    // });

    // history = JSON.parse(history);

    // if (history == null){

        history = await postgres_client.query(`SELECT * FROM history WHERE number = '${number}'`);
        history = history.rows[0];
    // }

	if (history != undefined && mo == undefined){

		let number_average = 0, provider_total = 0;
		Object.values(history.providers).forEach(provider_entry => {
			provider_entry.forEach(sms_entry => {
				number_average += sms_entry.peso;
			});
			provider_total += provider_entry.length;
		});

		number_average = Math.round(number_average / provider_total);

		rank = functions['rank-number'](number_average, provider_leverage, sms);
	}

	sms.peso = rank;

    if (history == null ) history = {"number": number};
	if (history.providers == undefined ) history.providers = new Object();
	if (history.providers[provider.code] == undefined) history.providers[provider.code] = new Array();
	
	delete sms.numero;
	delete sms.fornecedor;
	sms.pesoFornecedor = provider_leverage;
	
	if (history.providers[provider.code].length >= 10) history.providers[provider.code].shift();
	history.providers[provider.code].push(sms);
	
	console.log(`Provider leverage for status ${sms.status} is ${provider_leverage}. History length is ${history.providers[provider.code].length}\n`);

	await postgres_client.query(`INSERT INTO history (number, providers) VALUES ('${history.number}', '${JSON.stringify(history.providers)}') ON CONFLICT (number) DO UPDATE SET providers = '${JSON.stringify(history.providers)}'`);
    // await redis_client.SET(`history-${number}`, JSON.stringify(history), (error, reply) => {
    //     if (error) console.log(error);
    //     console.log(reply);
    // });

    // let history_to_postgres = await redis_client.GET(`history-to-postgres`, (error, reply) => {
    //     if (error) console.log(error);
    //     console.log(reply);
    // });

    // if (history_to_postgres == null) history_to_postgres = '';

    // if ( history_to_postgres == '' || !history_to_postgres.includes(number) )
    //     await redis_client.SET(`history-to-postgres`, `${history_to_postgres}${number}~${instance}/`, (error, reply) => {
    //         if (error) console.log(error);
    //         console.log(reply);
    //     });

    if (!mo) return history;

    // await postgres_client.query(`INSERT INTO mo (number, balance, date) VALUES ('${mo.number}', '${mo.balance}', '${mo.date}') ON CONFLICT (number) DO UPDATE SET balance = ${mo.balance}, date = '${mo.date}'`);
    await redis_client.SET(`mo-${number}`, mo, (error, reply) => {
        if (error) console.log(error);
        console.log(reply);
    });

    let mo_to_postgres = await redis_client.GET(`mo-to-postgres`, (error, reply) => {
        if (error) console.log(error);
        console.log(reply);
    });

    if (mo_to_postgres == null) mo_to_postgres = '';

    if ( mo_to_postgres == '' || !mo_to_postgres.includes(number) )
        await redis_client.SET(`mo-to-postgres`, `${mo_to_postgres}${number}~${instance}/`, (error, reply) => {
            if (error) console.log(error);
            console.log(reply);
        });

    return history;
}

functions['rank-sms-flash'] = async (sms) => {

    console.log(`\nRanking SMS for ${sms.numero} on ${sms.fornecedor} - FLASH MODE`);

	let provider = await redis_client.GET(`provider-${sms.fornecedor}`, (error, reply) => {
        if (error) console.log(error);
        console.log(reply);
    });

    provider = JSON.parse(provider);
    
    if (provider === null) return;

	let provider_leverage = provider[sms.status.toLowerCase()];

	let rank = `${provider_leverage}/1`;

    let has_mo = false;

    let mo = await redis_client.GET(`mo-${sms.numero}`, (error, reply) => {
        if (error) console.log(error);
        console.log(reply);
    });
    
    if (mo == null && sms.status.toLowerCase() == 'mo') mo = 1001;
    
	if (mo != null) {
        console.log(`MO found for ${sms.numero}`)
		has_mo = true;
		mo--;

        if (mo <= 0){
            
            await redis_client.DEL(`mo-${sms.numero}`, (error, reply) => {
                if (error) console.log(error);
                console.log(reply);
            });
            mo = false;
        }
	}

    let history = new Object();
    let cursor = await redis_client.GET(`cursor-${sms.numero}_${sms.fornecedor}`, (error, reply) => {
         if (error) console.log(error);
        console.log(reply);
    });

    if (cursor != null && !has_mo){
    
        cursor = JSON.parse(cursor);
        
        rank = await redis_client.GET(`rank-${sms.numero}`, (error, reply) => {
            if (error) console.log(error);
            console.log(reply);
        });

		rank = functions['rank-number-flash'](rank.split('/')[0], rank.split('/')[1], provider_leverage, sms, has_mo);
	}

    if (cursor == null )
        cursor = {"counter": 1, "statement": "insert"};
    
    let length = cursor.counter;
    if (cursor.statement == "update") length = 10;
	
	console.log(`Provider leverage for status ${sms.status} is ${provider_leverage}. History length is ${length}\n`);

    history = {
        "cursor": cursor.counter,
        "statement": cursor.statement,
        "sms": sms
    };

    let total = rank.split('/')[0], sms_counter = rank.split('/')[1];

    sms.peso = total/sms_counter;
	sms.pesoFornecedor = provider_leverage;

    if (has_mo) sms.peso = 100;

    console.log('total', total);
    console.log('sms_counter', sms_counter);
    if (cursor.statement == "insert"){

        await redis_client.SET(`rank-${sms.numero}`, `${total}/${sms_counter}`, (error, reply) => {
            if (error) console.log(error);
            console.log(reply);
        });
    }

    if (cursor.statement == "update"){
        let old_leverage = await postgres_client.query(`SELECT sms FROM history WHERE cursor = '${history.cursor - 1}' AND number = '${sms.numero}' AND provider = '${provider}'`);

        total -= old_leverage.rows[0].sms.peso;

        await redis_client.ZADD(`rank-${sms.numero}`, `${total}/${sms_counter}`, (error, reply) => {
            if (error) console.log(error);
            console.log(reply);
        });
    }      

    cursor.counter++;
    if (cursor.counter > 10) cursor.counter = 1, cursor.statement = "update";

    await redis_client.RPUSH(`history-to-postgres`, JSON.stringify(history), (error, reply) => {
        if (error) console.log(error);
        console.log(reply);
    });

    await redis_client.SET(`cursor-${sms.numero}_${sms.fornecedor}`, JSON.stringify(cursor), (error, reply) => {
        if (error) console.log(error);
       console.log(reply);
    });

    if (!mo) return history;

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

    return history;
}

async function rankSmsLite (sms) {

    console.log(`\nRanking SMS for ${sms.numero} on ${sms.fornecedor} - LITE MODE`);

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
    
    if (mo == null && sms.status.toLowerCase() == 'mo') mo = 1001;
    
	if (mo != null) {
        console.log(`MO found for ${sms.numero}`)
		has_mo = true;
		mo--;

        if (mo <= 0){
            
            await redis_client.DEL(`mo-${sms.numero}`, (error, reply) => {
                if (error) console.log(error);
                console.log(reply);
            });
            mo = false;
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

        console.log(`Provider leverage for status ${sms.status} is ${provider_leverage}. History length is ${cursor[sms.fornecedor].total}\n`);

        await postgres_client.query(`INSERT INTO history (number_provider, sms) VALUES ('${sms.numero}_${sms.fornecedor}_${cursor[sms.fornecedor].total}', '${JSON.stringify(sms)}') ON CONFLICT (number_provider) DO UPDATE SET sms = '${JSON.stringify(sms)}'`);

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
            console.log(`Could not update cursor for ${sms.numero} on ${sms.fornecedor}... Re-syncing...`);
            console.error(error);

            await reSyncCursor(sms.numero, sms.fornecedor);

            // await redis_client.RPUSH(`sms-to-rank`, JSON.stringify(sms), (error, reply) => {
            //     if (error) console.log(error);
            //     console.log(reply);
            // });
        }
    }
    catch (error) {
        console.log(`Could not insert history for ${sms.numero} on ${sms.fornecedor}... Skipping...`);
        console.error(error);
        console.error({sms: sms, cursor: cursor, provider: cursor[sms.numero], rank: rank, mo: mo})

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

functions['get-rank'] = async (history) => {

    let rank = await redis_client.GET(`rank-${history.sms.numero}`, (error, reply) => {
        if (error) console.log(error);
        console.log(reply);
    });

    return rank;
}

functions['persist-providers'] = async () => {

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

            await postgres_client.query(`DELETE FROM providers WHERE code = '${code}'`);
            continue;
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
		fields.push(`'${provider['200']}'`);
		fields.push(`'${provider['404']}'`);
		fields.push(`'${provider['500']}'`);
		fields.push(`'${provider['503']}'`);
		fields.push(`'${provider['default']}'`);

        await postgres_client.query(`INSERT INTO providers (code, "MO", "200", "404", "500", "503", "default") VALUES (${fields.join(', ')}) ON CONFLICT (code) DO UPDATE SET "MO" = '${provider['mo']}', "200" = '${provider['200']}', "404" = '${provider['404']}', "500" = '${provider['500']}', "503" = '${provider['503']}', "default" = '${provider['default']}'`);
    }
}

functions['persist-history'] = async () => {
    
    let history_to_postgres = await redis_client.GET(`history-to-postgres`, (error, reply) => {
        if (error) console.log(error);
        console.log(reply);
    });

    let pattern = new RegExp(`[0-9]+~${instance}\/`);

    while (true) {

        if (history_to_postgres == "") break;

        let number = history_to_postgres.match(pattern)[0].replace(`~${instance}/`, '');
        
        history_to_postgres = history_to_postgres.replace(`${number}~${instance}/`, '');

        let history = await redis_client.GET(`history-${number}`, (error, reply) => {
            if (error) console.log(error);
            console.log(reply);
        });

        if (history == null) continue;

        history = JSON.parse(history);

        console.log(`Inserting history for ${number} on instance ${instance}`);

        await postgres_client.query(`INSERT INTO history (number, providers) VALUES ('${number}', '${JSON.stringify(history.providers)}') ON CONFLICT (number) DO UPDATE SET providers = '${JSON.stringify(history.providers)}'`);

        await redis_client.DEL(`history-${number}`, (error, reply) => {
            if (error) console.log(error);
            console.log(reply);
        });
    }

    await redis_client.DEL(`history-to-postgres`, (error, reply) => {
        if (error) console.log(error);
        console.log(reply);
    });
}

functions['persist-history-flash'] = async () => {

    while (true) {

        let history_to_postgres = await redis_client.LPOP(`history-to-postgres`, (error, reply) => {
            if (error) console.log(error);
            console.log(reply);
        });    

        if (history_to_postgres == null) return;

        history_to_postgres = JSON.parse(history_to_postgres);
        let number = history_to_postgres.sms.numero, provider = history_to_postgres.sms.fornecedor;
        let rank = await functions['get-rank'](history_to_postgres);

        let total = rank.split('/')[0], sms_counter = rank.split('/')[1];

        console.log(`Inserting history for ${number} on instance ${instance}`);

        if (history_to_postgres.statement == "insert"){

            await postgres_client.query(`INSERT INTO history (cursor, number, provider, sms) VALUES ('${history_to_postgres.cursor}', '${number}', '${provider}', '${JSON.stringify(history_to_postgres.sms)}')`);
        }
        
        if (history_to_postgres.statement == "update"){
            
            await postgres_client.query(`UPDATE history SET sms = '${JSON.stringify(history_to_postgres.sms)}' WHERE cursor = '${history_to_postgres.cursor}' AND number = '${number}' AND provider = '${provider}'`);
        }

        await postgres_client.query(`INSERT INTO cursor (number_provider, counter, statement) VALUES ('${number}_${provider}', '${history_to_postgres.cursor}', '${history_to_postgres.statement}') ON CONFLICT (number_provider) DO UPDATE SET counter = '${history_to_postgres.cursor}', statement = '${history_to_postgres.statement}'`);
        
        await postgres_client.query(`INSERT INTO rank (number, total, sms_counter) VALUES ('${number}', '${total}', '${sms_counter}') ON CONFLICT (number) DO UPDATE SET total = '${total}', sms_counter = '${sms_counter}'`);
    }
}

async function persistHistoryLite () {

}

functions['persist-mo'] = async () => {
    
    let mo_to_postgres = await redis_client.GET(`mo-to-postgres`, (error, reply) => {
        if (error) console.log(error);
        console.log(reply);
    });

    let pattern = new RegExp(`[0-9]+~${instance}\/`);

    while (true) {

        if (mo_to_postgres == "") break;

        let number = mo_to_postgres.match(pattern)[0].replace(`~${instance}/`, '');

        mo_to_postgres = mo_to_postgres.replace(`${number}~${instance}/`, '');

        let mo = await redis_client.GET(`mo-${number}`, (error, reply) => {
            if (error) console.log(error);
            console.log(reply);
        });

        if (mo == null) continue;

        // mo = JSON.parse(mo);

        console.log(`Inserting MO for ${number} on instance ${instance}`);

        await postgres_client.query(`INSERT INTO mo ("number", "balance", "date") VALUES ('${number}', '${mo}', '${functions['get-ymd-date'](new Date())}') ON CONFLICT (number) DO UPDATE SET balance = ${mo}, date = '${functions['get-ymd-date'](new Date())}'`);
    }

    await redis_client.DEL(`mo-to-postgres`, (error, reply) => {
        if (error) console.log(error);
        console.log(reply);
    });
}

functions['connect-to-postgres'] = async () => {

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

functions['connect-to-redis'] = async () => {

    redis_client = redis.createClient({ socket: redis_config });
    
    redis_client.on('error', (error) => {
        console.log(`Error: ${error}`);
    });

    redis_client.connect();
}

async function startApp () {

    console.log(`\nLoading app on instance ${instance}...`);

    // DELETE

    let providers = await functions['redis-scan'](0, {MATCH: 'provider-*', COUNT: 1000});

    Object.keys(providers).forEach(key => {
        redis_client.DEL(key, (error, reply) => {
            if (error) console.log(error);
            console.log(reply);
        });
    });

    delete providers;

    let mos = await functions['redis-scan'](0, {MATCH: 'mo-*', COUNT: 1000});

    Object.keys(mos).forEach(key => {
        redis_client.DEL(key, (error, reply) => {
            if (error) console.log(error);
            console.log(reply);
        });
    });

    delete mos;

    let cursors = await functions['redis-scan'](0, {MATCH: 'cursor-*', COUNT: 1000});

    Object.keys(cursors).forEach(key => {
        redis_client.DEL(key, (error, reply) => {
            if (error) console.log(error);
            console.log(reply);
        });
    });

    delete cursors;

    // SET

    let providers_wrapper = await postgres_client.query('SELECT * FROM providers');
    
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
    
    if (history.rows.length > 0) history.rows.forEach((sms_entry) => {
        let number = sms_entry.number_provider.split('_')[0];
        let provider = sms_entry.number_provider.split('_')[1];

        if (cursors[number] == undefined) cursors[number] = {total: 0, sms_counter: 0};
        if (cursors[number][provider] == undefined) cursors[number][provider] = {total: 0, statement: "insert"};

        cursors[number].total += sms_entry.sms.peso, cursors[number].sms_counter++;
        cursors[number][provider]++;
    });

    Object.keys(cursors).forEach(number => {
        redis_client.SET(`cursor-${number}`, JSON.stringify(cursors[number]), (error, reply) => {
            if (error) console.log(error);
            console.log(reply);
        });

        delete cursors[number];
    });

    delete cursors, history;

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

    // let ranks = await functions['redis-scan'](0, {MATCH: 'rank-*', COUNT: 1000});

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

    // let histories = await functions['redis-scan'](0, {MATCH: 'history-*', COUNT: 1000});

    // console.log(histories);

    // Object.keys(histories).forEach(key => {
    //     redis_client.DEL(key, (error, reply) => {
    //         if (error) console.log(error);
    //         console.log(reply);
    //     });
    // });

    // return;
}

functions['main'] = async () => {
    
    await functions['connect-to-postgres']();
    await functions['connect-to-redis']();

    console.time('Load time');
    await startApp();
    console.timeEnd('Load time');

    // return;

    await functions['sleep'](2000).then(() => {});

    console.time('Execution time');
    let testing_time = true;

    let counter = 0;
    while (true){

        let providers = await redis_client.LLEN(`providers`, (error, reply) => {
            if (error) console.log(error);
            console.log(reply);
        });

        if (providers > 0) {
            await functions['persist-providers']();
            continue;
        }

        let sms = await redis_client.LPOP(`sms-ranking-${instance}`, (error, reply) => {
            if (error) console.log(error);
            console.log(reply);
        });
    
        if (sms == null) {
            
            if (testing_time) {
                console.timeEnd('Execution time'); console.log()
                testing_time = false;
            }

            // let history_to_postgres = await redis_client.LLEN(`history-to-postgres`, (error, reply) => {
            //     if (error) console.log(error);
            //     console.log(reply);
            // });
    
            // if (history_to_postgres > 0) {
            //     await functions['persist-history-lite']();
            //     continue;
            // }

            let mo_to_postgres = await redis_client.GET(`mo-to-postgres`, (error, reply) => {
                if (error) console.log(error);
                console.log(reply);
            });

            if (mo_to_postgres != null){
                await functions['persist-mo']();
                continue;
            }
            
            await functions['sleep'](3000).then(() => {});
            continue;
        }
    
        sms = JSON.parse(sms);
    
        let history = await rankSmsLite(sms);
        if (history == undefined) {
            console.log(`Provider ${sms.fornecedor} not found. Skipping...`);
            continue;
        }

        counter++;
    }
}

functions['main']();