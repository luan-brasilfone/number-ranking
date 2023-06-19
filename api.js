const express = require('express');
const body_parser = require('body-parser');

const instances = process.argv[2];
const env = JSON.parse(process.argv[3]);
const postgres_client = env['postgres_client'];
const redis_client = env['redis_client'];

const app = express();
const host = env['host'];
const port = env['port'];

let functions = new Object();

functions['start-api'] = async () => {

    await functions['connect-to-redis']();

	app.use(body_parser.urlencoded({ extended: false }));
	app.use(body_parser.json());

	app.get('/get-rank/:number?', async (req, res) => {

		res.status(200).send( `${await functions['get-zscore']( req.params.number )}` );
	});

	app.post('/add-to-rank', (req, res) => {

		functions['rpush-post'](req.body);

		res.status(200).send(`Succesfully added sms to rank ${req.body.numero}`);
	});

	app.listen(port, host, () => console.log(`\nSMS Ranking app listening at http://${host}:${port}\n`));
}

functions['get-zscore'] = async (number = false) => {

	console.log(`Getting rank for ${number}`);

	if (!number) return 'No number provided';

	let rank = await redis_client.ZSCORE('rank', number, (error, reply) => {
		if (error) console.log(error);
		console.log(reply);
	});

	return await rank;
}

functions['rpush-post'] = async (sms) => {

    let instance = Math.ceil(Math.random() * instances);

	redis_client.RPUSH(`sms-ranking-${instance}`, JSON.stringify(sms), (error, reply) => {
		if (error) console.log(error);
		console.log(reply);
	});

	console.log(`Added sms to rank ${sms.numero} on instance ${instance}`);
}

functions['start-api']();