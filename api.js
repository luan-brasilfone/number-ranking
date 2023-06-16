const express = require('express');
const body_parser = require('body-parser');
const redis = require('redis');

const app = express();
const port = 3000;

let redis_client, functions = new Object();

const instances = process.argv[2];

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

	app.listen(port, () => console.log(`\nSMS Ranking app listening at http://localhost:${port}\n`));
}

functions['connect-to-redis'] = async () => {

    redis_client = redis.createClient();
    
    redis_client.on('error', (error) => {
        console.log(`Error: ${error}`);
    });

    redis_client.connect();
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