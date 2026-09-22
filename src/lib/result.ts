export type Ok<T> = { readonly ok: true; readonly value: T };
export type Err<E> = { readonly ok: false; readonly error: E };
export type Result<T, E = Error> = Ok<T> | Err<E>;

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });
export const err = <E>(error: E): Err<E> => ({ ok: false, error });

/** Settle a promise into a Result without throwing. */
export async function settle<T>(promise: Promise<T>): Promise<Result<T, unknown>> {
  try {
    return ok(await promise);
  } catch (error) {
    return err(error);
  }
}
