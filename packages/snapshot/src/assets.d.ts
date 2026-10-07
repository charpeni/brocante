declare module '*.svg' {
  const url: string;
  export default url;
}
declare module '*.css';

interface ImportMeta {
  readonly env: { readonly PUBLIC_BUILD_SHA?: string };
}
