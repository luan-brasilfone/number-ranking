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
	console.log('\nNo .env file provided. Using default values...');

	env.host = 'localhost';
	env.port = 3000;
}

const app = express();
const host = env['host'];
const port = env['port'];

let functions = new Object();

functions['get-zscore'] = async (number = false) => {

	console.log(`Getting rank for ${number}`);

	if (!number) return 'No number provided';

	let mo = await redis_client.GET(`mo-${number}`, (error, reply) => {
		if (error) console.log(error);
		console.log(reply);
	});

	if (mo != null) return 100;

	let rank = await redis_client.ZSCORE('rank', number, (error, reply) => {
		if (error) console.log(error);
		console.log(reply);
	});

	return await rank;
}

functions['rpush-sms'] = async (sms) => {

    let instance = Math.ceil(Math.random() * instances);

	redis_client.RPUSH(`sms-ranking-${instance}`, JSON.stringify(sms), (error, reply) => {
		if (error) console.log(error);
		console.log(reply);
	});

	console.log(`Added sms to rank ${sms.numero} on instance ${instance}`);
}

functions['get-providers'] = async (code) => {

	if (code == undefined){
		console.log(`Getting providers`);
		let providers = await functions['redis-scan'](0, {MATCH: 'provider-*'});
		return JSON.stringify(providers);
	}
	
	console.log(`Getting provider ${code}`);
	let provider = await redis_client.GET(`provider-${code}`, (error, reply) => {
		if (error) console.log(error);
		console.log(reply);
	});

	if (provider == null) return 'No provider found';

	return await provider;
}

functions['save-provider'] = async (body, method) => {

	let fields = {
		"code": {required: true, type: 'string'},
		"mo": {required: false, type: 'int', default: 100},
		"200": {required: false, type: 'int', default: 100},
		"404": {required: true, type: 'int'},
		"500": {required: true, type: 'int'},
		"503": {required: true, type: 'int'},
		"default": {required: false, type: 'int', default: 50},
	};

	if (body.hasOwnProperty('CODE')) { body['code'] = body['CODE']; delete body['CODE']; }
	if (body.hasOwnProperty('MO')) { body['mo'] = body['MO']; delete body['MO']; }
	if (body.hasOwnProperty('DEFAULT')) { body['default'] = body['DEFAULT']; delete body['DEFAULT']; }
	
	let row = {};
	
	for (let field in fields) {

		if ( (_.isUndefined(body[field]) || _.isEmpty(body[field].toString())) && fields[field].required)
			return `Field ${field} is required`;
			
		if (_.isUndefined(body[field])) body[field] = fields[field].default;
		
		if (fields[field].type == 'string') { row[field] = body[field]; continue; }

		if (!Number.isInteger(body[field])) return `Field ${field} must be an integer`;
		if (body[field] < 0 || body[field] > 100) return `Field ${field} must be between 0 and 100`;

		row[field] = body[field];
	}

	let providers = await functions['redis-scan'](0, {MATCH: 'provider-*'});

	if (providers != null && providers[`provider-${body.code}`] != undefined && method == 'POST') return 'Provider code is already registered';
	if (providers != null && providers[`provider-${body.code}`] == undefined && method == 'PUT') return 'Provider code is not registered';

	if (providers == null) providers = new Object();

	redis_client.SET(`provider-${body.code}`, JSON.stringify(row), (error, reply) => {
		if (error) console.log(error);
		console.log(reply);
	});

	redis_client.RPUSH('providers', `sav/${body.code}`, (error, reply) => {
		if (error) console.log(error);
		console.log(reply);
	});

	return 'Provider saved';
}

functions['delete-provider'] = async (code) => {

	if (code == undefined) return 'No code provided';

	let provider = await redis_client.GET(`provider-${code}`, (error, reply) => {
		if (error) console.log(error);
		console.log(reply);
	});

	if (provider == null) return 'No provider found';

	redis_client.DEL(`provider-${code}`, (error, reply) => {
		if (error) console.log(error);
		console.log(reply);
	});

	redis_client.LPUSH('providers', `del/${code}`, (error, reply) => {
		if (error) console.log(error);
		console.log(reply);
	});

	return 'Provider deleted';
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

functions['connect-to-redis'] = async () => {

    redis_client = redis.createClient();
    
    redis_client.on('error', (error) => {
        console.log(`Error: ${error}`);
    });

    redis_client.connect();
}

functions['start-api'] = async () => {

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

	app.listen(port, host, () => {});

	setInterval(() => {console.log(`\nSMS Ranking app listening at http://${host}:${port}\n`)}, 30000);
}

functions['start-api']();