const botonActivar = document.getElementById("btn-activar");
const mensaje = document.getElementById("mensaje");
const barraNivel = document.getElementById("barra-nivel");

let stream = null;
let analizador = null;
let datos = null;

async function activarMicrofono() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    mensaje.textContent = "Este navegador no permite usar el micrófono (¿falta HTTPS?).";
    return;
  }

  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    await empezarAMedir();
    mensaje.textContent = "Escuchando…";
    botonActivar.disabled = true;
  } catch (error) {
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
  const contexto = new AudioContextCompatible();
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

  // Multiplicamos para que los sonidos normales se noten en la barra.
  return Math.min(100, Math.round(rms * 300));
}

// Se repite unas 60 veces por segundo para mover la barra.
function actualizarBarra() {
  barraNivel.style.width = medirNivel() + "%";
  requestAnimationFrame(actualizarBarra);
}

botonActivar.addEventListener("click", activarMicrofono);
