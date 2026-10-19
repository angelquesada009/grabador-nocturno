const botonActivar = document.getElementById("btn-activar");
const mensaje = document.getElementById("mensaje");
const barraNivel = document.getElementById("barra-nivel");

// Ajustes de sensibilidad (se afinan probando en el iPhone).
const SUELO_RUIDO = 3;    // por debajo de este nivel (0-100) se considera silencio
const GANANCIA = 200;     // cuánto se amplifica el volumen
const BAJADA = 0.9;       // 0-1: cuanto más alto, más despacio baja la barra

let stream = null;
let contexto = null;
let analizador = null;
let datos = null;
let nivelSuavizado = 0;
let idAnimacion = null;

// El mismo botón sirve para activar y para parar.
function alternarMicrofono() {
  if (stream) {
    pararMicrofono();
    mensaje.textContent = "Micrófono parado.";
  } else {
    activarMicrofono();
  }
}

async function activarMicrofono() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    mensaje.textContent = "Este navegador no permite usar el micrófono (¿falta HTTPS?).";
    return;
  }

  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    await empezarAMedir();
    mensaje.textContent = "Escuchando…";
    botonActivar.textContent = "Parar micrófono";
  } catch (error) {
    pararMicrofono(); // por si el micro se llegó a abrir antes del fallo
    if (error.name === "NotAllowedError") {
      mensaje.textContent = "Has denegado el permiso. Actívalo en los ajustes del navegador.";
    } else if (error.name === "NotFoundError") {
      mensaje.textContent = "No se ha encontrado ningún micrófono.";
    } else {
      mensaje.textContent = "No se pudo activar el micrófono: " + error.name;
    }
  }
}

// Conecta el micrófono a un "analizador" que nos da el volumen.
async function empezarAMedir() {
  const AudioContextCompatible = window.AudioContext || window.webkitAudioContext;
  contexto = new AudioContextCompatible();
  await contexto.resume(); // Safari a veces lo deja en pausa

  const fuente = contexto.createMediaStreamSource(stream);
  analizador = contexto.createAnalyser();
  analizador.fftSize = 256;
  fuente.connect(analizador);

  datos = new Uint8Array(analizador.fftSize);
  actualizarBarra();
}

// Devuelve el volumen actual como un número de 0 a 100.
function medirNivel() {
  analizador.getByteTimeDomainData(datos);

  // Los valores van de 0 a 255; el silencio está en 128.
  let suma = 0;
  for (let i = 0; i < datos.length; i++) {
    const valor = (datos[i] - 128) / 128; // de -1 a 1
    suma += valor * valor;
  }
  const rms = Math.sqrt(suma / datos.length); // volumen medio, de 0 a 1

  // Amplificamos y quitamos el ruido de fondo (todo lo que sea menor que el suelo).
  const nivel = Math.min(100, rms * GANANCIA);
  return nivel < SUELO_RUIDO ? 0 : nivel;
}

// Se repite unas 60 veces por segundo para mover la barra.
function actualizarBarra() {
  const nivel = medirNivel();
  // Sube rápido con los sonidos, pero baja despacio para que no tiemble.
  nivelSuavizado = Math.max(nivel, nivelSuavizado * BAJADA);
  barraNivel.style.width = nivelSuavizado + "%";
  idAnimacion = requestAnimationFrame(actualizarBarra);
}

// Apaga el micrófono del todo y deja la barra a cero.
function pararMicrofono() {
  if (idAnimacion) {
    cancelAnimationFrame(idAnimacion);
    idAnimacion = null;
  }
  if (stream) {
    stream.getTracks().forEach((pista) => pista.stop());
    stream = null;
  }
  if (contexto) {
    contexto.close();
    contexto = null;
  }
  analizador = null;
  nivelSuavizado = 0;
  barraNivel.style.width = "0%";
  botonActivar.textContent = "Activar micrófono";
}

botonActivar.addEventListener("click", alternarMicrofono);
