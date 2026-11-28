// The one error type the API turns into a friendly message (code, text and HTTP status).
export class GameError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}
