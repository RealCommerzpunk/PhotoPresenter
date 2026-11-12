/** Dateien, die Vite als Text einbindet (z. B. die Seite der Fernbedienung). */
declare module '*?raw' {
  const content: string
  export default content
}
