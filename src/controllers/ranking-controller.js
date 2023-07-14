const globals = require('../../config/globals');

const redis_client = require('../db/redis');
const postgres_client = require('../db/postgres');

exports.getRank = async (req, res) => {

	const number = req.params.number;
	if (!number) return res.jsonResponse("No number provided");

	console.log(`${new Date().toLocaleTimeString()} - Getting rank for ${number}`);

	let mo = await redis_client.HGET(`mo`, number);
	if (mo != null) return res.jsonResponse(100);

	let rank = await redis_client.ZSCORE('rank', number);
	if (rank = null) return res.jsonResponse("Number not found")

	return res.json(rank);
};

exports.addToRank = async (req, res) => {
	
	const sms = req.body;
	
	let instance = Math.ceil(Math.random() * globals.instances);

	redis_client.RPUSH(`sms-ranking-${instance}`, JSON.stringify(sms));

	res.jsonResponse("SMS added to ranking");
};

exports.getNumbers = async (req, res) => {

	const number = req.params.number;

	if (number == undefined){

		console.log(`${new Date().toLocaleTimeString()} - Getting numbers`);

		let result = await postgres_client.query(`SELECT COUNT (*), "number" FROM log_history GROUP BY "number" ORDER BY count desc LIMIT 1000`);

		let numbers = {};
		result.rows.forEach(row => {
			numbers[row.number] = {count: row.count};
		});

		return res.json(numbers);
	}

	console.log(`${new Date().toLocaleTimeString()} - Getting number ${number}`);
	let log_list = await postgres_client.query(`SELECT * FROM log_history WHERE number = '${number}' ORDER BY "date" DESC`);

	if (log_list.rows.length == 0)
		return res.jsonResponse('No SMS entries found for that number');

	Object.keys(log_list.rows).forEach(key => {
		log_list.rows[key].date = log_list.rows[key].date.toLocaleString();

		if (log_list.rows[key].status != 'MO' && log_list.rows[key].status != 'default' )
			log_list.rows[key].status = log_list.rows[key].status.slice(1);
	});

	return res.json(log_list.rows);
};
