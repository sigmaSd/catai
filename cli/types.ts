// Common interface both parsers return
export interface CataiOptions {
  output?: string;
  include?: string[];
  exclude?: string[];
  maxSize: string;
  yes: boolean;
  copy: boolean;
  paths: string[];
}
