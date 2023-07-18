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

	try{
		const possible_platforms = ['BF', 'DP', 'KHOMP', 'MERA'];
		const possible_statuses = ['s200', 's404', 's500', 's503', 'mo', 'default'];

		let sms = req.body;
		let { numero, fornecedor, status, plataforma } = sms;

		const some_field_is_missing = !numero || !fornecedor || !plataforma || !status;
		const some_field_is_not_string = typeof numero + typeof fornecedor + typeof plataforma + typeof status != 'string'.repeat(4);

		if (some_field_is_missing)
			return res.jsonResponse("Some field is missing");

		if (some_field_is_not_string)
			return res.jsonResponse("Some field is not a string");

		const status_is_invalid = !possible_statuses.includes(status);
		const platform_is_invalid = !possible_platforms.includes(plataforma);
		const provider_is_invalid = !await redis_client.HEXISTS('provider', fornecedor);
		const number_is_invalid = !numero.match(/^55[1-9]{2}[0-9]{8}$/) && !numero.match(/^55[1-9]{2}9[0-9]{8}$/);

		if (status_is_invalid) {

			const fixed_number_status = 's' + status;
			const fixed_named_status = status.toLowerCase();

			if (possible_statuses.includes(fixed_number_status))
				status = fixed_number_status;

			if (possible_statuses.includes(fixed_named_status))
				status = fixed_named_status;

			const status_still_invalid = !possible_statuses.includes(status);

			if (status_still_invalid)
				return res.jsonResponse("Invalid status");
		}

		if (platform_is_invalid) {
			
			const fixed_platform = plataforma.toUpperCase();
			const platform_still_invalid = !possible_platforms.includes(fixed_platform);

			if (platform_still_invalid)
				return res.jsonResponse("Invalid platform");

			plataforma = fixed_platform;
		}

		if (provider_is_invalid) {

			const fixed_provider = fornecedor.toLowerCase();
			const provider_still_invalid = !await redis_client.HEXISTS('provider', fixed_provider);

			if (provider_still_invalid)
				return res.jsonResponse("Invalid provider");

			fornecedor = fixed_provider;
		}

		if (number_is_invalid) {

			const fixed_number = numero.replace(/[^0-9]/g, '');
			const number_still_invalid = !fixed_number.match(/^55[1-9]{2}[0-9]{8}$/) && !fixed_number.match(/^55[1-9]{2}9[0-9]{8}$/);

			if (number_still_invalid)
				return res.jsonResponse("Invalid number");
				
			numero = fixed_number;
		}
		
		sms = { numero: numero, fornecedor: fornecedor, plataforma: plataforma, status: status };
			
		let instance = Math.ceil(Math.random() * globals.instances);
		redis_client.RPUSH(`sms-ranking-${instance}`, JSON.stringify(sms));

		return res.jsonResponse("SMS added to ranking");
	}
	catch (error) {
		console.error(error);
		return res.jsonResponse("Something went wrong while adding SMS to rank");
	}
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
