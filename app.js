const pg = require('pg');
const redis = require('redis');

let postgres_client, redis_client;

let instance = 1;
if (process.argv[2]) instance = process.argv[2];

let env = new Object();
try{
    env = JSON.parse(process.argv[3]);
} catch (error) {
    console.log('\nNo .env file provided. Using default values...\n');

    env.database_config = {
		host: 'localhost',
		port: 5432,
		database: 'ranking',
		user: 'postgres',
		password: 'postgres'
	}
}

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
		let row = await redis_client.GET(key, (error, reply) => {
			if (error) console.log(error);
			console.log(reply);
		});
		output[key] = row;
	});

	await Promise.all(promises);

	if (scan.cursor != 0) functions['redis-scan'](scan.cursor, options, output);

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

functions['get-rank'] = (history) => {

    let number_average = 0, provider_total = 0;

    Object.values(history.providers).forEach(provider_entry => {
        provider_entry.forEach(sms_entry => {
            number_average += sms_entry.peso;
        });
        provider_total += provider_entry.length;
    });

    return Math.round(number_average / provider_total);
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

    postgres_client = new pg.Client(env['database_config']);
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

    redis_client = redis.createClient();
    
    redis_client.on('error', (error) => {
        console.log(`Error: ${error}`);
    });

    redis_client.connect();
}

functions['main'] = async () => {
    
    await functions['connect-to-postgres']();
    await functions['connect-to-redis']();

    let providers = await functions['redis-scan'](0, {MATCH: 'provider-*'});

    Object.keys(providers).forEach(key => {
        redis_client.DEL(key, (error, reply) => {
            if (error) console.log(error);
            console.log(reply);
        });
    });
    
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

    delete providers_wrapper

    let mos = await functions['redis-scan'](0, {MATCH: 'mo-*', COUNT: 1000});

    Object.keys(mos).forEach(key => {
        redis_client.DEL(key, (error, reply) => {
            if (error) console.log(error);
            console.log(reply);
        });
    });
    
    let mos_wrapper = await postgres_client.query('SELECT * FROM mo');

    if (mos_wrapper.rows.length > 0) mos_wrapper.rows.forEach((mo) => {
        let number = mo.number;
        delete mo.number;

        redis_client.SET(`mo-${number}`, mo.balance, (error, reply) => {
            if (error) console.log(error);
            console.log(reply);
        });
    });

    // let histories = await functions['redis-scan'](0, {MATCH: 'history-*', COUNT: 1000});

    // console.log(histories);

    // Object.keys(histories).forEach(key => {
    //     redis_client.DEL(key, (error, reply) => {
    //         if (error) console.log(error);
    //         console.log(reply);
    //     });
    // });

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

        // if (counter >= 100) {
        //     await functions['persist-history']();
        //     counter = 0; continue;
        // }

        let sms = await redis_client.LPOP(`sms-ranking-${instance}`, (error, reply) => {
            if (error) console.log(error);
            console.log(reply);
        });
    
        if (sms == null) {
            
            if (testing_time) {
                console.timeEnd('Execution time'); console.log()
                testing_time = false;
            }

            // let history_to_postgres = await redis_client.GET(`history-to-postgres`, (error, reply) => {
            //     if (error) console.log(error);
            //     console.log(reply);
            // });

            // if (history_to_postgres != null){
            //     await functions['persist-history']();
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
            
            await functions['sleep'](10000).then(() => {});
            continue;
        }
    
        sms = JSON.parse(sms);
        let number = sms.numero
    
        let history = await functions['rank-sms'](sms);
        if (history == undefined) {
            console.log(`Provider ${sms.fornecedor} not found. Skipping...`);
            continue;
        }

        let rank = functions['get-rank'](history);
        
        // console.log(rank, sms.numero)
        await redis_client.ZADD('rank', {"score": rank, "value": number}, (error, reply) => {
            if (error) console.log(error);
            console.log(reply);
        });

        counter++;
    }
}

functions['main']();