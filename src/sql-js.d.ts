// Type declarations for sql.js
// This is needed because sql.js doesn't ship its own TypeScript types

declare module 'sql.js' {
    export interface Database {
        exec(sql: string): QueryExecResult[];
        close(): void;
    }

    export interface QueryExecResult {
        columns: string[];
        values: unknown[][];
    }

    export interface SqlJsConfig {
        wasmBinary?: Uint8Array;
        locateFile?: (file: string) => string;
    }

    export default function initSqlJs(config?: SqlJsConfig): Promise<SqlJsFactory>;

    export interface SqlJsFactory {
        Database: new (data?: ArrayLike<number>) => Database;
    }
}
