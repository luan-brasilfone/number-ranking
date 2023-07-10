exports.getProviders = async (req, res) => {

	const code = req.params.code;

	if (code == undefined){

		console.log(`${new Date().toLocaleTimeString()} - Getting providers`);

		let providers = await redisScan({ options: {MATCH: 'provider-*', COUNT: '1000'} });

		Object.keys(providers).forEach(key => {
			providers[key.replace('provider-', '')] = providers[key];
			delete providers[key];
		});

		return res.json(providers);
	}
	
	console.log(`${new Date().toLocaleTimeString()} - Getting provider ${code}`);

	let provider = await redis_client.HGET(`provider`, code);

	if (provider == null) return res.jsonResponse('No provider found');

	return res.json(await provider);
};

exports.saveProvider = async (req, res) => {
	
	const body = req.body, method = req.method;

	const fields = {
		"code": 	{required: true, 	type: 'string'},
		"mo": 		{required: false, 	type: 'int', 	default: 100},
		"s200": 	{required: false, 	type: 'int', 	default: 100},
		"s404": 	{required: true, 	type: 'int'},
		"s500": 	{required: true, 	type: 'int'},
		"s503": 	{required: true, 	type: 'int'},
		"default": 	{required: false, 	type: 'int', 	default: 50},
	};

	if (body.hasOwnProperty('CODE')) { body['code'] = body['CODE']; delete body['CODE']; }
	if (body.hasOwnProperty('MO')) { body['mo'] = body['MO']; delete body['MO']; }
	if (body.hasOwnProperty('DEFAULT')) { body['default'] = body['DEFAULT']; delete body['DEFAULT']; }
	
	let row = {};
	
	for (const field in fields) {

		const is_required 	= (_.isUndefined(body[field]) || _.isNull(body[field]) || _.isEmpty(body[field].toString())) && fields[field].required;
		const use_default 	=  _.isUndefined(body[field]) || _.isNull(body[field]);
		const is_string 	= 	 fields[field].type == 'string';
		const is_not_int 	= 	!Number.isInteger(body[field]);
		const invalid_range =   (body[field] < 0 || body[field] > 100);

		if (is_required)
			return res.jsonResponse(`Field ${field} is required`);
		
		if (use_default)
			body[field] = fields[field].default;
		
		if (is_string)
		  	{ row[field] = body[field]; continue; }

		if (is_not_integer)
			return res.jsonResponse(`Field ${field} must be an integer`);

		if (invalid_range)
			return res.jsonResponse(`Field ${field} must be between 0 and 100`);

		row[field] = body[field];
	}

	let providers = await redisScan({ options: {MATCH: 'provider-*', COUNT: '1000'} });

	if (providers){

		const invalid_insert =  	 providers[`provider-${body.code}`] && method == 'POST';
		const invalid_update = 		!providers[`provider-${body.code}`] && method == 'PUT';

		if (invalid_insert)
			return res.jsonResponse('Provider code is already registered');

		if (invalid_update)
			return res.jsonResponse('Provider code is not registered');
	}

	if (providers == null) providers = new Object();

	await redis_client.HSET(`provider`, body.code, JSON.stringify(row));

	await redis_client.RPUSH('persist-provider', `sav/${body.code}`);
	await redis_client.SADD('operations', `persist-provider`);

	return res.json({message: 'Provider saved', success: true});
};

exports.deleteProvider = async (req, res) => {

	const code = req.params.code;

	if (code == undefined) return res.jsonResponse('No code provided');

	let provider = await redis_client.HGET(`provider`, code);

	if (provider == null) return res.jsonResponse('No record found');

	redis_client.HDEL(`provider`, code);

	redis_client.LPUSH('providers', `del/${code}`);
	redis_client.SADD('operations', 'persist-provider');

	return res.json({message: 'Provider deleted', success: true});
};
