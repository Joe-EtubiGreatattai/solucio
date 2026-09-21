module.exports = (schema, source = 'body') => (req, res, next) => {
  const result = schema.safeParse(req[source]);
  if (!result.success) return next(result.error);
  req.validated = { ...(req.validated || {}), [source]: result.data };
  next();
};
