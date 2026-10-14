export type FieldError = { field: string; message: string };

export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public errors?: FieldError[],
  ) {
    super(message);
  }
}
