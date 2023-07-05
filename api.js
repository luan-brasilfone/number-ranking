const pg = require ('pg');
const redis = require('redis');
const express = require('express');
const body_parser = require('body-parser');
const _ = require('underscore');

let redis_client;

let instances = 1;
if (process.argv[2]) instances = process.argv[2];

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

		env.api_host = env['api_host'];
		env.api_port = env['api_port'];

		env.database_config = {
            host: env['database_host'],
            port: env['database_port'],
            database: env['database_name'],
            user: env['database_user'],
            password: env['database_password']
        };

		env.redis_config = {
			host: env['redis_host'],
			port: env['redis_port']
		};
	} catch (error) {
		console.log('No .env file found. Set one by typing ./set.environment.sh. Using default values...');

		env.api_host = "localhost";
		env.api_port = 3000;

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

const app = express();
const api_host = env['api_host'];
const api_port = env['api_port'];

const database_config = env['database_config'];
const redis_config = env['redis_config'];

let counter = 0;

let functions = new Object();

functions['get-zscore'] = async (number = false) => {

	console.log(`Getting rank for ${number}`);

	if (!number) return 'No number provided';

	let mo = await redis_client.GET(`mo-${number}`);

	if (mo != null) return 100;

	let rank = await redis_client.ZSCORE('rank', number);

	return await rank;
}

functions['rpush-sms'] = async (sms) => {

    let instance = Math.ceil(Math.random() * instances);

	redis_client.RPUSH(`sms-ranking-${instance}`, JSON.stringify(sms));

	counter++;
}

functions['get-providers'] = async (code) => {

	if (code == undefined){
		console.log(`Getting providers`);
		let providers = await functions['redis-scan'](0, {MATCH: 'provider-*', COUNT: '1000'});

		Object.keys(providers).forEach(key => {
			providers[key.replace('provider-', '')] = providers[key];
			delete providers[key];
		});

		return JSON.stringify(providers);
	}
	
	console.log(`Getting provider ${code}`);
	let provider = await redis_client.GET(`provider-${code}`);

	if (provider == null) return 'No provider found';

	return JSON.stringify(await provider);
}

functions['save-provider'] = async (body, method) => {

	let fields = {
		"code": {required: true, type: 'string'},
		"mo": {required: false, type: 'int', default: 100},
		"s200": {required: false, type: 'int', default: 100},
		"s404": {required: true, type: 'int'},
		"s500": {required: true, type: 'int'},
		"s503": {required: true, type: 'int'},
		"default": {required: false, type: 'int', default: 50},
	};

	if (body.hasOwnProperty('CODE')) { body['code'] = body['CODE']; delete body['CODE']; }
	if (body.hasOwnProperty('MO')) { body['mo'] = body['MO']; delete body['MO']; }
	if (body.hasOwnProperty('DEFAULT')) { body['default'] = body['DEFAULT']; delete body['DEFAULT']; }
	
	let row = {};
	
	for (let field in fields) {
		if ( (_.isUndefined(body[field]) || _.isNull(body[field]) || _.isEmpty(body[field].toString())) && fields[field].required )
			return JSON.stringify({message: `Field ${field} is required`});
		
		if (_.isUndefined(body[field]) || _.isNull(body[field])) body[field] = fields[field].default;
		
		if (fields[field].type == 'string') { row[field] = body[field]; continue; }

		if (!Number.isInteger(body[field]))
			return JSON.stringify({message: `Field ${field} must be an integer`});

		if (body[field] < 0 || body[field] > 100)
			return JSON.stringify({message: `Field ${field} must be between 0 and 100`});

		row[field] = body[field];
	}

	let providers = await functions['redis-scan'](0, {MATCH: 'provider-*', COUNT: '1000'});

	if (providers != null && providers[`provider-${body.code}`] != undefined && method == 'POST')
		return JSON.stringify({message: 'Provider code is already registered'});
	if (providers != null && providers[`provider-${body.code}`] == undefined && method == 'PUT')
		return JSON.stringify({message: 'Provider code is not registered'});

	if (providers == null) providers = new Object();

	redis_client.SET(`provider-${body.code}`, JSON.stringify(row));

	redis_client.RPUSH('providers', `sav/${body.code}`);

	return JSON.stringify({message: 'Provider saved', success: true});
}

functions['delete-provider'] = async (code) => {

	if (code == undefined) return JSON.stringify({message: 'No code provided'});

	let provider = await redis_client.GET(`provider-${code}`);

	if (provider == null) return JSON.stringify({message: 'No record found'});

	redis_client.DEL(`provider-${code}`);

	redis_client.LPUSH('providers', `del/${code}`);

	return JSON.stringify({message: 'Provider deleted', success: true});
}

async function getNumbers (number) {

	if (number == undefined){
		console.log(`Getting numbers`);
		let result = await postgres_client.query(`SELECT COUNT (*), "number" FROM log_history GROUP BY "number" ORDER BY count desc LIMIT 1000`);

		let numbers = {};
		result.rows.forEach(row => {
			numbers[row.number] = {count: row.count};
		});

		return JSON.stringify(numbers);
	}

	console.log(`Getting number ${number}`);
	let log_list = await postgres_client.query(`SELECT * FROM log_history WHERE number = '${number}' ORDER BY "date" DESC`);

	if (log_list.rows.length == 0) return { message: 'No SMS entries found for that number' };

	Object.keys(log_list.rows).forEach(key => {
		log_list.rows[key].date = log_list.rows[key].date.toLocaleString();

		if (log_list.rows[key].status != 'MO' && log_list.rows[key].status != 'default' )
			log_list.rows[key].status = log_list.rows[key].status.slice(1);
	});

	// let sms_list = await postgres_client.query(`SELECT * FROM history WHERE substring("number_provider" from 1 for 13) = '${number}'`);

	return JSON.stringify(log_list.rows);
}

functions['get-dashboard'] = async () => {

	let dashboard = await redis_client.GET('dashboard');

	return dashboard;
}

functions['redis-scan'] = async (cursor, options, output = {}) => {

	let scan = await redis_client.SCAN(cursor, options);

	const promises = scan.keys.map(async key => {
		let row = await redis_client.GET(key);
		output[key] = row;
	});

	await Promise.all(promises);

	if (scan.cursor != 0) await functions['redis-scan'](scan.cursor, options, output);

	return output;
}

functions['connect-to-redis'] = async () => {

    redis_client = redis.createClient({ socket: redis_config });
    
    redis_client.on('error', (error) => {
        console.log(`Redis connect error: ${error}`);
    });

    redis_client.connect()
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

functions['start-api'] = async () => {

	await connectToPostgres();
	await functions['connect-to-redis']();

	app.use(body_parser.urlencoded({ extended: false }));
	app.use(body_parser.json());

	app.get('/get-rank/:number?', async (req, res) => {

		res.status(200).send( `${await functions['get-zscore']( req.params.number )}` );
	});

	app.post('/add-to-rank', (req, res) => {

		functions['rpush-sms'](req.body);

		res.status(200).send(`Succesfully added sms to rank ${req.body.numero}`);
	});

	// Providers
	app.get('/providers/:code?', async (req, res) => {

		res.status(200).send( `${await functions['get-providers']( req.params.code )}` );
	});

	app.post('/providers', async (req, res) => {

		res.status(200).send( `${await functions['save-provider'](req.body, 'POST')}` );
	});

	app.put('/providers', async (req, res) => {

		res.status(200).send( `${await functions['save-provider'](req.body, 'PUT')}` );
	});

	app.delete('/providers/:code?', async (req, res) => {

		res.status(200).send( `${await functions['delete-provider'](req.params.code)}` );
	});

	// Numbers
	app.get('/numbers/:number?', async (req, res) => {

		res.status(200).send( `${await getNumbers(req.params.number)}` );
	});

	// Interface

	app.get('/dashboard', async (req, res) => {

		res.status(200).send(`${await functions['get-dashboard']()}`);
	});

	app.listen(api_port, api_host, () => {});

	setInterval(() => {
		console.log(`Added ${counter} SMS to rank on the last minute. Listening at http://${api_host}:${api_port}`);
		counter = 0;
	}, 60000);
}

functions['start-api']();