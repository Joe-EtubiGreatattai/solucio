class AppError extends Error {
  constructor(status, message, fields, data) {
    super(message);
    this.status = status;
    this.fields = fields;
    this.data = data;
  }
}
module.exports = AppError;
