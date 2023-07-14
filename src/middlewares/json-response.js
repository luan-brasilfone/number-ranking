module.exports = (req, res, next) => {

    res.jsonResponse = (data) => {

        if (typeof data === 'string')
            data = { message: data };

        res.json(data);
    };

    next();
};
  