import CustomError from "../utils/customError.js";

const devErrors = (res, error) => {
  res.status(error.statusCode).json({
    success: error.success,
    message: error.message,
    stackTrace: error.stack,
    error: error,
  });
};

const castErrorHandler = (err) => {
  const message = `Invalid value for ${err.path}: ${err.value}!`;
  return new CustomError(400, message);
};

const duplicateKeyErrorHandler = (err) => {
  const key = Object.keys(err.keyValue)[0];
  const value = err.keyValue[key];

  const message = `The ${key} "${value}" is already in use. Please choose another one.`;

  return new CustomError(400, message);
};

const validationErrorHandler = (err) => {
  const errors = Object.values(err.errors).map((val) => val.message);
  const errorMessages = errors.join(". ");
  const msg = `Invalid input data: ${errorMessages}`;

  return new CustomError(400, msg);
};

const handleExpiredJWT = (err) => {
  return new CustomError(401, "JWT has expired.Please Login again");
};

const handleJWTError = (err) => {
  return new CustomError(401, "Invalid token.Please login again");
};

const prodErrors = (res, error) => {
  if (error.isOperational) {
    res.status(error.statusCode).json({
      success: error.success,
      message: error.message,
    });
  } else {
    res.status(500).json({
      success: false,
      message: "Something went wrong. Please try again later!!!",
    });
  }
};

export const globalErrorHandler = (error, req, res, next) => {
  error.statusCode = error.statusCode || 500;
  error.success = error.success || false;

  // --- LOGGING SECTION (BEFORE TRANSFORMATION IN PRODUCTION) ---
  // This ensures you log the *original* technical error,
  // especially if it's a programming error or a Mongoose error,
  // before it's converted into a user-friendly CustomError.
  if (error.isOperational) {
    // For operational errors, warn is often appropriate.
    // The message is already user-friendly for these.
    logger.warn(
      `Operational Error: ${error.statusCode} - ${error.message} | URL: ${req.originalUrl} | Method: ${req.method} | IP: ${req.ip}`,
      { originalError: error } // Include original error object for more context if logger needs it
    );
  } else {
    // For programming errors (non-operational) or transformed technical errors, use error level.
    logger.error(
      `Programming Error: ${error.statusCode} - ${error.message} | Stack: ${error.stack} | URL: ${req.originalUrl} | Method: ${req.method} | IP: ${req.ip}`,
      { originalError: error } // Include original error object to get all internal details
    );
  }
  // --- END LOGGING SECTION ---

  if (process.env.NODE_ENV === "development") {
    // In development, we want all the juicy details
    devErrors(res, error);
  } else if (process.env.NODE_ENV === "production") {
    // In production, transform specific technical errors into CustomErrors
    // for a user-friendly response, after they've been logged in their original form.
    let transformedError = { ...error }; // Create a mutable copy

    if (transformedError.name === "CastError")
      transformedError = castErrorHandler(transformedError);
    if (transformedError.code === 11000)
      transformedError = duplicateKeyErrorHandler(transformedError);
    if (transformedError.name === "ValidationError")
      transformedError = validationErrorHandler(transformedError);
    if (transformedError.name === "TokenExpiredError")
      transformedError = handleExpiredJWT(transformedError);
    if (transformedError.name === "JsonWebTokenError")
      transformedError = handleJWTError(transformedError);

    prodErrors(res, transformedError);
  }
};

export default globalErrorHandler;
