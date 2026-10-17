export class ModelConfigError extends Error {
  get code() {
    return this.statusCode < 500 ? "invalid_input" : "model_config_error";
  }
  constructor(
    message: string,
    readonly statusCode = 400,
    readonly upstreamStatus?: number,
  ) {
    super(message);
  }
}
