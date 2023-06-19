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

    console.log('No SMS found to rank. Sleeping...')

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

    
    if (mo == null && sms.status == 'MO') mo = 1001;

    mo = null;
    
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

	// let history = await postgres_client.query(`SELECT * FROM history WHERE number = '${number}'`);
    // history = history.rows[0];
    let history = await redis_client.GET(`history-${number}`, (error, reply) => {
        if (error) console.log(error);
        console.log(reply);
    });

    history = JSON.parse(history);

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

	// await postgres_client.query(`INSERT INTO history (number, providers) VALUES ('${history.number}', '${JSON.stringify(history.providers)}') ON CONFLICT (number) DO UPDATE SET providers = '${JSON.stringify(history.providers)}'`);
    await redis_client.SET(`history-${number}`, JSON.stringify(history), (error, reply) => {
        if (error) console.log(error);
        console.log(reply);
    });

    await redis_client.RPUSH(`history-to-postgres`, number, (error, reply) => {
        if (error) console.log(error);
        console.log(reply);
    });

    if (!mo) return history;

    // await postgres_client.query(`INSERT INTO mo (number, balance, date) VALUES ('${mo.number}', '${mo.balance}', '${mo.date}') ON CONFLICT (number) DO UPDATE SET balance = ${mo.balance}, date = '${mo.date}'`);
    await redis_client.SET(`mo-${number}`, mo, (error, reply) => {
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

functions['redis-to-postgres'] = async () => {

    while (true){
        let history = await redis_client.LPOP(`history-to-postgres`, (error, reply) => {
            if (error) console.log(error);
            console.log(reply);
        });

        if (history == null) break;

        history = JSON.parse(history);

        console.log(`Inserting history for ${history.number}`);

        await postgres_client.query(`INSERT INTO history (number, providers) VALUES ('${history.number}', '${JSON.stringify(history.providers)}') ON CONFLICT (number) DO UPDATE SET providers = '${JSON.stringify(history.providers)}'`);
    }
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
    
    let providers_wrapper = await postgres_client.query('SELECT * FROM providers');
    
    providers_wrapper.rows.forEach((provider) => {
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

    let providers = await redis_client.GET(`provider-example`, (error, reply) => {
        if (error) console.log(error);
        console.log(reply);
    });

    delete providers_wrapper

    await functions['sleep'](2000).then((result) => {skip = result;});

    // console.time('Execution time');

    while (true){
        let sms = await redis_client.LPOP(`sms-ranking-${instance}`, (error, reply) => {
            if (error) console.log(error);
            console.log(reply);
        });
    
        let skip = false;
        if (sms == null) {
            // console.timeEnd('Execution time'); break;
            // await functions['sleep'](10000).then((result) => {skip = result;});
            await functions['redis-to-postgres']();
            skip = true;
        }
        if (skip) continue;
    
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
    }
}

functions['main']();