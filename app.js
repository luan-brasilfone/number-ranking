const pg = require('pg');
const redis = require('redis');

let redis_client, postgres_client;

let functions = new Object();

const instance = process.argv[2];
const env = JSON.parse(process.argv[3]);
const config = env['database_config'];

functions['connect-to-postgres'] = async () => {

    postgres_client = new pg.Client(config);
    postgres_client.connect(function (err) {
        if (err) {
            // settings.consoleLog(`=> [connection: ERROR, message: ${err.message}]`);
            console.log(err.message);
        }
    });

    const res = await postgres_client.query('SELECT $1::text as message', ['\nSuccesfully connected to database\n']);
    // console.log(res.rows[0].message);
}

functions['connect-to-redis'] = async () => {

    redis_client = redis.createClient();
    
    redis_client.on('error', (error) => {
        console.log(`Error: ${error}`);
    });

    redis_client.connect();
}

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
        let rank = Math.round(number_average * (2 + leverage));

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

	let provider = await postgres_client.query(`SELECT * FROM providers WHERE code = '${sms.fornecedor}'`);
    provider = provider.rows[0];

	let number = sms.numero;
	let provider_leverage = provider[sms.status.toLowerCase()];

	let rank = provider_leverage;

	let mo = await postgres_client.query(`SELECT * FROM mo WHERE number = '${number}'`);
    mo = mo.rows[0];

	let mo_date = mo ? mo.date : null;
	let mo_balance = mo ? mo.balance : 0;

	if (sms.status == 'MO' && (mo_date == null || functions['get-ymd-date'](mo_date) != functions['get-ymd-date'](new Date())) ) {
		mo_entry = mo ? mo : new Object();
        mo_entry.number = number;
		mo_entry.date = new Date();
		mo_entry.balance = mo_balance + 1001;

		mo = mo_entry;
	}

	if (mo != undefined) {
        console.log(`MO found for ${number}`)
		rank = 100;
		mo.balance--;
		mo.date = functions['get-ymd-date'](mo.date);

        if (mo.balance == 0){
            await postgres_client.query(`DELETE FROM mo WHERE number = '${mo.number}'`);
            mo = undefined;
        }
	}

	let history = await postgres_client.query(`SELECT * FROM history WHERE number = '${number}'`);
    history = history.rows[0];

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

    if (history == undefined ) history = {"number": number};
	if (history.providers == undefined ) history.providers = new Object();
	if (history.providers[provider.code] == undefined) history.providers[provider.code] = new Array();
	
	delete sms.numero;
	delete sms.fornecedor;
	sms.pesoFornecedor = provider_leverage;
	
	if (history.providers[provider.code].length >= 10) history.providers[provider.code].shift();
	history.providers[provider.code].push(sms);
	
	console.log(`Provider leverage for status ${sms.status} is ${provider_leverage}. History length is ${history.providers[provider.code].length}\n`);

	await postgres_client.query(`INSERT INTO history (number, providers) VALUES ('${history.number}', '${JSON.stringify(history.providers)}') ON CONFLICT (number) DO UPDATE SET providers = '${JSON.stringify(history.providers)}'`);

    if (mo == undefined) return history;

    await postgres_client.query(`INSERT INTO mo (number, balance, date) VALUES ('${mo.number}', '${mo.balance}', '${mo.date}') ON CONFLICT (number) DO UPDATE SET balance = ${mo.balance}, date = '${mo.date}'`);

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

functions['main'] = async () => {

    await functions['connect-to-redis']();
    await functions['connect-to-postgres']();

    while (true){
        let sms = await redis_client.LPOP(`sms-ranking-${instance}`, (error, reply) => {
            if (error) console.log(error);
            console.log(reply);
        });
    
        let skip = false;
        if (sms == null) await functions['sleep'](10000).then((result) => {skip = result;});
        if (skip) continue;
    
        sms = JSON.parse(sms);
        let number = sms.numero
    
        let history = await functions['rank-sms'](sms);
        let rank = functions['get-rank'](history);
        
        // console.log(rank, sms.numero)
        await redis_client.ZADD('rank', {"score": rank, "value": number}, (error, reply) => {
            if (error) console.log(error);
            console.log(reply);
        });
    }
}

functions['main']();