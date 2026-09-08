declare module "pg" {
  export interface PoolClient {
    query<T extends Record<string, unknown> = Record<string, unknown>>(
      text: string,
      values?: readonly unknown[],
    ): Promise<{ rows: T[] }>;
  }
}
