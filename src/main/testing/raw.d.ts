// Vite (and therefore electron-vite's main build, and Vitest) resolves any
// import path ending in `?raw` to the file's contents as a plain string, but
// `types: ["electron-vite/node"]` in tsconfig.node.json doesn't pull in
// vite/client's ambient types for it, so it's declared here instead.
declare module '*?raw' {
  const content: string
  export default content
}
