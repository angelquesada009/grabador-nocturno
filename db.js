// Guarda y lee los sonidos en el móvil (IndexedDB). No usa ningún servidor.
// Hay dos "cajones": "sonidos" (hora, duración, noche) y "audios" (el audio en sí).
const BD = (() => {
  let conexion = null;

  function abrir() {
    if (conexion) return conexion;
    conexion = new Promise((ok, fallo) => {
      const peticion = indexedDB.open("grabador-nocturno", 1);
      peticion.onupgradeneeded = () => {
        const bd = peticion.result;
        const sonidos = bd.createObjectStore("sonidos", { keyPath: "id", autoIncrement: true });
        sonidos.createIndex("noche", "noche");
        bd.createObjectStore("audios", { keyPath: "id" });
      };
      peticion.onsuccess = () => ok(peticion.result);
      peticion.onerror = () => fallo(peticion.error);
    });
    return conexion;
  }

  function esperar(peticion) {
    return new Promise((ok, fallo) => {
      peticion.onsuccess = () => ok(peticion.result);
      peticion.onerror = () => fallo(peticion.error);
    });
  }

  async function guardarSonido(datosSonido, audio) {
    const bd = await abrir();
    return new Promise((ok, fallo) => {
      const tx = bd.transaction(["sonidos", "audios"], "readwrite");
      const peticion = tx.objectStore("sonidos").add(datosSonido);
      peticion.onsuccess = () => {
        tx.objectStore("audios").put({ id: peticion.result, datos: audio });
      };
      tx.oncomplete = () => ok();
      tx.onerror = () => fallo(tx.error);
      tx.onabort = () => fallo(tx.error);
    });
  }

  async function listarSonidos() {
    const bd = await abrir();
    return esperar(bd.transaction("sonidos").objectStore("sonidos").getAll());
  }

  async function sonidosDeNoche(noche) {
    const bd = await abrir();
    const indice = bd.transaction("sonidos").objectStore("sonidos").index("noche");
    return esperar(indice.getAll(noche));
  }

  async function leerAudio(id) {
    const bd = await abrir();
    return esperar(bd.transaction("audios").objectStore("audios").get(id));
  }

  async function borrarSonidos(ids) {
    const bd = await abrir();
    return new Promise((ok, fallo) => {
      const tx = bd.transaction(["sonidos", "audios"], "readwrite");
      ids.forEach((id) => {
        tx.objectStore("sonidos").delete(id);
        tx.objectStore("audios").delete(id);
      });
      tx.oncomplete = () => ok();
      tx.onerror = () => fallo(tx.error);
    });
  }

  return { guardarSonido, listarSonidos, sonidosDeNoche, leerAudio, borrarSonidos };
})();
