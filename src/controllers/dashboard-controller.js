const redis_client = require('../db/redis');

exports.getDashboard = async (req, res) => {

	let dashboard = await redis_client.GET('dashboard');

	return res.json(dashboard);
};

exports.setDashboard = async (req, res) => {
	
	try {
		await redis_client.SADD('operations', 'set-dashboard');
		return res.json({message: 'Dashboard successfully updated', success: true});
	}
	catch (error) {
		return res.jsonResponse('Something went wrong while updating dashboard');
	}
};
