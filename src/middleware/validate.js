import { ApiError } from '../utils/ApiError.js';

// validate(schema) checks req.body; validate(schema, 'query') or 'params' checks those instead.
export const validate = (schema, source = 'body') => (req, _res, next) => {
  const result = schema.safeParse(req[source]);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({
      field: i.path.join('.'),
      message: i.message,
    }));
    return next(new ApiError(400, 'Please check the highlighted fields', details));
  }
  req[source] = result.data; // cleaned data; unknown fields are removed
  next();
};
